import { Budget, Goal, MealSlot, ProductCategory } from "@prisma/client";

export interface ProfileInput {
  weightKg: number;
  heightCm: number;
  goal: Goal;
  targetCalories: number;
  budget: Budget;
  allowJunkFood: boolean;
  limitations: string[];
}

export interface MacroTargets {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface MacroDeviation {
  caloriesPct: number;
  proteinPct: number;
  fatPct: number;
  carbsPct: number;
}

export interface MealIngredientRef {
  productId: number;
  grams: number;
}

export interface PlannedIngredient extends MealIngredientRef {
  productName: string;
  role: "protein" | "carb" | "fat" | "vegetable" | "fruit" | "junk" | "drink";
  category: ProductCategory;
  isJunkFood: boolean;
  restrictionTags: string[];
}

export interface PlannedMeal {
  slot: MealSlot;
  mealKey: string;
  templateKey: string;
  mealName: string;
  priceCategory: Budget;
  scaleFactor: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  tags: string[];
  ingredients: PlannedIngredient[];
}

export interface DailyPlan {
  generatedAt: string;
  budget: Budget;
  limitations: string[];
  allowJunkFood: boolean;
  target: MacroTargets;
  totals: MacroTargets;
  deviations: MacroDeviation;
  withinTolerance: boolean;
  meals: PlannedMeal[];
}

export interface RecipeStep {
  index: number;
  text: string;
}

export interface GeneratedRecipe {
  mealName: string;
  ingredients: string[];
  steps: RecipeStep[];
}

export interface DailyRecipeItem {
  slot: MealSlot;
  recipe: GeneratedRecipe;
}
