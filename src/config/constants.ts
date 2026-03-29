import { Budget, Goal, MealSlot } from "@prisma/client";

export const SLOT_DISTRIBUTION: Record<MealSlot, number> = {
  [MealSlot.BREAKFAST]: 0.25,
  [MealSlot.LUNCH]: 0.35,
  [MealSlot.DINNER]: 0.25,
  [MealSlot.SNACK]: 0.15,
};

export const SLOT_ORDER: MealSlot[] = [
  MealSlot.BREAKFAST,
  MealSlot.LUNCH,
  MealSlot.DINNER,
  MealSlot.SNACK,
];

export const SLOT_LABELS: Record<MealSlot, string> = {
  [MealSlot.BREAKFAST]: "Завтрак",
  [MealSlot.LUNCH]: "Обед",
  [MealSlot.DINNER]: "Ужин",
  [MealSlot.SNACK]: "Перекус",
};

export const GOAL_LABELS: Record<Goal, string> = {
  [Goal.LOSE]: "похудение",
  [Goal.MAINTAIN]: "поддержание",
  [Goal.GAIN]: "набор",
};

export const BUDGET_LABELS: Record<Budget, string> = {
  [Budget.CHEAP]: "дешево",
  [Budget.MID]: "средне",
  [Budget.HIGH]: "дорого",
};

export const GOAL_CHOICES = [
  { label: "Похудение", value: Goal.LOSE },
  { label: "Поддержание", value: Goal.MAINTAIN },
  { label: "Набор", value: Goal.GAIN },
] as const;

export const BUDGET_CHOICES = [
  { label: "Дешево", value: Budget.CHEAP },
  { label: "Средне", value: Budget.MID },
  { label: "Дорого", value: Budget.HIGH },
] as const;

export const TOGGLE_CHOICES = [
  { label: "Да", value: true },
  { label: "Нет", value: false },
] as const;

export const MAIN_ACTIONS = {
  generate: "Сгенерировать день",
  profile: "Профиль",
  editProfile: "Обновить профиль",
} as const;

export const BUDGET_RANK: Record<Budget, number> = {
  [Budget.CHEAP]: 0,
  [Budget.MID]: 1,
  [Budget.HIGH]: 2,
};

export const MAX_ALLOWED_DEVIATION = 0.05;
