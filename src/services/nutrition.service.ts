import { Goal, MealSlot } from "@prisma/client";

import { SLOT_DISTRIBUTION } from "../config/constants";
import { MacroTargets } from "../types/domain";
import { round } from "../utils/math";

const GOAL_CONFIG: Record<
  Goal,
  {
    proteinPerKg: number;
    fatPerKg: number;
    fallbackRatio: { protein: number; fat: number; carbs: number };
  }
> = {
  [Goal.LOSE]: {
    proteinPerKg: 2,
    fatPerKg: 0.8,
    fallbackRatio: { protein: 0.3, fat: 0.25, carbs: 0.45 },
  },
  [Goal.MAINTAIN]: {
    proteinPerKg: 1.8,
    fatPerKg: 0.9,
    fallbackRatio: { protein: 0.27, fat: 0.28, carbs: 0.45 },
  },
  [Goal.GAIN]: {
    proteinPerKg: 1.8,
    fatPerKg: 1,
    fallbackRatio: { protein: 0.25, fat: 0.25, carbs: 0.5 },
  },
};

export class NutritionService {
  estimateTargetCalories(input: {
    weightKg: number;
    heightCm: number;
    goal: Goal;
  }): number {
    const maintenanceBase = input.weightKg * 29 + Math.max(input.heightCm - 170, 0) * 2;
    const goalAdjustment =
      input.goal === Goal.LOSE ? -350 : input.goal === Goal.GAIN ? 300 : 0;

    return this.roundCalories(this.clamp(maintenanceBase + goalAdjustment, 1400, 3600));
  }

  calculateDailyTargets(input: {
    weightKg: number;
    goal: Goal;
    targetCalories: number;
  }): MacroTargets {
    const config = GOAL_CONFIG[input.goal];

    let protein = round(input.weightKg * config.proteinPerKg);
    let fat = round(input.weightKg * config.fatPerKg);
    let carbs = round((input.targetCalories - protein * 4 - fat * 9) / 4);

    if (carbs < 40) {
      protein = round((input.targetCalories * config.fallbackRatio.protein) / 4);
      fat = round((input.targetCalories * config.fallbackRatio.fat) / 9);
      carbs = round((input.targetCalories * config.fallbackRatio.carbs) / 4);
    }

    return {
      calories: input.targetCalories,
      protein,
      fat,
      carbs,
    };
  }

  calculateSlotTargets(target: MacroTargets): Record<MealSlot, MacroTargets> {
    return {
      [MealSlot.BREAKFAST]: {
        calories: round(target.calories * SLOT_DISTRIBUTION[MealSlot.BREAKFAST]),
        protein: round(target.protein * SLOT_DISTRIBUTION[MealSlot.BREAKFAST]),
        fat: round(target.fat * SLOT_DISTRIBUTION[MealSlot.BREAKFAST]),
        carbs: round(target.carbs * SLOT_DISTRIBUTION[MealSlot.BREAKFAST]),
      },
      [MealSlot.LUNCH]: {
        calories: round(target.calories * SLOT_DISTRIBUTION[MealSlot.LUNCH]),
        protein: round(target.protein * SLOT_DISTRIBUTION[MealSlot.LUNCH]),
        fat: round(target.fat * SLOT_DISTRIBUTION[MealSlot.LUNCH]),
        carbs: round(target.carbs * SLOT_DISTRIBUTION[MealSlot.LUNCH]),
      },
      [MealSlot.DINNER]: {
        calories: round(target.calories * SLOT_DISTRIBUTION[MealSlot.DINNER]),
        protein: round(target.protein * SLOT_DISTRIBUTION[MealSlot.DINNER]),
        fat: round(target.fat * SLOT_DISTRIBUTION[MealSlot.DINNER]),
        carbs: round(target.carbs * SLOT_DISTRIBUTION[MealSlot.DINNER]),
      },
      [MealSlot.SNACK]: {
        calories: round(target.calories * SLOT_DISTRIBUTION[MealSlot.SNACK]),
        protein: round(target.protein * SLOT_DISTRIBUTION[MealSlot.SNACK]),
        fat: round(target.fat * SLOT_DISTRIBUTION[MealSlot.SNACK]),
        carbs: round(target.carbs * SLOT_DISTRIBUTION[MealSlot.SNACK]),
      },
    };
  }

  private roundCalories(value: number): number {
    return Math.round(value / 50) * 50;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
