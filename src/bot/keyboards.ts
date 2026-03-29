import { Markup } from "telegraf";

import { BUDGET_CHOICES, GOAL_CHOICES, MAIN_ACTIONS, SLOT_LABELS, TOGGLE_CHOICES } from "../config/constants";
import { DailyPlan } from "../types/domain";

export function mainKeyboard() {
  return Markup.keyboard([
    [MAIN_ACTIONS.generate, MAIN_ACTIONS.profile],
    [MAIN_ACTIONS.editProfile],
  ]).resize();
}

export function goalKeyboard() {
  return Markup.keyboard(GOAL_CHOICES.map((choice) => [choice.label])).resize().oneTime();
}

export function budgetKeyboard() {
  return Markup.keyboard(BUDGET_CHOICES.map((choice) => [choice.label])).resize().oneTime();
}

export function yesNoKeyboard() {
  return Markup.keyboard(TOGGLE_CHOICES.map((choice) => [choice.label])).resize().oneTime();
}

export function removeKeyboard() {
  return Markup.removeKeyboard();
}

export function dayPlanKeyboard(plan: DailyPlan, planLogId: string) {
  return Markup.inlineKeyboard([
    ...plan.meals.map((meal) => [
      Markup.button.callback(`Заменить: ${SLOT_LABELS[meal.slot]}`, `regen:${meal.slot}:${planLogId}`),
    ]),
    [Markup.button.callback("Рецепты", `recipes:${planLogId}`)],
  ]);
}

export function recipeNavigationKeyboard(recipeLogId: string, index: number, total: number) {
  const previousIndex = (index - 1 + total) % total;
  const nextIndex = (index + 1) % total;

  return Markup.inlineKeyboard([
    [
      Markup.button.callback("◀", `recipe_nav:${recipeLogId}:${previousIndex}`),
      Markup.button.callback(`${index + 1}/${total}`, "recipe_nav:noop"),
      Markup.button.callback("▶", `recipe_nav:${recipeLogId}:${nextIndex}`),
    ],
  ]);
}

export function profileInlineKeyboard(allowJunkFood: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Вес", "edit_field:weight"),
      Markup.button.callback("Рост", "edit_field:height"),
    ],
    [
      Markup.button.callback("Цель", "edit_field:goal"),
      Markup.button.callback("Калории", "edit_field:calories"),
    ],
    [
      Markup.button.callback("Бюджет", "edit_field:budget"),
      Markup.button.callback("Ограничения", "edit_field:restrictions"),
    ],
    [
      Markup.button.callback(
        allowJunkFood ? "Выключить джанк-фуд" : "Включить джанк-фуд",
        "toggle_junk_food",
      ),
    ],
  ]);
}
