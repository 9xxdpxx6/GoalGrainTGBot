import { ProductCategory } from "@prisma/client";

export function formatIngredientAmount(productName: string, grams: number, category: ProductCategory): string {
  const portionHint = formatPortionHint(productName, grams, category);

  return portionHint ? `${productName} ${grams} г (${portionHint})` : `${productName} ${grams} г`;
}

export function formatPortionHint(productName: string, grams: number, category: ProductCategory): string | null {
  const normalized = productName.toLowerCase();

  if (normalized.includes("яичный белок")) {
    const whites = roundHalf(grams / 33);
    return whites <= 0 ? null : pluralizeEggWhites(whites);
  }

  if (normalized.includes("яйцо")) {
    const eggs = roundHalf(grams / 60);
    return eggs <= 0 ? null : pluralizeEggs(eggs);
  }

  if (normalized.includes("творог")) {
    return formatPackMeasure(grams, 180);
  }

  if (normalized.includes("йогурт")) {
    return formatPackMeasure(grams, 140);
  }

  if (category === ProductCategory.FAT || normalized.includes("масло") || normalized.includes("паста")) {
    return formatSpoonMeasure(grams);
  }

  if (
    category === ProductCategory.DAIRY ||
    category === ProductCategory.DRINK ||
    normalized.includes("кефир") ||
    normalized.includes("молоко")
  ) {
    return formatGlassMeasure(grams, 200);
  }

  if (
    normalized.includes("рис") ||
    normalized.includes("греч") ||
    normalized.includes("булгур") ||
    normalized.includes("кускус")
  ) {
    return formatGlassMeasure(grams, 90);
  }

  if (normalized.includes("овся")) {
    return formatGlassMeasure(grams, 80);
  }

  if (normalized.includes("макарон")) {
    return formatGlassMeasure(grams, 100);
  }

  if (normalized.includes("чечев") || normalized.includes("нут") || normalized.includes("фасол")) {
    return formatGlassMeasure(grams, 160);
  }

  if (normalized.includes("тортилья")) {
    const pieces = roundHalf(grams / 40);
    return pieces <= 0 ? null : `${formatHalfNumber(pieces)} шт.`;
  }

  if (normalized.includes("хлебец")) {
    const pieces = roundHalf(grams / 9);
    return pieces <= 0 ? null : `${formatHalfNumber(pieces)} шт.`;
  }

  if (normalized.includes("хлеб")) {
    const slices = roundHalf(grams / 35);
    return slices <= 0 ? null : `${formatHalfNumber(slices)} ломтика`;
  }

  return null;
}

function formatSpoonMeasure(grams: number): string | null {
  if (grams < 3) {
    return null;
  }

  if (grams <= 9) {
    const teaspoons = roundHalf(grams / 5);
    return teaspoons <= 0 ? null : pluralizeTeaspoons(teaspoons);
  }

  const tablespoons = roundHalf(grams / 15);
  return tablespoons <= 0 ? null : pluralizeTablespoons(tablespoons);
}

function formatGlassMeasure(grams: number, gramsPerGlass: number): string | null {
  if (grams < gramsPerGlass * 0.35) {
    return null;
  }

  const glasses = roundHalf(grams / gramsPerGlass);
  return glasses <= 0 ? null : pluralizeGlasses(glasses);
}

function formatPackMeasure(grams: number, gramsPerPack: number): string | null {
  if (grams < gramsPerPack * 0.4) {
    return null;
  }

  const packs = roundHalf(grams / gramsPerPack);

  if (packs === 0.5) {
    return `пол упаковки ${gramsPerPack} г`;
  }

  if (packs === 1) {
    return `1 упаковка ${gramsPerPack} г`;
  }

  return `${formatHalfNumber(packs)} упаковки по ${gramsPerPack} г`;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function formatHalfNumber(value: number): string {
  if (value === 0.5) {
    return "1/2";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  const whole = Math.floor(value);
  return `${whole} 1/2`;
}

function pluralizeEggs(value: number): string {
  if (value === 0.5) {
    return "пол-яйца";
  }

  return `${formatHalfNumber(value)} ${value === 1 ? "яйцо" : value < 5 ? "яйца" : "яиц"}`;
}

function pluralizeEggWhites(value: number): string {
  if (value === 0.5) {
    return "белок от 1/2 яйца";
  }

  if (value === 1) {
    return "белок от 1 яйца";
  }

  return `белки от ${formatHalfNumber(value)} яиц`;
}

function pluralizeTeaspoons(value: number): string {
  if (value === 0.5) {
    return "пол чайной ложки";
  }

  if (value === 1) {
    return "1 чайная ложка";
  }

  return `${formatHalfNumber(value)} чайные ложки`;
}

function pluralizeTablespoons(value: number): string {
  if (value === 0.5) {
    return "пол столовой ложки";
  }

  if (value === 1) {
    return "1 столовая ложка";
  }

  return `${formatHalfNumber(value)} столовые ложки`;
}

function pluralizeGlasses(value: number): string {
  if (value === 0.5) {
    return "полстакана (200 мл)";
  }

  if (value === 1) {
    return "1 стакан (200 мл)";
  }

  if (value === 1.5) {
    return "1 1/2 стакана (200 мл)";
  }

  return `${formatHalfNumber(value)} стакана (200 мл)`;
}
