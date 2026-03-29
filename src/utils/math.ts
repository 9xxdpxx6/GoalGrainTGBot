import { MacroDeviation, MacroTargets } from "../types/domain";

export function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function deviation(actual: number, target: number): number {
  if (target <= 0) {
    return 0;
  }

  return Math.abs(actual - target) / target;
}

export function macroDeviation(actual: MacroTargets, target: MacroTargets): MacroDeviation {
  return {
    caloriesPct: deviation(actual.calories, target.calories),
    proteinPct: deviation(actual.protein, target.protein),
    fatPct: deviation(actual.fat, target.fat),
    carbsPct: deviation(actual.carbs, target.carbs),
  };
}

export function sumMacros(values: MacroTargets[]): MacroTargets {
  return values.reduce<MacroTargets>(
    (accumulator, current) => ({
      calories: round(accumulator.calories + current.calories),
      protein: round(accumulator.protein + current.protein),
      fat: round(accumulator.fat + current.fat),
      carbs: round(accumulator.carbs + current.carbs),
    }),
    {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    },
  );
}
