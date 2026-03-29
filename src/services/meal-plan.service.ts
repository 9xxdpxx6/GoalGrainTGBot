import { Budget, MealSlot, Product, ProductCategory, User } from "@prisma/client";

import { BUDGET_RANK, MAX_ALLOWED_DEVIATION, SLOT_ORDER } from "../config/constants";
import { ProductRepository } from "../repositories/product.repository";
import { DailyPlan, MacroTargets, PlannedIngredient, PlannedMeal } from "../types/domain";
import { macroDeviation, round, sumMacros } from "../utils/math";
import { readRestrictionList, readTagList } from "../utils/restrictions";

import { NutritionService } from "./nutrition.service";

type SlotRole = "protein" | "carb" | "fat" | "vegetable" | "fruit" | "junk" | "drink";

interface SlotTemplate {
  key: string;
  roles: SlotRole[];
}

interface CatalogProduct {
  product: Product;
  restrictionTags: string[];
  usageTags: string[];
}

interface CandidateIngredient {
  product: CatalogProduct;
  grams: number;
  role: SlotRole;
}

interface CandidateMeal {
  meal: PlannedMeal;
  score: number;
}

interface SlotTargets {
  [MealSlot.BREAKFAST]: MacroTargets;
  [MealSlot.LUNCH]: MacroTargets;
  [MealSlot.DINNER]: MacroTargets;
  [MealSlot.SNACK]: MacroTargets;
}

interface PlanSearchResult {
  selected: CandidateMeal[];
  totals: MacroTargets;
  score: number;
}

interface MealPlanOptions {
  recentPlans?: DailyPlan[];
}

const SLOT_TAGS: Record<MealSlot, string> = {
  [MealSlot.BREAKFAST]: "breakfast",
  [MealSlot.LUNCH]: "lunch",
  [MealSlot.DINNER]: "dinner",
  [MealSlot.SNACK]: "snack",
};

const SLOT_TEMPLATES: Record<MealSlot, SlotTemplate[]> = {
  [MealSlot.BREAKFAST]: [
    { key: "breakfast_protein_carb_fruit", roles: ["protein", "carb", "fruit"] },
    { key: "breakfast_protein_carb_fat", roles: ["protein", "carb", "fat"] },
    { key: "breakfast_protein_fruit_fat", roles: ["protein", "fruit", "fat"] },
    { key: "breakfast_protein_carb_vegetable", roles: ["protein", "carb", "vegetable"] },
  ],
  [MealSlot.LUNCH]: [
    { key: "lunch_protein_carb_vegetable_fat", roles: ["protein", "carb", "vegetable", "fat"] },
    { key: "lunch_protein_carb_vegetable", roles: ["protein", "carb", "vegetable"] },
  ],
  [MealSlot.DINNER]: [
    { key: "dinner_protein_carb_vegetable_fat", roles: ["protein", "carb", "vegetable", "fat"] },
    { key: "dinner_protein_carb_vegetable", roles: ["protein", "carb", "vegetable"] },
    { key: "dinner_protein_vegetable_fat", roles: ["protein", "vegetable", "fat"] },
  ],
  [MealSlot.SNACK]: [
    { key: "snack_protein_fruit", roles: ["protein", "fruit"] },
    { key: "snack_protein_carb", roles: ["protein", "carb"] },
    { key: "snack_fruit_fat", roles: ["fruit", "fat"] },
    { key: "snack_junk", roles: ["junk"] },
    { key: "snack_junk_drink", roles: ["junk", "drink"] },
  ],
};

const ROLE_LIMITS: Record<SlotRole, number> = {
  protein: 10,
  carb: 8,
  fat: 6,
  vegetable: 8,
  fruit: 8,
  junk: 6,
  drink: 2,
};

const ROLE_CALORIE_SHARE: Record<MealSlot, Record<SlotRole, number>> = {
  [MealSlot.BREAKFAST]: {
    protein: 0.38,
    carb: 0.32,
    fat: 0.2,
    vegetable: 0.08,
    fruit: 0.18,
    junk: 0.65,
    drink: 0.2,
  },
  [MealSlot.LUNCH]: {
    protein: 0.4,
    carb: 0.32,
    fat: 0.12,
    vegetable: 0.08,
    fruit: 0.1,
    junk: 0.55,
    drink: 0.15,
  },
  [MealSlot.DINNER]: {
    protein: 0.42,
    carb: 0.28,
    fat: 0.12,
    vegetable: 0.08,
    fruit: 0.1,
    junk: 0.5,
    drink: 0.15,
  },
  [MealSlot.SNACK]: {
    protein: 0.45,
    carb: 0.32,
    fat: 0.2,
    vegetable: 0.08,
    fruit: 0.22,
    junk: 0.85,
    drink: 0.35,
  },
};

const CORE_REPLACEMENT_CATEGORIES = new Set<ProductCategory>([
  ProductCategory.MEAT,
  ProductCategory.FISH,
  ProductCategory.SEAFOOD,
  ProductCategory.EGG,
  ProductCategory.DAIRY,
  ProductCategory.LEGUME,
  ProductCategory.GRAIN,
  ProductCategory.BREAD,
  ProductCategory.FRUIT,
  ProductCategory.NUT,
  ProductCategory.SNACK,
  ProductCategory.SWEET,
]);

export class MealPlanService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly nutritionService: NutritionService,
  ) {}

  async generateDailyPlan(user: User, options?: MealPlanOptions): Promise<DailyPlan> {
    const restrictions = readRestrictionList(user.limitations);
    const target = this.nutritionService.calculateDailyTargets({
      weightKg: user.weightKg,
      goal: user.goal,
      targetCalories: user.targetCalories,
    });
    const slotTargets = this.nutritionService.calculateSlotTargets(target) as SlotTargets;
    const catalog = await this.loadCatalog(user.budget, restrictions, user.allowJunkFood);
    const candidateMap = this.buildCandidateMap(slotTargets, catalog);
    const latestPlanMeals = options?.recentPlans?.[0]?.meals ?? [];
    const results =
      this.findForcedVariationPlans(slotTargets, target, candidateMap, latestPlanMeals) ??
      this.findTopPlans(slotTargets, target, candidateMap, options?.recentPlans?.length ? 4000 : 160);

    if (results.length === 0) {
      throw new Error("Не удалось подобрать рацион из текущего каталога под ваш профиль.");
    }

    const selectedPlan =
      this.pickPlanVariant(
        results,
        options?.recentPlans?.map((plan) => this.dailyMeaningfulSignature(plan.meals)) ?? [],
        options?.recentPlans?.flatMap((plan) => plan.meals.map((meal) => this.coreMealSignature(meal) || this.meaningfulMealSignature(meal))) ??
          [],
        options?.recentPlans?.map((plan) => this.dailyPlanSignature(plan.meals)) ?? [],
        latestPlanMeals,
      ) ?? results[0];

    return this.toDailyPlan(selectedPlan.selected, target, user.budget, restrictions, user.allowJunkFood);
  }

  async regenerateMeal(user: User, currentPlan: DailyPlan, slot: MealSlot): Promise<DailyPlan> {
    const restrictions = readRestrictionList(user.limitations);
    const target = this.nutritionService.calculateDailyTargets({
      weightKg: user.weightKg,
      goal: user.goal,
      targetCalories: user.targetCalories,
    });
    const slotTargets = this.nutritionService.calculateSlotTargets(target) as SlotTargets;
    const catalog = await this.loadCatalog(user.budget, restrictions, user.allowJunkFood);
    const lockedMeals = new Map<MealSlot, CandidateMeal>();
    const currentMeal = currentPlan.meals.find((meal) => meal.slot === slot);

    if (!currentMeal) {
      throw new Error("Нечего заменять: сначала сгенерируйте рацион.");
    }

    for (const meal of currentPlan.meals) {
      if (meal.slot !== slot) {
        lockedMeals.set(meal.slot, { meal, score: 0 });
      }
    }

    const candidateMap = this.buildCandidateMap(slotTargets, catalog, {
      excludeMealKey: currentMeal.mealKey,
      lockedMeals,
    });
    const substantialReplacementCandidates = candidateMap[slot].filter((candidate) =>
      this.isSubstantiallyDifferentMeal(currentMeal, candidate.meal),
    );

    if (substantialReplacementCandidates.length === 0) {
      throw new Error("Подходящей заметной замены для этого приема пищи не нашлось.");
    }

    candidateMap[slot] = substantialReplacementCandidates;
    const results = this.findTopPlans(slotTargets, target, candidateMap, 32);

    if (results.length === 0) {
      throw new Error("Не удалось заменить прием пищи без выхода за рамки текущих ограничений.");
    }

    const meaningfulResults = results.filter((result) => {
      const updatedMeal = result.selected.find((candidate) => candidate.meal.slot === slot)?.meal;

      return updatedMeal ? this.isSubstantiallyDifferentMeal(currentMeal, updatedMeal) : false;
    });

    if (meaningfulResults.length === 0) {
      throw new Error("Подходящей заметной замены для этого приема пищи не нашлось.");
    }

    const selectedPlan = this.pickPlanVariant(meaningfulResults) ?? meaningfulResults[0];
    const updatedPlan = this.toDailyPlan(selectedPlan.selected, target, user.budget, restrictions, user.allowJunkFood);
    const updatedMeal = updatedPlan.meals.find((meal) => meal.slot === slot);

    if (!updatedMeal || updatedMeal.mealKey === currentMeal.mealKey) {
      throw new Error("Подходящей альтернативы для этого приема пищи не нашлось.");
    }

    return updatedPlan;
  }

  private async loadCatalog(
    maxBudget: Budget,
    restrictions: string[],
    allowJunkFood: boolean,
  ): Promise<CatalogProduct[]> {
    const products = await this.productRepository.findAll();

    return products
      .map((product) => ({
        product,
        restrictionTags: this.deriveRestrictionTags(product),
        usageTags: readTagList(product.usageTags),
      }))
      .filter((entry) => BUDGET_RANK[entry.product.priceCategory] <= BUDGET_RANK[maxBudget])
      .filter((entry) => allowJunkFood || !entry.product.isJunkFood)
      .filter((entry) => !this.hasAnyRestriction(entry.restrictionTags, restrictions));
  }

  private buildCandidateMap(
    slotTargets: SlotTargets,
    catalog: CatalogProduct[],
    options?: {
      excludeMealKey?: string;
      lockedMeals?: Map<MealSlot, CandidateMeal>;
    },
  ): Record<MealSlot, CandidateMeal[]> {
    const result = {
      [MealSlot.BREAKFAST]: [] as CandidateMeal[],
      [MealSlot.LUNCH]: [] as CandidateMeal[],
      [MealSlot.DINNER]: [] as CandidateMeal[],
      [MealSlot.SNACK]: [] as CandidateMeal[],
    };

    for (const slot of SLOT_ORDER) {
      const lockedMeal = options?.lockedMeals?.get(slot);

      if (lockedMeal) {
        result[slot] = [lockedMeal];
        continue;
      }

      const candidates = this.buildSlotCandidates(slot, slotTargets[slot], catalog, options?.excludeMealKey);

      if (candidates.length === 0) {
        throw new Error(`Для ${SLOT_TAGS[slot]} нет доступных комбинаций продуктов.`);
      }

      result[slot] = candidates;
    }

    return result;
  }

  private buildSlotCandidates(
    slot: MealSlot,
    slotTarget: MacroTargets,
    catalog: CatalogProduct[],
    excludeMealKey?: string,
  ): CandidateMeal[] {
    const candidates: CandidateMeal[] = [];
    const seen = new Set<string>();

    for (const template of SLOT_TEMPLATES[slot]) {
      const pools = template.roles.map((role) => this.productsForRole(catalog, slot, role, slotTarget));
      const templateCandidates: CandidateMeal[] = [];

      if (pools.some((pool) => pool.length === 0)) {
        continue;
      }

      this.forEachCombination(pools, (products) => {
        if (new Set(products.map((product) => product.product.id)).size !== products.length) {
          return;
        }

        const meal = this.composeMeal(slot, template, products, slotTarget);

        if (!meal || meal.mealKey === excludeMealKey || seen.has(meal.mealKey)) {
          return;
        }

        seen.add(meal.mealKey);
        templateCandidates.push({
          meal,
          score: this.scoreMealCandidate(meal, slotTarget),
        });
      });

      candidates.push(...templateCandidates.sort((left, right) => left.score - right.score).slice(0, 10));
    }

    return candidates.sort((left, right) => left.score - right.score).slice(0, 40);
  }

  private productsForRole(
    catalog: CatalogProduct[],
    slot: MealSlot,
    role: SlotRole,
    slotTarget: MacroTargets,
  ): CatalogProduct[] {
    const slotTag = SLOT_TAGS[slot];

    return catalog
      .filter((entry) => entry.usageTags.includes(slotTag))
      .filter((entry) => entry.usageTags.includes(role))
      .sort(
        (left, right) =>
          this.roleScore(right, role, slot, slotTarget) - this.roleScore(left, role, slot, slotTarget),
      )
      .slice(0, ROLE_LIMITS[role]);
  }

  private roleScore(
    entry: CatalogProduct,
    role: SlotRole,
    slot: MealSlot,
    slotTarget: MacroTargets,
  ): number {
    const serving = this.calculateMacros(entry.product, entry.product.defaultServingG);
    const targetCalories = slotTarget.calories * ROLE_CALORIE_SHARE[slot][role];
    const calorieFit = 1 - Math.abs(serving.calories - targetCalories) / Math.max(targetCalories, 1);

    switch (role) {
      case "protein":
        return serving.protein * 2 - serving.fat * 0.2 + calorieFit * 20;
      case "carb":
        return serving.carbs * 1.5 - serving.fat * 0.15 + calorieFit * 18;
      case "fat":
        return serving.fat * 2.2 + calorieFit * 12;
      case "vegetable":
        return calorieFit * 8 - serving.calories * 0.03 + 10;
      case "fruit":
        return calorieFit * 12 + serving.carbs * 0.4;
      case "junk":
        return calorieFit * 25 + serving.calories * 0.03;
      case "drink":
        return calorieFit * 20 + (entry.product.category === "DRINK" ? 5 : 0);
      default:
        return calorieFit * 10;
    }
  }

  private composeMeal(
    slot: MealSlot,
    template: SlotTemplate,
    products: CatalogProduct[],
    slotTarget: MacroTargets,
  ): PlannedMeal | null {
    const ingredients = products.map<CandidateIngredient>((product, index) => ({
      product,
      grams: product.product.defaultServingG,
      role: template.roles[index],
    }));
    const baseTotals = this.calculateIngredientTotals(ingredients);

    if (baseTotals.calories <= 0) {
      return null;
    }

    const scaleFactor = slotTarget.calories / baseTotals.calories;
    const scaledIngredients = ingredients.map((ingredient) => {
      const scaled = round(ingredient.grams * scaleFactor, 0);
      return {
        ...ingredient,
        grams: this.clamp(Number(scaled), ingredient.product.product.minServingG, ingredient.product.product.maxServingG),
      };
    });
    const rebalancedIngredients = this.rebalanceIngredients(scaledIngredients, slotTarget);
    const totals = this.calculateIngredientTotals(rebalancedIngredients);
    const priceCategory = rebalancedIngredients.reduce<Budget>(
      (current, ingredient) =>
        BUDGET_RANK[ingredient.product.product.priceCategory] > BUDGET_RANK[current]
          ? ingredient.product.product.priceCategory
          : current,
      Budget.CHEAP,
    );
    const tags = [...new Set(rebalancedIngredients.flatMap((ingredient) => ingredient.product.restrictionTags))];
    const mealKey = `${slot}:${rebalancedIngredients
      .map((ingredient) => ingredient.product.product.id)
      .sort((left, right) => left - right)
      .join("-")}`;
    const mealName = rebalancedIngredients.map((ingredient) => ingredient.product.product.name).join(" + ");

    return {
      slot,
      mealKey,
      templateKey: template.key,
      mealName,
      priceCategory,
      scaleFactor: round(scaleFactor, 2),
      calories: totals.calories,
      protein: totals.protein,
      fat: totals.fat,
      carbs: totals.carbs,
      tags,
      ingredients: rebalancedIngredients.map<PlannedIngredient>((ingredient) => ({
        productId: ingredient.product.product.id,
        productName: ingredient.product.product.name,
        grams: ingredient.grams,
        role: ingredient.role,
        category: ingredient.product.product.category,
        isJunkFood: ingredient.product.product.isJunkFood,
        restrictionTags: ingredient.product.restrictionTags,
      })),
    };
  }

  private rebalanceIngredients(
    ingredients: CandidateIngredient[],
    slotTarget: MacroTargets,
  ): CandidateIngredient[] {
    const result = ingredients.map((ingredient) => ({ ...ingredient }));
    const adjustmentOrderAdd: SlotRole[] = ["carb", "protein", "fat", "fruit", "junk", "drink", "vegetable"];
    const adjustmentOrderReduce: SlotRole[] = ["fat", "junk", "carb", "protein", "fruit", "drink", "vegetable"];

    for (let iteration = 0; iteration < 40; iteration += 1) {
      const totals = this.calculateIngredientTotals(result);
      const delta = slotTarget.calories - totals.calories;

      if (Math.abs(delta) <= 12) {
        break;
      }

      const roles = delta > 0 ? adjustmentOrderAdd : adjustmentOrderReduce;
      let adjusted = false;

      for (const role of roles) {
        for (const ingredient of result.filter((entry) => entry.role === role)) {
          const step = this.adjustmentStep(role);
          const nextGrams = delta > 0 ? ingredient.grams + step : ingredient.grams - step;
          const bounded = this.clamp(
            nextGrams,
            ingredient.product.product.minServingG,
            ingredient.product.product.maxServingG,
          );

          if (bounded === ingredient.grams) {
            continue;
          }

          const currentCalories = this.calculateMacros(ingredient.product.product, ingredient.grams).calories;
          const nextCalories = this.calculateMacros(ingredient.product.product, bounded).calories;

          if (Math.abs(slotTarget.calories - (totals.calories - currentCalories + nextCalories)) > Math.abs(delta)) {
            continue;
          }

          ingredient.grams = bounded;
          adjusted = true;
          break;
        }

        if (adjusted) {
          break;
        }
      }

      if (!adjusted) {
        break;
      }
    }

    return result;
  }

  private adjustmentStep(role: SlotRole): number {
    switch (role) {
      case "fat":
        return 5;
      case "drink":
        return 50;
      case "junk":
        return 10;
      case "vegetable":
        return 20;
      default:
        return 10;
    }
  }

  private scoreMealCandidate(meal: PlannedMeal, target: MacroTargets): number {
    const deviations = macroDeviation(
      {
        calories: meal.calories,
        protein: meal.protein,
        fat: meal.fat,
        carbs: meal.carbs,
      },
      target,
    );
    const ingredientPenalty = meal.ingredients.length * 0.03;
    const junkPenalty = meal.ingredients.some((ingredient) => ingredient.isJunkFood) ? 0.2 : 0;
    const scalePenalty = Math.abs(meal.scaleFactor - 1) * 0.25;

    return (
      deviations.caloriesPct * 4 +
      deviations.proteinPct * 3 +
      deviations.fatPct * 2 +
      deviations.carbsPct * 2 +
      ingredientPenalty +
      junkPenalty +
      scalePenalty
    );
  }

  private findTopPlans(
    slotTargets: SlotTargets,
    dailyTarget: MacroTargets,
    candidateMap: Record<MealSlot, CandidateMeal[]>,
    limit = 48,
  ): PlanSearchResult[] {
    const bestPlans: Array<PlanSearchResult & { signature: string }> = [];
    const seen = new Set<string>();

    for (const breakfast of candidateMap[MealSlot.BREAKFAST]) {
      for (const lunch of candidateMap[MealSlot.LUNCH]) {
        for (const dinner of candidateMap[MealSlot.DINNER]) {
          for (const snack of candidateMap[MealSlot.SNACK]) {
            const selected = [breakfast, lunch, dinner, snack];
            const signature = selected.map((candidate) => candidate.meal.mealKey).join("|");

            if (seen.has(signature)) {
              continue;
            }

            const totals = sumMacros(
              selected.map((candidate) => ({
                calories: candidate.meal.calories,
                protein: candidate.meal.protein,
                fat: candidate.meal.fat,
                carbs: candidate.meal.carbs,
              })),
            );
            const deviations = macroDeviation(totals, dailyTarget);
            const slotScore = selected.reduce((sum, candidate) => sum + candidate.score, 0);
            const planScore =
              deviations.caloriesPct * 4 +
              deviations.proteinPct * 3 +
              deviations.fatPct * 2 +
              deviations.carbsPct * 2 +
              slotScore * 0.2 +
              this.slotBalancePenalty(selected, slotTargets);

            seen.add(signature);
            this.pushPlanCandidate(bestPlans, { selected, totals, score: planScore, signature }, limit);
          }
        }
      }
    }

    return bestPlans.map(({ signature: _signature, ...plan }) => plan);
  }

  private findForcedVariationPlans(
    slotTargets: SlotTargets,
    dailyTarget: MacroTargets,
    candidateMap: Record<MealSlot, CandidateMeal[]>,
    latestPlanMeals: PlannedMeal[],
  ): PlanSearchResult[] | null {
    if (latestPlanMeals.length === 0) {
      return null;
    }

    const substantialMap = this.buildSubstantialCandidateMap(candidateMap, latestPlanMeals);
    const slotSets: MealSlot[][] = [
      [MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.DINNER, MealSlot.SNACK],
      [MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.DINNER],
      [MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.SNACK],
      [MealSlot.BREAKFAST, MealSlot.DINNER, MealSlot.SNACK],
      [MealSlot.LUNCH, MealSlot.DINNER, MealSlot.SNACK],
    ];

    for (const forcedSlots of slotSets) {
      if (forcedSlots.some((slot) => substantialMap[slot].length === 0)) {
        continue;
      }

      const forcedCandidateMap = {
        [MealSlot.BREAKFAST]: forcedSlots.includes(MealSlot.BREAKFAST)
          ? substantialMap[MealSlot.BREAKFAST]
          : candidateMap[MealSlot.BREAKFAST],
        [MealSlot.LUNCH]: forcedSlots.includes(MealSlot.LUNCH)
          ? substantialMap[MealSlot.LUNCH]
          : candidateMap[MealSlot.LUNCH],
        [MealSlot.DINNER]: forcedSlots.includes(MealSlot.DINNER)
          ? substantialMap[MealSlot.DINNER]
          : candidateMap[MealSlot.DINNER],
        [MealSlot.SNACK]: forcedSlots.includes(MealSlot.SNACK)
          ? substantialMap[MealSlot.SNACK]
          : candidateMap[MealSlot.SNACK],
      };
      const results = this.findTopPlans(slotTargets, dailyTarget, forcedCandidateMap, 1200);

      if (results.length > 0) {
        return results;
      }
    }

    return null;
  }

  private pushPlanCandidate(
    plans: Array<PlanSearchResult & { signature: string }>,
    candidate: PlanSearchResult & { signature: string },
    limit: number,
  ) {
    plans.push(candidate);
    plans.sort((left, right) => left.score - right.score);

    if (plans.length > limit) {
      plans.length = limit;
    }
  }

  private buildSubstantialCandidateMap(
    candidateMap: Record<MealSlot, CandidateMeal[]>,
    latestPlanMeals: PlannedMeal[],
  ): Record<MealSlot, CandidateMeal[]> {
    const previousBySlot = new Map(latestPlanMeals.map((meal) => [meal.slot, meal]));

    return {
      [MealSlot.BREAKFAST]: candidateMap[MealSlot.BREAKFAST].filter((candidate) => {
        const previousMeal = previousBySlot.get(MealSlot.BREAKFAST);
        return previousMeal ? this.isSubstantiallyDifferentMeal(previousMeal, candidate.meal) : true;
      }),
      [MealSlot.LUNCH]: candidateMap[MealSlot.LUNCH].filter((candidate) => {
        const previousMeal = previousBySlot.get(MealSlot.LUNCH);
        return previousMeal ? this.isSubstantiallyDifferentMeal(previousMeal, candidate.meal) : true;
      }),
      [MealSlot.DINNER]: candidateMap[MealSlot.DINNER].filter((candidate) => {
        const previousMeal = previousBySlot.get(MealSlot.DINNER);
        return previousMeal ? this.isSubstantiallyDifferentMeal(previousMeal, candidate.meal) : true;
      }),
      [MealSlot.SNACK]: candidateMap[MealSlot.SNACK].filter((candidate) => {
        const previousMeal = previousBySlot.get(MealSlot.SNACK);
        return previousMeal ? this.isSubstantiallyDifferentMeal(previousMeal, candidate.meal) : true;
      }),
    };
  }

  private pickPlanVariant(
    plans: PlanSearchResult[],
    recentSignatures: string[] = [],
    recentSlotSignatures: string[] = [],
    recentExactSignatures: string[] = [],
    latestPlanMeals: PlannedMeal[] = [],
  ): PlanSearchResult | null {
    if (plans.length === 0) {
      return null;
    }

    const stronglyDifferentPlans =
      latestPlanMeals.length > 0 ? plans.filter((plan) => this.hasAtLeastThreeChangedSlots(plan.selected, latestPlanMeals)) : plans;
    const exactRecent = new Set(recentExactSignatures);
    const exactFreshPlans = stronglyDifferentPlans.filter(
      (plan) => !exactRecent.has(this.dailyPlanSignatureFromSelected(plan.selected)),
    );
    const basePlans =
      exactFreshPlans.length > 0
        ? exactFreshPlans
        : stronglyDifferentPlans.length > 0
          ? stronglyDifferentPlans
          : plans;
    const recent = new Set(recentSignatures);
    const freshPlans = basePlans.filter((plan) => !recent.has(this.dailyMeaningfulSignatureFromSelected(plan.selected)));
    const poolSource = this.sortPlansByNovelty(freshPlans.length > 0 ? freshPlans : basePlans, recentSlotSignatures);
    const pool = this.collectDiversePlans(poolSource, 16);

    return this.weightedRandomPlan(pool.length > 0 ? pool : poolSource);
  }

  private sortPlansByNovelty(plans: PlanSearchResult[], recentSlotSignatures: string[]): PlanSearchResult[] {
    const recent = new Set(recentSlotSignatures.filter(Boolean));

    return [...plans].sort((left, right) => {
      const leftPenalty = this.slotReusePenalty(left, recent);
      const rightPenalty = this.slotReusePenalty(right, recent);

      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }

      return left.score - right.score;
    });
  }

  private collectDiversePlans(plans: PlanSearchResult[], limit: number): PlanSearchResult[] {
    const diverse: PlanSearchResult[] = [];
    const seen = new Set<string>();

    for (const plan of plans) {
      const signature = this.dailyMeaningfulSignatureFromSelected(plan.selected);

      if (seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      diverse.push(plan);

      if (diverse.length >= limit) {
        break;
      }
    }

    return diverse;
  }

  private weightedRandomPlan(plans: PlanSearchResult[]): PlanSearchResult | null {
    if (plans.length === 0) {
      return null;
    }

    const weights = plans.map((plan, index) => 1 / (1 + plan.score + index * 0.06));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;

    for (let index = 0; index < plans.length; index += 1) {
      cursor -= weights[index];

      if (cursor <= 0) {
        return plans[index];
      }
    }

    return plans[plans.length - 1];
  }

  private slotReusePenalty(plan: PlanSearchResult, recent: Set<string>): number {
    return plan.selected.reduce((sum, candidate) => {
      const signature = this.coreMealSignature(candidate.meal) || this.meaningfulMealSignature(candidate.meal);
      return sum + (recent.has(signature) ? 1 : 0);
    }, 0);
  }

  private slotBalancePenalty(selected: CandidateMeal[], slotTargets: SlotTargets): number {
    return selected.reduce((sum, candidate) => {
      const target = slotTargets[candidate.meal.slot];

      return (
        sum +
        Math.abs(candidate.meal.calories - target.calories) / Math.max(target.calories, 1) +
        Math.abs(candidate.meal.scaleFactor - 1) * 0.1
      );
    }, 0);
  }

  private isMeaningfulMealReplacement(currentMeal: PlannedMeal, updatedMeal: PlannedMeal): boolean {
    const currentCore = this.coreMealSignature(currentMeal);
    const updatedCore = this.coreMealSignature(updatedMeal);

    if (currentCore && updatedCore) {
      return currentCore !== updatedCore;
    }

    return this.meaningfulMealSignature(currentMeal) !== this.meaningfulMealSignature(updatedMeal);
  }

  private dailyMeaningfulSignature(meals: PlannedMeal[]): string {
    return meals
      .slice()
      .sort((left, right) => SLOT_ORDER.indexOf(left.slot) - SLOT_ORDER.indexOf(right.slot))
      .map((meal) => this.meaningfulMealSignature(meal))
      .join("|");
  }

  private dailyMeaningfulSignatureFromSelected(selected: CandidateMeal[]): string {
    return this.dailyMeaningfulSignature(selected.map((candidate) => candidate.meal));
  }

  private dailyPlanSignature(meals: PlannedMeal[]): string {
    return meals
      .slice()
      .sort((left, right) => SLOT_ORDER.indexOf(left.slot) - SLOT_ORDER.indexOf(right.slot))
      .map((meal) => meal.mealKey)
      .join("|");
  }

  private dailyPlanSignatureFromSelected(selected: CandidateMeal[]): string {
    return this.dailyPlanSignature(selected.map((candidate) => candidate.meal));
  }

  private hasAtLeastThreeChangedSlots(selected: CandidateMeal[], previousMeals: PlannedMeal[]): boolean {
    const previousBySlot = new Map(previousMeals.map((meal) => [meal.slot, meal]));
    let changedSlots = 0;

    for (const candidate of selected) {
      const previousMeal = previousBySlot.get(candidate.meal.slot);

      if (!previousMeal || this.isSubstantiallyDifferentMeal(previousMeal, candidate.meal)) {
        changedSlots += 1;
      }
    }

    return changedSlots >= 3;
  }

  private slotComparisonSignature(meal: PlannedMeal): string {
    return this.coreMealSignature(meal) || this.meaningfulMealSignature(meal);
  }

  private isSubstantiallyDifferentMeal(previousMeal: PlannedMeal, currentMeal: PlannedMeal): boolean {
    const previousAnchors = this.getAnchorRoleSignatures(previousMeal);
    const currentAnchors = this.getAnchorRoleSignatures(currentMeal);
    const proteinChanged = previousAnchors.protein !== currentAnchors.protein;
    const carbChanged = previousAnchors.carb !== currentAnchors.carb;
    const fruitChanged = previousAnchors.fruit !== currentAnchors.fruit;
    const junkChanged = previousAnchors.junk !== currentAnchors.junk;

    if (previousMeal.slot === MealSlot.SNACK) {
      if (previousAnchors.protein && currentAnchors.protein) {
        return proteinChanged;
      }

      return carbChanged || fruitChanged || junkChanged;
    }

    if (previousAnchors.protein && currentAnchors.protein && !proteinChanged) {
      return false;
    }

    return carbChanged || fruitChanged || junkChanged;
  }

  private getAnchorRoleSignatures(meal: PlannedMeal): Record<"protein" | "carb" | "fruit" | "junk", string> {
    return {
      protein: this.roleSignature(meal, "protein"),
      carb: this.roleSignature(meal, "carb"),
      fruit: this.roleSignature(meal, "fruit"),
      junk: this.roleSignature(meal, "junk"),
    };
  }

  private roleSignature(
    meal: PlannedMeal,
    role: "protein" | "carb" | "fruit" | "junk",
  ): string {
    return meal.ingredients
      .filter((ingredient) => ingredient.role === role)
      .map((ingredient) => ingredient.productId)
      .sort((left, right) => left - right)
      .join("-");
  }

  private meaningfulMealSignature(meal: PlannedMeal): string {
    const significantIngredientIds = meal.ingredients
      .filter((ingredient) => ingredient.category !== ProductCategory.FAT && ingredient.category !== ProductCategory.DRINK)
      .map((ingredient) => ingredient.productId)
      .sort((left, right) => left - right);

    return `${meal.slot}:${significantIngredientIds.join("-")}`;
  }

  private coreMealSignature(meal: PlannedMeal): string {
    const coreIngredientIds = meal.ingredients
      .filter((ingredient) => CORE_REPLACEMENT_CATEGORIES.has(ingredient.category))
      .map((ingredient) => ingredient.productId)
      .sort((left, right) => left - right);

    return coreIngredientIds.length > 0 ? `${meal.slot}:${coreIngredientIds.join("-")}` : "";
  }

  private toDailyPlan(
    selected: CandidateMeal[],
    target: MacroTargets,
    budget: Budget,
    limitations: string[],
    allowJunkFood: boolean,
  ): DailyPlan {
    const meals = selected
      .map((candidate) => candidate.meal)
      .sort((left, right) => SLOT_ORDER.indexOf(left.slot) - SLOT_ORDER.indexOf(right.slot));
    const totals = sumMacros(
      meals.map((meal) => ({
        calories: meal.calories,
        protein: meal.protein,
        fat: meal.fat,
        carbs: meal.carbs,
      })),
    );
    const deviations = macroDeviation(totals, target);
    const withinTolerance = Object.values(deviations).every((value) => value <= MAX_ALLOWED_DEVIATION);

    return {
      generatedAt: new Date().toISOString(),
      budget,
      limitations,
      allowJunkFood,
      target,
      totals,
      deviations,
      withinTolerance,
      meals,
    };
  }

  private calculateIngredientTotals(ingredients: CandidateIngredient[]): MacroTargets {
    return sumMacros(
      ingredients.map((ingredient) => this.calculateMacros(ingredient.product.product, ingredient.grams)),
    );
  }

  private calculateMacros(product: Product, grams: number): MacroTargets {
    return {
      calories: round((product.caloriesPer100g * grams) / 100),
      protein: round((product.proteinPer100g * grams) / 100),
      fat: round((product.fatPer100g * grams) / 100),
      carbs: round((product.carbsPer100g * grams) / 100),
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  private hasAnyRestriction(tags: string[], restrictions: string[]): boolean {
    return restrictions.some((restriction) => tags.includes(restriction));
  }

  private deriveRestrictionTags(product: Product): string[] {
    const tags = readTagList(product.restrictionTags);
    const normalizedName = product.name.toLowerCase();
    const normalizedUsdaDescription = product.usdaDescription.toLowerCase();

    if (normalizedUsdaDescription.includes("beef")) {
      tags.push("contains_beef");
    }

    if (normalizedUsdaDescription.includes("pork")) {
      tags.push("contains_pork");
    }

    if (
      normalizedName.includes("говядин") ||
      normalizedName.includes("говяж")
    ) {
      tags.push("contains_beef");
    }

    return [...new Set(tags)];
  }

  private forEachCombination<T>(pools: T[][], callback: (items: T[]) => void): void {
    const current: T[] = [];

    const walk = (index: number) => {
      if (index === pools.length) {
        callback([...current]);
        return;
      }

      for (const item of pools[index]) {
        current.push(item);
        walk(index + 1);
        current.pop();
      }
    };

    walk(0);
  }
}
