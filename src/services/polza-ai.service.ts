import { MealSlot } from "@prisma/client";
import OpenAI from "openai";

import { env } from "../config/env";
import { DailyRecipeItem, GeneratedRecipe, PlannedMeal } from "../types/domain";

export class PolzaAiService {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = env.POLZA_AI_API_KEY
      ? new OpenAI({
          apiKey: env.POLZA_AI_API_KEY,
          baseURL: env.POLZA_AI_BASE_URL,
        })
      : null;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async generateRecipe(meal: PlannedMeal): Promise<GeneratedRecipe | null> {
    if (!this.client) {
      return null;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: env.POLZA_AI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Ты оформляешь рецепт для Telegram-бота питания. Верни только JSON без markdown. Структура: {"mealName": string, "ingredients": string[], "steps": [{"index": number, "text": string}]}. Используй только переданные ингредиенты. Шаги должны быть конкретными: если это крупа, укажи пропорцию воды и примерное время; если это мясо/рыба/яйца, укажи нагрев, примерное время и признак готовности. Не пиши общие фразы вроде "до готовности" без уточнений.',
          },
          {
            role: "user",
            content: JSON.stringify({
              mealName: meal.mealName,
              slot: meal.slot,
              ingredients: meal.ingredients.map((ingredient) => ({
                name: ingredient.productName,
                grams: ingredient.grams,
                category: ingredient.category,
              })),
            }),
          },
        ],
      });
      const content = response.choices[0]?.message?.content;

      if (!content) {
        return null;
      }

      return this.parseRecipe(content);
    } catch {
      return null;
    }
  }

  async generateRecipeBundle(meals: PlannedMeal[]): Promise<DailyRecipeItem[] | null> {
    if (!this.client || meals.length === 0) {
      return null;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: env.POLZA_AI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Ты оформляешь рецепты для Telegram-бота питания. Верни только JSON без markdown. Структура: {"recipes":[{"slot":"BREAKFAST|LUNCH|DINNER|SNACK","mealName":string,"ingredients":string[],"steps":[{"index":number,"text":string}]}]}. Используй только переданные блюда и ингредиенты. Никаких выдуманных продуктов. Шаги должны быть конкретными: указывай примерное время, воду/пропорции для круп, интенсивность нагрева и признаки готовности. Не пиши общие фразы вроде "отварите до готовности" или "взбейте яйца" без уточнений.',
          },
          {
            role: "user",
            content: JSON.stringify({
              meals: meals.map((meal) => ({
                slot: meal.slot,
                mealName: meal.mealName,
                ingredients: meal.ingredients.map((ingredient) => ({
                  name: ingredient.productName,
                  grams: ingredient.grams,
                  category: ingredient.category,
                })),
              })),
            }),
          },
        ],
      });
      const content = response.choices[0]?.message?.content;

      if (!content) {
        return null;
      }

      return this.parseRecipeBundle(content);
    } catch {
      return null;
    }
  }

  private parseRecipe(content: string): GeneratedRecipe | null {
    try {
      const parsed = JSON.parse(content) as Partial<GeneratedRecipe>;

      if (typeof parsed.mealName !== "string" || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.steps)) {
        return null;
      }

      const steps = parsed.steps
        .map((step, index) => {
          if (typeof step !== "object" || step === null || typeof step.text !== "string") {
            return null;
          }

          return {
            index: typeof step.index === "number" ? step.index : index + 1,
            text: step.text.trim(),
          };
        })
        .filter((step): step is GeneratedRecipe["steps"][number] => step !== null && step.text.length > 0);

      if (steps.length === 0) {
        return null;
      }

      return {
        mealName: parsed.mealName.trim(),
        ingredients: parsed.ingredients.filter((ingredient): ingredient is string => typeof ingredient === "string"),
        steps,
      };
    } catch {
      return null;
    }
  }

  private parseRecipeBundle(content: string): DailyRecipeItem[] | null {
    try {
      const parsed = JSON.parse(content) as { recipes?: unknown };

      if (!Array.isArray(parsed.recipes)) {
        return null;
      }

      const recipes = parsed.recipes
        .map((item) => {
          if (
            typeof item !== "object" ||
            item === null ||
            !("slot" in item) ||
            typeof item.slot !== "string" ||
            !isMealSlot(item.slot)
          ) {
            return null;
          }

          const recipe = this.parseRecipe(JSON.stringify(item));

          if (!recipe) {
            return null;
          }

          return {
            slot: item.slot,
            recipe,
          } satisfies DailyRecipeItem;
        })
        .filter((item): item is DailyRecipeItem => item !== null);

      return recipes.length > 0 ? recipes : null;
    } catch {
      return null;
    }
  }
}

function isMealSlot(value: string): value is MealSlot {
  return Object.values(MealSlot).includes(value as MealSlot);
}
