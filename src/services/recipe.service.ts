import { ProductCategory } from "@prisma/client";

import { DailyPlan, DailyRecipeItem, GeneratedRecipe, PlannedMeal, RecipeStep } from "../types/domain";
import { formatIngredientAmount } from "../utils/portion-hints";

import { PolzaAiService } from "./polza-ai.service";

export class RecipeService {
  constructor(private readonly polzaAiService: PolzaAiService) {}

  async buildRecipe(meal: PlannedMeal): Promise<GeneratedRecipe> {
    const generated = await this.polzaAiService.generateRecipe(meal);

    if (generated) {
      const normalized = this.normalizeGeneratedRecipe(generated, meal);

      if (this.isRecipeDetailedEnough(normalized)) {
        return normalized;
      }
    }

    return this.buildFallbackRecipe(meal);
  }

  async buildRecipeBundle(plan: DailyPlan): Promise<DailyRecipeItem[]> {
    const generated = await this.polzaAiService.generateRecipeBundle(plan.meals);

    if (!generated) {
      return plan.meals.map((meal) => ({
        slot: meal.slot,
        recipe: this.buildFallbackRecipe(meal),
      }));
    }

    const generatedBySlot = new Map(generated.map((item) => [item.slot, item.recipe]));

    return plan.meals.map((meal) => {
      const recipe = generatedBySlot.has(meal.slot)
        ? this.normalizeGeneratedRecipe(generatedBySlot.get(meal.slot) as GeneratedRecipe, meal)
        : this.buildFallbackRecipe(meal);

      return {
        slot: meal.slot,
        recipe: this.isRecipeDetailedEnough(recipe) ? recipe : this.buildFallbackRecipe(meal),
      };
    });
  }

  private normalizeGeneratedRecipe(recipe: GeneratedRecipe, meal: PlannedMeal): GeneratedRecipe {
    return {
      mealName: recipe.mealName.trim() || meal.mealName,
      ingredients: meal.ingredients.map((ingredient) =>
        formatIngredientAmount(ingredient.productName, ingredient.grams, ingredient.category),
      ),
      steps: recipe.steps.map((step, index) => ({
        index: step.index || index + 1,
        text: step.text.trim(),
      })),
    };
  }

  private isRecipeDetailedEnough(recipe: GeneratedRecipe): boolean {
    const detailedSteps = recipe.steps.filter((step) => /\d/.test(step.text) || /(мин|мл|°|огне|кипения|воды)/i.test(step.text));
    return detailedSteps.length >= 2;
  }

  private buildFallbackRecipe(meal: PlannedMeal): GeneratedRecipe {
    const ingredients = meal.ingredients.map((ingredient) =>
      formatIngredientAmount(ingredient.productName, ingredient.grams, ingredient.category),
    );
    const carbSteps = meal.ingredients
      .filter((ingredient) => this.isCarbCategory(ingredient.category))
      .map((ingredient) => this.describeCarbStep(ingredient.productName, ingredient.grams));
    const proteinSteps = meal.ingredients
      .filter((ingredient) => this.isProteinCategory(ingredient.category))
      .map((ingredient) => this.describeProteinStep(ingredient.productName, ingredient.grams));
    const vegetableSteps = meal.ingredients
      .filter((ingredient) => ingredient.category === ProductCategory.VEGETABLE || ingredient.category === ProductCategory.FRUIT)
      .map((ingredient) => this.describeFreshStep(ingredient.productName, ingredient.grams));
    const fatSteps = meal.ingredients
      .filter((ingredient) => this.isFatCategory(ingredient.category))
      .map((ingredient) => this.describeFatStep(ingredient.productName, ingredient.grams));

    const steps: RecipeStep[] = [];

    if (carbSteps.length > 0) {
      steps.push({
        index: steps.length + 1,
        text: carbSteps.join(" "),
      });
    }

    if (proteinSteps.length > 0) {
      steps.push({
        index: steps.length + 1,
        text: proteinSteps.join(" "),
      });
    }

    if (vegetableSteps.length > 0) {
      steps.push({
        index: steps.length + 1,
        text: vegetableSteps.join(" "),
      });
    }

    if (fatSteps.length > 0) {
      steps.push({
        index: steps.length + 1,
        text: fatSteps.join(" "),
      });
    }

    steps.push({
      index: steps.length + 1,
      text: "Соберите блюдо, посолите по вкусу, перемешайте и подавайте сразу после приготовления.",
    });

    return {
      mealName: meal.mealName,
      ingredients,
      steps,
    };
  }

  private isCarbCategory(category: ProductCategory): boolean {
    return new Set<ProductCategory>([ProductCategory.GRAIN, ProductCategory.BREAD, ProductCategory.SNACK]).has(category);
  }

  private isProteinCategory(category: ProductCategory): boolean {
    return new Set<ProductCategory>([
      ProductCategory.MEAT,
      ProductCategory.FISH,
      ProductCategory.SEAFOOD,
      ProductCategory.EGG,
      ProductCategory.DAIRY,
      ProductCategory.LEGUME,
    ]).has(category);
  }

  private isFatCategory(category: ProductCategory): boolean {
    return new Set<ProductCategory>([ProductCategory.FAT, ProductCategory.NUT, ProductCategory.SWEET, ProductCategory.DRINK]).has(category);
  }

  private describeCarbStep(productName: string, grams: number): string {
    const normalized = productName.toLowerCase();

    if (normalized.includes("овся")) {
      return `Смешайте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)} с водой в пропорции 1:2, доведите до кипения и варите 5-7 минут на слабом огне, пока хлопья не станут мягкими.`;
    }

    if (normalized.includes("рис бур")) {
      return `Промойте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)}, залейте водой в пропорции 1:2.2, доведите до кипения и варите под крышкой 25-30 минут до мягкости.`;
    }

    if (normalized.includes("рис")) {
      return `Промойте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)}, залейте водой в пропорции 1:2, доведите до кипения и варите под крышкой 15-18 минут до готовности.`;
    }

    if (normalized.includes("греч")) {
      return `Промойте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)}, добавьте воды в пропорции 1:2 и варите 15-18 минут под крышкой, пока крупа полностью не впитает воду.`;
    }

    if (normalized.includes("булгур")) {
      return `Залейте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)} водой 1:2, доведите до кипения и варите 12-15 минут до мягкости.`;
    }

    if (normalized.includes("перлов")) {
      return `Промойте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)}, залейте водой 1:3 и варите 35-45 минут до мягкости.`;
    }

    if (normalized.includes("макарон")) {
      return `Отварите ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)} в большом количестве подсоленной воды 8-10 минут до состояния al dente.`;
    }

    if (normalized.includes("батат") || normalized.includes("картофель")) {
      return `Нарежьте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)} крупными кусками и запеките при 200°C 25-35 минут или отварите 15-20 минут до мягкости.`;
    }

    if (normalized.includes("хлеб") || normalized.includes("тортилья")) {
      return `Слегка прогрейте ${formatIngredientAmount(productName, grams, ProductCategory.BREAD)} 1-2 минуты на сухой сковороде или в тостере.`;
    }

    return `Подготовьте ${formatIngredientAmount(productName, grams, ProductCategory.GRAIN)} удобным способом до полной готовности.`;
  }

  private describeProteinStep(productName: string, grams: number): string {
    const normalized = productName.toLowerCase();

    if (normalized.includes("яичный белок")) {
      return `Взбейте ${formatIngredientAmount(productName, grams, ProductCategory.EGG)} вилкой до однородной легкой пены, вылейте на антипригарную сковороду и готовьте 2-3 минуты на слабом огне, пока масса полностью не схватится.`;
    }

    if (normalized.includes("яйцо")) {
      return `Разбейте ${formatIngredientAmount(productName, grams, ProductCategory.EGG)}, взбейте до однородной желтой массы без крупных белковых сгустков и готовьте на слабом огне 2-4 минуты до нужной степени готовности.`;
    }

    if (normalized.includes("курин") || normalized.includes("индейк")) {
      return `Готовьте ${formatIngredientAmount(productName, grams, ProductCategory.MEAT)} на среднем огне 4-6 минут с каждой стороны или запекайте при 190°C 18-22 минуты, пока внутри не останется розовых участков.`;
    }

    if (normalized.includes("свинин") || normalized.includes("говядин")) {
      return `Обжарьте ${formatIngredientAmount(productName, grams, ProductCategory.MEAT)} на среднем огне 3-5 минут с каждой стороны, затем доведите под крышкой еще 4-6 минут до полной готовности.`;
    }

    if (normalized.includes("треск") || normalized.includes("тунец") || normalized.includes("лосос") || normalized.includes("скумбр")) {
      return `Готовьте ${formatIngredientAmount(productName, grams, ProductCategory.FISH)} на среднем огне 3-4 минуты с каждой стороны или запекайте при 180°C 12-15 минут, не пересушивая.`;
    }

    if (normalized.includes("кальмар") || normalized.includes("кревет")) {
      return `Быстро обжарьте ${formatIngredientAmount(productName, grams, ProductCategory.SEAFOOD)} 2-3 минуты, пока продукт не станет матовым и упругим.`;
    }

    if (normalized.includes("творог") || normalized.includes("йогурт") || normalized.includes("кефир")) {
      return `Используйте ${formatIngredientAmount(productName, grams, ProductCategory.DAIRY)} как готовую холодную основу без дополнительной термообработки.`;
    }

    if (normalized.includes("чечевиц") || normalized.includes("нут") || normalized.includes("фасол") || normalized.includes("тофу")) {
      return `Подготовьте ${formatIngredientAmount(productName, grams, ProductCategory.LEGUME)} до мягкости и прогрейте 3-5 минут со специями перед подачей.`;
    }

    return `Подготовьте ${formatIngredientAmount(productName, grams, ProductCategory.MEAT)} до полной готовности.`;
  }

  private describeFreshStep(productName: string, grams: number): string {
    const category = productName.toLowerCase().includes("банан") ? ProductCategory.FRUIT : ProductCategory.VEGETABLE;
    return `Нарежьте ${formatIngredientAmount(productName, grams, category)} удобными кусочками и добавьте в готовое блюдо или подайте рядом.`;
  }

  private describeFatStep(productName: string, grams: number): string {
    return `Добавьте ${formatIngredientAmount(productName, grams, ProductCategory.FAT)} в конце приготовления или используйте как соус/добавку при подаче.`;
  }
}
