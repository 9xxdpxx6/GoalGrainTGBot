import { User } from "@prisma/client";

import { BUDGET_LABELS, GOAL_LABELS, SLOT_LABELS } from "../config/constants";
import { DailyPlan, GeneratedRecipe } from "../types/domain";
import { formatIngredientAmount } from "../utils/portion-hints";
import { formatRestrictionList } from "../utils/restrictions";

export class TextService {
  formatProfile(user: User): string {
    const limitations = formatRestrictionList(user.limitations);

    return [
      "<b>Профиль</b>",
      "<blockquote>",
      `<b>Вес:</b> ${escapeHtml(String(user.weightKg))} кг`,
      `<b>Рост:</b> ${escapeHtml(String(user.heightCm))} см`,
      `<b>Цель:</b> ${escapeHtml(GOAL_LABELS[user.goal])}`,
      `<b>Калорийность:</b> ${escapeHtml(String(user.targetCalories))} ккал`,
      `<b>Бюджет:</b> ${escapeHtml(BUDGET_LABELS[user.budget])}`,
      `<b>Джанк-фуд:</b> ${user.allowJunkFood ? "разрешен" : "выключен"}`,
      `<b>Ограничения:</b> ${escapeHtml(limitations.length > 0 ? limitations.join(", ") : "нет")}`,
      "</blockquote>",
      "Поля меняются кнопками под этим сообщением.",
    ].join("\n");
  }

  formatDailyPlan(user: User, plan: DailyPlan, options?: { replacedSlot?: string }): string {
    const limitations = formatRestrictionList(plan.limitations);
    const status = plan.withinTolerance
      ? "План укладывается в допуск ±5% по калориям и каждому макроэлементу."
      : `Это лучший найденный вариант из текущей базы, но он не укладывается в допуск ±5%: ${this.describeDeviationOverflow(plan)}.`;

    const summary = [
      options?.replacedSlot ? `<b>Рацион обновлен: ${escapeHtml(options.replacedSlot)}</b>` : "<b>Рацион на день</b>",
      "<blockquote>",
      `<b>Цель:</b> ${escapeHtml(GOAL_LABELS[user.goal])}`,
      `<b>Таргет:</b> ${escapeHtml(String(plan.target.calories))} ккал`,
      `<b>Бюджет:</b> ${escapeHtml(BUDGET_LABELS[plan.budget])}`,
      `<b>Итог по калориям:</b> ${escapeHtml(String(plan.totals.calories))} ккал (${this.formatSignedDiff(plan.totals.calories, plan.target.calories)})`,
      `<b>Белки:</b> ${escapeHtml(String(plan.totals.protein))} г при цели ${escapeHtml(String(plan.target.protein))} г (${this.formatSignedDiff(plan.totals.protein, plan.target.protein)})`,
      `<b>Жиры:</b> ${escapeHtml(String(plan.totals.fat))} г при цели ${escapeHtml(String(plan.target.fat))} г (${this.formatSignedDiff(plan.totals.fat, plan.target.fat)})`,
      `<b>Углеводы:</b> ${escapeHtml(String(plan.totals.carbs))} г при цели ${escapeHtml(String(plan.target.carbs))} г (${this.formatSignedDiff(plan.totals.carbs, plan.target.carbs)})`,
      `<b>Джанк-фуд:</b> ${plan.allowJunkFood ? "включен" : "выключен"}`,
      `<b>Ограничения:</b> ${escapeHtml(limitations.length > 0 ? limitations.join(", ") : "нет")}`,
      `<b>Статус:</b> ${escapeHtml(status)}`,
      "</blockquote>",
    ];

    const meals = plan.meals.flatMap((meal) => [
      "",
      `<b>${escapeHtml(SLOT_LABELS[meal.slot])}</b>`,
      `<i>${escapeHtml(meal.mealName)}</i>`,
      `${escapeHtml(String(meal.calories))} ккал | Б ${escapeHtml(String(meal.protein))} | Ж ${escapeHtml(String(meal.fat))} | У ${escapeHtml(String(meal.carbs))}`,
      "<blockquote expandable>",
      ...meal.ingredients.map((ingredient) =>
        `• ${escapeHtml(formatIngredientAmount(ingredient.productName, ingredient.grams, ingredient.category))}${ingredient.isJunkFood ? " [джанк]" : ""}`,
      ),
      "</blockquote>",
    ]);

    return [...summary, ...meals].join("\n").trim();
  }

  formatRecipe(slotLabel: string, recipe: GeneratedRecipe, options?: { index?: number; total?: number }): string {
    const position =
      options?.index !== undefined && options?.total !== undefined
        ? ` <i>${options.index + 1}/${options.total}</i>`
        : "";

    return [
      `<b>Рецепт: ${escapeHtml(slotLabel.toLowerCase())}</b>${position}`,
      `<i>${escapeHtml(recipe.mealName)}</i>`,
      "",
      "<b>Ингредиенты</b>",
      "<blockquote expandable>",
      ...recipe.ingredients.map((ingredient) => `• ${escapeHtml(ingredient)}`),
      "</blockquote>",
      "",
      "<b>Шаги</b>",
      ...recipe.steps.map((step) => `${step.index}. ${escapeHtml(step.text)}`),
    ].join("\n");
  }

  formatGenerationFailure(errorMessage: string): string {
    return `<b>Не удалось собрать рацион.</b>\n<blockquote>${escapeHtml(errorMessage)}</blockquote>`;
  }

  private describeDeviationOverflow(plan: DailyPlan): string {
    const problems = [
      this.metricOverflow("калории", plan.totals.calories, plan.target.calories, plan.deviations.caloriesPct),
      this.metricOverflow("белки", plan.totals.protein, plan.target.protein, plan.deviations.proteinPct),
      this.metricOverflow("жиры", plan.totals.fat, plan.target.fat, plan.deviations.fatPct),
      this.metricOverflow("углеводы", plan.totals.carbs, plan.target.carbs, plan.deviations.carbsPct),
    ].filter(Boolean);

    return problems.length > 0 ? problems.join(", ") : "отклонения незначительные";
  }

  private metricOverflow(
    label: string,
    actual: number,
    target: number,
    absoluteDeviationPct: number,
  ): string | null {
    if (absoluteDeviationPct <= 0.05) {
      return null;
    }

    return `${label}: ${this.formatSignedDiff(actual, target)}`;
  }

  private formatSignedDiff(actual: number, target: number): string {
    const delta = roundForDisplay(actual - target);

    if (target <= 0) {
      return `${delta >= 0 ? "+" : ""}${delta}`;
    }

    const pct = roundForDisplay((delta / target) * 100);
    return `${delta >= 0 ? "+" : ""}${delta} / ${pct >= 0 ? "+" : ""}${pct}%`;
  }
}

function roundForDisplay(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
