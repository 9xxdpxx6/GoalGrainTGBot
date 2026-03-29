import { ActionType, Budget, Goal, MealSlot, User } from "@prisma/client";
import { Context, session, Telegraf } from "telegraf";
import { InlineKeyboardMarkup } from "telegraf/types";

import { MAIN_ACTIONS, SLOT_LABELS } from "../config/constants";
import { env, requireEnvValue } from "../config/env";
import { LogRepository } from "../repositories/log.repository";
import { ProductRepository } from "../repositories/product.repository";
import { UserRepository } from "../repositories/user.repository";
import { DailyPlan, ProfileInput } from "../types/domain";
import {
  applyRestrictionInput,
  formatRestrictionList,
  parseRestrictions,
  readRestrictionList,
} from "../utils/restrictions";
import {
  budgetKeyboard,
  dayPlanKeyboard,
  goalKeyboard,
  mainKeyboard,
  profileInlineKeyboard,
  recipeNavigationKeyboard,
  removeKeyboard,
  yesNoKeyboard,
} from "./keyboards";
import { LoggingService } from "../services/logging.service";
import { MealPlanService } from "../services/meal-plan.service";
import { NutritionService } from "../services/nutrition.service";
import { PolzaAiService } from "../services/polza-ai.service";
import { ProfileService } from "../services/profile.service";
import { RecipeService } from "../services/recipe.service";
import { TextService } from "../services/text.service";

type WizardMode = "register" | "edit_profile";
type WizardStep = "weight" | "height" | "goal" | "calories" | "budget" | "restrictions" | "junk";
type EditableField = Exclude<WizardStep, "junk">;

interface WizardState {
  mode: WizardMode;
  step: WizardStep;
  draft: Partial<ProfileInput>;
  singleField: boolean;
}

interface BotSession {
  wizard: WizardState | null;
  lastPlan: DailyPlan | null;
}

interface BotContext extends Context {
  session: BotSession;
}

type ReplyOptions = Parameters<Context["reply"]>[1];
type EditOptions = {
  reply_markup?: InlineKeyboardMarkup;
};

const defaultSession = (): BotSession => ({
  wizard: null,
  lastPlan: null,
});

const goalMap = new Map<string, Goal>([
  ["похудение", Goal.LOSE],
  ["поддержание", Goal.MAINTAIN],
  ["набор", Goal.GAIN],
]);

const budgetMap = new Map<string, Budget>([
  ["дешево", Budget.CHEAP],
  ["средне", Budget.MID],
  ["дорого", Budget.HIGH],
]);

const toggleMap = new Map<string, boolean>([
  ["да", true],
  ["нет", false],
]);

const pendingPlanMessages = new Set<string>();

export function createBot() {
  const loggingService = new LoggingService(new LogRepository());
  const profileService = new ProfileService(new UserRepository());
  const nutritionService = new NutritionService();
  const mealPlanService = new MealPlanService(new ProductRepository(), nutritionService);
  const textService = new TextService();
  const recipeService = new RecipeService(new PolzaAiService());

  const bot = new Telegraf<BotContext>(requireEnvValue(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN"));

  bot.use(session<BotSession, BotContext>({ defaultSession }));
  bot.use(async (ctx, next) => {
    if (env.NODE_ENV !== "production") {
      const updateTypes = Object.keys(ctx.update).filter((key) => key !== "update_id");
      console.log("Telegram update received:", {
        updateId: ctx.update.update_id,
        updateTypes,
        fromId: ctx.from?.id,
      });
    }

    return next();
  });
  bot.use(async (ctx, next) => {
    if (ctx.from?.id) {
      await profileService.touchLastSeen(ctx.from.id);
    }

    return next();
  });

  bot.start(async (ctx) => {
    const userId = requireUserId(ctx);
    const user = await profileService.getProfile(userId);

    if (user) {
      const message = [
        "Профиль уже заполнен.",
        textService.formatProfile(user),
        "",
        "Используйте /generate или кнопку «Сгенерировать день» в меню.",
      ].join("\n");

      await loggingService.logAction({
        userId,
        actionType: ActionType.REGISTER,
        inputData: { source: "/start", mode: "returning_user" },
        outputData: { message },
      });

      await replyHtml(ctx, message, mainKeyboard());
      return;
    }

    await startWizard(ctx, loggingService, nutritionService, "register");
  });

  bot.command("profile", async (ctx) => {
    await showProfile(ctx, profileService, textService, loggingService, nutritionService);
  });

  bot.command("generate", async (ctx) => {
    await generateDay(ctx, profileService, mealPlanService, textService, loggingService, nutritionService);
  });

  bot.hears(MAIN_ACTIONS.profile, async (ctx) => {
    await showProfile(ctx, profileService, textService, loggingService, nutritionService);
  });

  bot.hears(MAIN_ACTIONS.generate, async (ctx) => {
    await generateDay(ctx, profileService, mealPlanService, textService, loggingService, nutritionService);
  });

  bot.hears(MAIN_ACTIONS.editProfile, async (ctx) => {
    await showProfile(ctx, profileService, textService, loggingService, nutritionService);
  });

  bot.action(/^edit_field:(weight|height|goal|calories|budget|restrictions)$/, async (ctx) => {
    const userId = requireUserId(ctx);
    const user = await profileService.getProfile(userId);

    if (!user) {
      await ctx.answerCbQuery();
      await ctx.reply("Сначала заполните профиль.", mainKeyboard());
      await startWizard(ctx, loggingService, nutritionService, "register");
      return;
    }

    const field = ctx.match[1] as EditableField;
    await ctx.answerCbQuery();
    await startSingleFieldEdit(ctx, loggingService, field, user, nutritionService);
  });

  bot.action("toggle_junk_food", async (ctx) => {
    const userId = requireUserId(ctx);
    const user = await profileService.getProfile(userId);

    if (!user) {
      await ctx.answerCbQuery();
      await ctx.reply("Сначала заполните профиль.", mainKeyboard());
      return;
    }

    const updatedUser = await profileService.setAllowJunkFood(userId, !user.allowJunkFood);
    ctx.session.lastPlan = null;

    await loggingService.logAction({
      userId,
      actionType: ActionType.EDIT_PROFILE,
      inputData: {
        source: "toggle_junk_food",
        previousValue: user.allowJunkFood,
      },
      outputData: {
        updatedValue: updatedUser.allowJunkFood,
        profile: toProfileSnapshot(updatedUser),
      },
    });

    await ctx.answerCbQuery();
    await replyHtml(ctx, textService.formatProfile(updatedUser), profileInlineKeyboard(updatedUser.allowJunkFood));
  });

  bot.action(/^regen:(BREAKFAST|LUNCH|DINNER|SNACK):(\d+)$/, async (ctx) => {
    const userId = requireUserId(ctx);
    const slot = ctx.match[1] as MealSlot;
    const planLogId = ctx.match[2];
    const callbackMessageKey = getCallbackMessageKey(ctx);
    const user = await profileService.getProfile(userId);
    const plan = await resolvePlanFromLog(ctx, loggingService, userId, planLogId);

    if (!user) {
      await ctx.answerCbQuery();
      await ctx.reply("Сначала заполните профиль.", mainKeyboard());
      return;
    }

    if (!plan) {
      await ctx.answerCbQuery();
      await ctx.reply(
        "Не удалось найти исходный рацион для этой кнопки. Сгенерируйте день заново и повторите замену.",
        mainKeyboard(),
      );
      return;
    }

    if (callbackMessageKey && pendingPlanMessages.has(callbackMessageKey)) {
      await ctx.answerCbQuery();
      return;
    }

    try {
      if (callbackMessageKey) {
        pendingPlanMessages.add(callbackMessageKey);
      }

      await ctx.answerCbQuery();
      await editInlineKeyboard(ctx);
      const previousPlan = plan;
      const updatedPlan = await mealPlanService.regenerateMeal(user, previousPlan, slot);
      const message = textService.formatDailyPlan(user, updatedPlan, {
        replacedSlot: SLOT_LABELS[slot],
      });

      ctx.session.lastPlan = updatedPlan;

      const planLog = await loggingService.logAction({
        userId,
        actionType: ActionType.REGENERATE_MEAL,
        inputData: { slot, previousPlan },
        outputData: { message, plan: updatedPlan },
      });

      await editHtml(ctx, message, dayPlanKeyboard(updatedPlan, planLog.logId.toString()));
    } catch (error) {
      console.error("Meal regeneration failed:", error);
      const message = textService.formatGenerationFailure(
        error instanceof Error ? error.message : "Неизвестная ошибка.",
      );

      await loggingService.logAction({
        userId,
        actionType: ActionType.REGENERATE_MEAL,
        inputData: { slot, previousPlan: ctx.session.lastPlan },
        outputData: { error: message },
      });

      await editInlineKeyboard(ctx, dayPlanKeyboard(plan, planLogId).reply_markup);
      await replyHtml(ctx, message, mainKeyboard());
    } finally {
      if (callbackMessageKey) {
        pendingPlanMessages.delete(callbackMessageKey);
      }
    }
  });

  bot.action(/^recipe:(BREAKFAST|LUNCH|DINNER|SNACK):(\d+)$/, async (ctx) => {
    const userId = requireUserId(ctx);
    const slot = ctx.match[1] as MealSlot;
    const planLogId = ctx.match[2];
    const callbackMessageKey = getCallbackMessageKey(ctx);
    const plan = await resolvePlanFromLog(ctx, loggingService, userId, planLogId);

    if (!plan) {
      await ctx.answerCbQuery();
      await ctx.reply(
        "Не удалось найти исходный рацион для этой кнопки. Сгенерируйте день заново и повторите запрос рецепта.",
        mainKeyboard(),
      );
      return;
    }

    const meal = plan.meals.find((item) => item.slot === slot);
    const originalKeyboard = dayPlanKeyboard(plan, planLogId);

    if (!meal) {
      await ctx.answerCbQuery();
      await ctx.reply("Не удалось найти выбранный прием пищи в последнем рационе.", mainKeyboard());
      return;
    }

    if (callbackMessageKey && pendingPlanMessages.has(callbackMessageKey)) {
      await ctx.answerCbQuery();
      return;
    }

    try {
      if (callbackMessageKey) {
        pendingPlanMessages.add(callbackMessageKey);
      }

      await ctx.answerCbQuery("Готовлю рецепт...");
      await editInlineKeyboard(ctx);

      const recipe = await recipeService.buildRecipe(meal);
      const message = textService.formatRecipe(SLOT_LABELS[slot], recipe);

      await loggingService.logAction({
        userId,
        actionType: ActionType.REQUEST_RECIPE,
        inputData: { slot, mealKey: meal.mealKey },
        outputData: { message, recipe },
      });

      await replyHtml(ctx, message, mainKeyboard());
    } catch (error) {
      console.error("Recipe generation failed:", error);
      const message = error instanceof Error ? error.message : "Не удалось подготовить рецепт.";
      await ctx.reply(message, mainKeyboard());
    } finally {
      await editInlineKeyboard(ctx, originalKeyboard.reply_markup);

      if (callbackMessageKey) {
        pendingPlanMessages.delete(callbackMessageKey);
      }
    }
  });

  bot.action(/^recipes:(\d+)$/, async (ctx) => {
    const userId = requireUserId(ctx);
    const planLogId = ctx.match[1];
    const callbackMessageKey = getCallbackMessageKey(ctx);
    const plan = await resolvePlanFromLog(ctx, loggingService, userId, planLogId);
    let loadingMessage: { chat: { id: number }; message_id: number } | null = null;

    if (!plan) {
      await ctx.answerCbQuery();
      await ctx.reply(
        "Не удалось найти исходный рацион для этой кнопки. Сгенерируйте день заново и повторите запрос рецептов.",
        mainKeyboard(),
      );
      return;
    }

    if (callbackMessageKey && pendingPlanMessages.has(callbackMessageKey)) {
      await ctx.answerCbQuery();
      return;
    }

    const originalKeyboard = dayPlanKeyboard(plan, planLogId);

    try {
      if (callbackMessageKey) {
        pendingPlanMessages.add(callbackMessageKey);
      }

      await ctx.answerCbQuery();
      await editInlineKeyboard(ctx);
      loadingMessage = await ctx.reply(buildRecipeLoadingMessage(), {
        parse_mode: "HTML",
      });

      const recipes = await recipeService.buildRecipeBundle(plan);
      const firstRecipe = recipes[0];

      if (!firstRecipe) {
        throw new Error("Не удалось подготовить рецепты для текущего рациона.");
      }

      const message = textService.formatRecipe(SLOT_LABELS[firstRecipe.slot], firstRecipe.recipe, {
        index: 0,
        total: recipes.length,
      });
      const recipeLog = await loggingService.logAction({
        userId,
        actionType: ActionType.REQUEST_RECIPE,
        inputData: {
          sourcePlanLogId: planLogId,
          mealKeys: plan.meals.map((meal) => ({ slot: meal.slot, mealKey: meal.mealKey })),
        },
        outputData: {
          message,
          recipes,
          sourcePlanLogId: planLogId,
        },
      });

      const navigationKeyboard = recipeNavigationKeyboard(recipeLog.logId.toString(), 0, recipes.length);

      if (loadingMessage) {
        await ctx.telegram.editMessageText(loadingMessage.chat.id, loadingMessage.message_id, undefined, message, {
          parse_mode: "HTML",
          reply_markup: navigationKeyboard.reply_markup,
        });
      } else {
        await replyHtml(ctx, message, navigationKeyboard);
      }
    } catch (error) {
      console.error("Recipe bundle generation failed:", error);
      const message = error instanceof Error ? error.message : "Не удалось подготовить рецепты.";
      const errorHtml = `<b>Не удалось подготовить рецепты.</b>\n<blockquote>${escapeHtml(message)}</blockquote>`;

      if (loadingMessage) {
        await ctx.telegram.editMessageText(loadingMessage.chat.id, loadingMessage.message_id, undefined, errorHtml, {
          parse_mode: "HTML",
        });
      } else {
        await replyHtml(ctx, errorHtml, mainKeyboard());
      }
    } finally {
      await editInlineKeyboard(ctx, originalKeyboard.reply_markup);

      if (callbackMessageKey) {
        pendingPlanMessages.delete(callbackMessageKey);
      }
    }
  });

  bot.action(/^recipe_nav:(\d+):(\d+)$/, async (ctx) => {
    const userId = requireUserId(ctx);
    const recipeLogId = ctx.match[1];
    const requestedIndex = Number(ctx.match[2]);
    const recipes = await loggingService.getRecipeBundleByLogId(recipeLogId, userId);

    if (!recipes || recipes.length === 0) {
      await ctx.answerCbQuery();
      await ctx.reply("Не удалось найти сохраненные рецепты. Нажмите «Рецепты» еще раз на сообщении с рационом.", mainKeyboard());
      return;
    }

    const normalizedIndex = ((requestedIndex % recipes.length) + recipes.length) % recipes.length;
    const selectedRecipe = recipes[normalizedIndex];
    const message = textService.formatRecipe(SLOT_LABELS[selectedRecipe.slot], selectedRecipe.recipe, {
      index: normalizedIndex,
      total: recipes.length,
    });

    await ctx.answerCbQuery();
    await editHtml(ctx, message, {
      reply_markup: recipeNavigationKeyboard(recipeLogId, normalizedIndex, recipes.length).reply_markup,
    });
  });

  bot.action("recipe_nav:noop", async (ctx) => {
    await ctx.answerCbQuery();
  });

  bot.action(/^regen:(BREAKFAST|LUNCH|DINNER|SNACK)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Это кнопка из старого сообщения. Сгенерируйте рацион заново, и после этого замена будет редактировать текущее сообщение.",
      mainKeyboard(),
    );
  });

  bot.action(/^recipe:(BREAKFAST|LUNCH|DINNER|SNACK)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Это кнопка из старого сообщения. Сгенерируйте рацион заново, и после этого рецепт будет открываться корректно.",
      mainKeyboard(),
    );
  });

  bot.on("text", async (ctx) => {
    if (ctx.session.wizard) {
      await handleWizardInput(ctx, profileService, nutritionService, textService, loggingService);
      return;
    }

    const helpMessage = [
      "Доступные действия:",
      "/start",
      "/profile",
      "/generate",
      "",
      "Или используйте кнопки в меню Telegram.",
    ].join("\n");

    await ctx.reply(helpMessage, mainKeyboard());
  });

  bot.catch(async (error, ctx) => {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка.";

    if (ctx.from?.id) {
      await loggingService.logAction({
        userId: ctx.from.id,
        actionType: ActionType.GENERATE_DAY,
        inputData: { source: "bot.catch" },
        outputData: { error: message },
      });
    }

    await ctx.reply(`Ошибка: ${message}`, mainKeyboard());
  });

  return bot;
}

async function showProfile(
  ctx: BotContext,
  profileService: ProfileService,
  textService: TextService,
  loggingService: LoggingService,
  nutritionService: NutritionService,
) {
  const userId = requireUserId(ctx);
  const user = await profileService.getProfile(userId);

  if (!user) {
    await startWizard(ctx, loggingService, nutritionService, "register");
    return;
  }

  const message = textService.formatProfile(user);

  await loggingService.logAction({
    userId,
    actionType: ActionType.EDIT_PROFILE,
    inputData: {
      source: "/profile",
      mode: "view",
    },
    outputData: {
      message,
      profile: toProfileSnapshot(user),
    },
  });

  await replyHtml(ctx, message, profileInlineKeyboard(user.allowJunkFood));
}

async function generateDay(
  ctx: BotContext,
  profileService: ProfileService,
  mealPlanService: MealPlanService,
  textService: TextService,
  loggingService: LoggingService,
  nutritionService: NutritionService,
) {
  const userId = requireUserId(ctx);
  const user = await profileService.getProfile(userId);

  if (!user) {
    await startWizard(ctx, loggingService, nutritionService, "register");
    return;
  }

  if (ctx.session.wizard) {
    await ctx.reply("Сначала завершите заполнение профиля.", removeKeyboard());
    return;
  }

  try {
    const recentPlans = await loggingService.getRecentPlans(userId, 6);
    const plan = await mealPlanService.generateDailyPlan(user, { recentPlans });
    const message = textService.formatDailyPlan(user, plan);
    ctx.session.lastPlan = plan;

    const planLog = await loggingService.logAction({
      userId,
      actionType: ActionType.GENERATE_DAY,
      inputData: {
        profile: toProfileSnapshot(user),
      },
      outputData: {
        message,
        plan,
      },
    });

    await replyHtml(ctx, message, dayPlanKeyboard(plan, planLog.logId.toString()));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Неизвестная ошибка.";
    const recommendedCalories = nutritionService.estimateTargetCalories({
      weightKg: user.weightKg,
      heightCm: user.heightCm,
      goal: user.goal,
    });
    const message = [
      textService.formatGenerationFailure(reason),
      "",
      `Сейчас в профиле стоит ${user.targetCalories} ккал.`,
      `Расчетный ориентир для ваших параметров: ${recommendedCalories} ккал.`,
      "Изменить калории можно в профиле кнопкой «Калории».",
    ].join("\n");

    await loggingService.logAction({
      userId,
      actionType: ActionType.GENERATE_DAY,
      inputData: {
        profile: toProfileSnapshot(user),
      },
      outputData: {
        error: message,
      },
    });

    await replyHtml(ctx, message, mainKeyboard());
  }
}

async function startWizard(
  ctx: BotContext,
  loggingService: LoggingService,
  nutritionService: NutritionService,
  mode: WizardMode,
  existingUser?: User,
) {
  const userId = requireUserId(ctx);

  ctx.session.wizard = {
    mode,
    step: "weight",
    singleField: false,
    draft: existingUser ? draftFromUser(existingUser) : {},
  };
  ctx.session.lastPlan = null;

  const message =
    mode === "register"
      ? "Заполним профиль. Введите вес в кг, например 78."
      : "Обновим профиль. Введите вес в кг, например 78.";

  await loggingService.logAction({
    userId,
    actionType: mode === "register" ? ActionType.REGISTER : ActionType.EDIT_PROFILE,
    inputData: {
      step: "weight",
      source: mode === "register" ? "/start" : "edit_profile",
    },
    outputData: {
      status: "prompted",
      message,
      recommendedCalories: estimateDraftCalories(ctx.session.wizard.draft, nutritionService),
    },
  });

  await ctx.reply(message, removeKeyboard());
}

async function startSingleFieldEdit(
  ctx: BotContext,
  loggingService: LoggingService,
  field: EditableField,
  user: User,
  nutritionService: NutritionService,
) {
  const userId = requireUserId(ctx);
  const draft = draftFromUser(user);

  ctx.session.wizard = {
    mode: "edit_profile",
    step: field,
    singleField: true,
    draft,
  };
  ctx.session.lastPlan = null;

  const message = buildStepPrompt(field, draft, nutritionService, true);

  await loggingService.logAction({
    userId,
    actionType: ActionType.EDIT_PROFILE,
    inputData: {
      source: "inline_edit",
      step: field,
    },
    outputData: {
      status: "prompted",
      message,
    },
  });

  await ctx.reply(message, keyboardForStep(field));
}

async function handleWizardInput(
  ctx: BotContext,
  profileService: ProfileService,
  nutritionService: NutritionService,
  textService: TextService,
  loggingService: LoggingService,
) {
  const state = ctx.session.wizard;

  if (!state) {
    return;
  }

  const userId = requireUserId(ctx);
  const rawText = (ctx.text ?? "").trim();
  const actionType = state.mode === "register" ? ActionType.REGISTER : ActionType.EDIT_PROFILE;

  try {
    switch (state.step) {
      case "weight": {
        const weight = Number(rawText.replace(",", "."));
        assertRange(weight, 35, 300, "Вес должен быть числом от 35 до 300 кг.");
        state.draft.weightKg = weight;

        if (state.singleField) {
          recalculateDraftCalories(state.draft, nutritionService);
          await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
            step: "weight",
            value: rawText,
            autoCalories: true,
          });
          return;
        }

        state.step = "height";

        await loggingService.logAction({
          userId,
          actionType,
          inputData: { step: "weight", value: rawText },
          outputData: { status: "accepted", parsedValue: weight },
        });

        await ctx.reply("Введите рост в см, например 180.", removeKeyboard());
        return;
      }
      case "height": {
        const height = Number(rawText.replace(",", "."));
        assertRange(height, 120, 240, "Рост должен быть числом от 120 до 240 см.");
        state.draft.heightCm = Math.round(height);

        if (state.singleField) {
          recalculateDraftCalories(state.draft, nutritionService);
          await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
            step: "height",
            value: rawText,
            autoCalories: true,
          });
          return;
        }

        state.step = "goal";

        await loggingService.logAction({
          userId,
          actionType,
          inputData: { step: "height", value: rawText },
          outputData: { status: "accepted", parsedValue: state.draft.heightCm },
        });

        await ctx.reply("Выберите цель.", goalKeyboard());
        return;
      }
      case "goal": {
        const goal = goalMap.get(rawText.toLowerCase());

        if (!goal) {
          throw new Error("Выберите цель кнопкой: Похудение, Поддержание или Набор.");
        }

        state.draft.goal = goal;
        recalculateDraftCalories(state.draft, nutritionService);

        if (state.singleField) {
          await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
            step: "goal",
            value: rawText,
            autoCalories: true,
          });
          return;
        }

        state.step = "budget";

        await loggingService.logAction({
          userId,
          actionType,
          inputData: { step: "goal", value: rawText },
          outputData: {
            status: "accepted",
            parsedValue: goal,
            calculatedCalories: state.draft.targetCalories,
          },
        });

        await ctx.reply(
          `Целевая калорийность рассчитана автоматически: ${state.draft.targetCalories} ккал.\nЕсли захотите поменять вручную, откройте профиль и нажмите «Калории».\n\nТеперь выберите бюджет.`,
          budgetKeyboard(),
        );
        return;
      }
      case "calories": {
        const calories = Number(rawText.replace(",", "."));
        assertRange(calories, 1200, 3600, "Калорийность должна быть числом от 1200 до 3600.");
        state.draft.targetCalories = Math.round(calories);
        await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
          step: "calories",
          value: rawText,
        });
        return;
      }
      case "budget": {
        const budget = budgetMap.get(rawText.toLowerCase());

        if (!budget) {
          throw new Error("Выберите бюджет кнопкой: Дешево, Средне или Дорого.");
        }

        state.draft.budget = budget;

        if (state.singleField) {
          await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
            step: "budget",
            value: rawText,
          });
          return;
        }

        state.step = "restrictions";

        await loggingService.logAction({
          userId,
          actionType,
          inputData: { step: "budget", value: rawText },
          outputData: { status: "accepted", parsedValue: budget },
        });

        await ctx.reply('Введите ограничения через запятую или "нет". Пример: без лактозы, без свинины.', removeKeyboard());
        return;
      }
      case "restrictions": {
        const limitations = state.singleField
          ? applyRestrictionInput(state.draft.limitations ?? [], rawText)
          : parseRestrictions(rawText);
        state.draft.limitations = limitations;

        if (state.singleField) {
          await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
            step: "restrictions",
            value: rawText,
          });
          return;
        }

        state.step = "junk";

        await loggingService.logAction({
          userId,
          actionType,
          inputData: { step: "restrictions", value: rawText },
          outputData: { status: "accepted", parsedValue: limitations },
        });

        await ctx.reply(
          "Разрешать джанк-фуд в перекусах? Если включено, бот сможет использовать снеки вроде сникерса, чипсов или энергетика.",
          yesNoKeyboard(),
        );
        return;
      }
      case "junk": {
        const allowJunkFood = toggleMap.get(rawText.toLowerCase());

        if (allowJunkFood === undefined) {
          throw new Error("Выберите вариант кнопкой: Да или Нет.");
        }

        state.draft.allowJunkFood = allowJunkFood;

        await finalizeWizard(ctx, profileService, textService, loggingService, actionType, {
          step: "junk",
          value: rawText,
        });
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка ввода.";

    await loggingService.logAction({
      userId,
      actionType,
      inputData: {
        step: state.step,
        value: rawText,
      },
      outputData: {
        status: "validation_error",
        message,
      },
    });

    await ctx.reply(message, keyboardForStep(state.step));
  }
}

async function finalizeWizard(
  ctx: BotContext,
  profileService: ProfileService,
  textService: TextService,
  loggingService: LoggingService,
  actionType: ActionType,
  inputData: Record<string, unknown>,
) {
  const state = ctx.session.wizard;

  if (!state) {
    return;
  }

  const userId = requireUserId(ctx);
  const profile = normalizeProfileInput(state.draft);
  const savedUser = await profileService.saveProfile(userId, profile);
  const message = [
    state.mode === "register" ? "Профиль сохранен." : "Профиль обновлен.",
    textService.formatProfile(savedUser),
    "",
    "Для генерации используйте /generate или кнопку «Сгенерировать день» в меню.",
  ].join("\n");

  await loggingService.logAction({
    userId,
    actionType,
    inputData,
    outputData: {
      status: "completed",
      profile,
      message,
    },
  });

  ctx.session.wizard = null;
  ctx.session.lastPlan = null;
  await replyHtml(ctx, message, profileInlineKeyboard(savedUser.allowJunkFood));
}

function keyboardForStep(step: WizardStep) {
  if (step === "goal") {
    return goalKeyboard();
  }

  if (step === "budget") {
    return budgetKeyboard();
  }

  if (step === "junk") {
    return yesNoKeyboard();
  }

  return removeKeyboard();
}

function buildStepPrompt(
  step: EditableField,
  draft: Partial<ProfileInput>,
  nutritionService: NutritionService,
  singleField: boolean,
) {
  switch (step) {
    case "weight":
      return singleField ? "Введите новый вес в кг, например 78." : "Введите вес в кг, например 78.";
    case "height":
      return singleField ? "Введите новый рост в см, например 180." : "Введите рост в см, например 180.";
    case "goal":
      return "Выберите цель.";
    case "calories": {
      const recommended = estimateDraftCalories(draft, nutritionService);
      return recommended
        ? `Введите новую калорийность в пределах 1200-3600 ккал.\nРасчетный ориентир: ${recommended} ккал.`
        : "Введите новую калорийность в пределах 1200-3600 ккал.";
    }
    case "budget":
      return "Выберите бюджет.";
    case "restrictions": {
      if (!singleField) {
        return 'Введите ограничения через запятую или "нет". Пример: без лактозы, без свинины.';
      }

      const currentRestrictions = formatRestrictionList(draft.limitations ?? []);
      const currentLabel = currentRestrictions.length > 0 ? currentRestrictions.join(", ") : "нет";

      return [
        `Текущие ограничения: ${currentLabel}.`,
        "Можно прислать одно сообщение с несколькими действиями.",
        "Примеры:",
        "+ без морепродуктов",
        "+ без лактозы",
        "- без рыбы",
        "+ говядина",
        "= без глютена, без орехов",
        "нет",
      ].join("\n");

      return [
        `Текущие ограничения: ${currentLabel}.`,
        "По умолчанию новый ввод добавляется к текущему списку.",
        'Примеры:',
        '+ без морепродуктов, без лактозы',
        '- без рыбы',
        '= без глютена, без орехов',
        'нет',
      ].join("\n");
    }
  }
}

function draftFromUser(user: User): Partial<ProfileInput> {
  return {
    weightKg: user.weightKg,
    heightCm: user.heightCm,
    goal: user.goal,
    targetCalories: user.targetCalories,
    budget: user.budget,
    allowJunkFood: user.allowJunkFood,
    limitations: readRestrictionList(user.limitations),
  };
}

function recalculateDraftCalories(draft: Partial<ProfileInput>, nutritionService: NutritionService) {
  const calories = estimateDraftCalories(draft, nutritionService);

  if (calories) {
    draft.targetCalories = calories;
  }
}

function estimateDraftCalories(
  draft: Partial<ProfileInput>,
  nutritionService: NutritionService,
): number | null {
  if (draft.weightKg === undefined || draft.heightCm === undefined || draft.goal === undefined) {
    return null;
  }

  return nutritionService.estimateTargetCalories({
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    goal: draft.goal,
  });
}

function toProfileSnapshot(user: User) {
  return {
    weightKg: user.weightKg,
    heightCm: user.heightCm,
    goal: user.goal,
    targetCalories: user.targetCalories,
    budget: user.budget,
    allowJunkFood: user.allowJunkFood,
    limitations: readRestrictionList(user.limitations),
  };
}

function assertRange(value: number, min: number, max: number, message: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(message);
  }
}

function normalizeProfileInput(draft: Partial<ProfileInput>): ProfileInput {
  if (
    draft.weightKg === undefined ||
    draft.heightCm === undefined ||
    draft.goal === undefined ||
    draft.targetCalories === undefined ||
    draft.budget === undefined ||
    draft.limitations === undefined ||
    draft.allowJunkFood === undefined
  ) {
    throw new Error("Профиль заполнен не полностью.");
  }

  return {
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    goal: draft.goal,
    targetCalories: draft.targetCalories,
    budget: draft.budget,
    allowJunkFood: draft.allowJunkFood,
    limitations: draft.limitations,
  };
}

function requireUserId(ctx: Context): number {
  if (!ctx.from?.id) {
    throw new Error("Telegram user id is missing in the update.");
  }

  return ctx.from.id;
}

async function resolvePlanFromLog(
  ctx: BotContext,
  loggingService: LoggingService,
  userId: number,
  planLogId: string,
) {
  const restoredPlan = await loggingService.getPlanByLogId(planLogId, userId);

  if (restoredPlan) {
    ctx.session.lastPlan = restoredPlan;
  }

  return restoredPlan;
}

async function replyHtml(ctx: BotContext, message: string, options?: ReplyOptions) {
  await ctx.reply(message, {
    parse_mode: "HTML",
    ...(options ?? {}),
  });
}

async function editHtml(ctx: BotContext, message: string, options?: EditOptions) {
  await ctx.editMessageText(message, {
    parse_mode: "HTML",
    reply_markup: options?.reply_markup,
  });
}

async function editInlineKeyboard(ctx: BotContext, replyMarkup?: InlineKeyboardMarkup) {
  await ctx.editMessageReplyMarkup(replyMarkup);
}

function getCallbackMessageKey(ctx: BotContext): string | null {
  const callbackMessage = ctx.callbackQuery && "message" in ctx.callbackQuery ? ctx.callbackQuery.message : null;

  if (!callbackMessage || typeof callbackMessage.message_id !== "number") {
    return null;
  }

  return `${callbackMessage.chat.id}:${callbackMessage.message_id}`;
}

function buildRecipeLoadingMessage(): string {
  const variants = [
    "<b>Ищу удачный рецепт...</b>\n<blockquote>Проверяю ингредиенты и собираю понятные шаги без лишней воды.</blockquote>",
    "<b>Подбираю способ приготовления...</b>\n<blockquote>Сейчас разложу блюда по шагам, времени и базовым пропорциям.</blockquote>",
    "<b>Собираю рецепты...</b>\n<blockquote>Сверяю продукты, граммовки и перевожу все в нормальный человеческий рецепт.</blockquote>",
    "<b>Думаю над приготовлением...</b>\n<blockquote>Ищу внятные шаги, чтобы можно было сразу идти готовить.</blockquote>",
  ];

  return variants[Math.floor(Math.random() * variants.length)] ?? variants[0];
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
