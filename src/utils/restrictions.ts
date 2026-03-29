function unique(values: string[]): string[] {
  return [...new Set(values)];
}

const CLEAR_RESTRICTION_INPUTS = new Set(["", "нет", "none", "-", "clear", "очистить"]);

const RESTRICTION_LABELS: Record<string, string> = {
  contains_lactose: "без лактозы",
  contains_gluten: "без глютена",
  contains_nuts: "без орехов",
  contains_fish: "без рыбы",
  contains_shellfish: "без морепродуктов",
  contains_eggs: "без яиц",
  contains_soy: "без сои",
  contains_beef: "без говядины",
  contains_pork: "без свинины",
  contains_meat: "без мяса",
  contains_seeds: "без семечек",
  contains_sesame: "без кунжута",
  contains_caffeine: "без кофеина",
  contains_added_sugar: "без добавленного сахара",
};

type RestrictionEditMode = "append" | "remove" | "replace" | "clear";

interface RestrictionOperation {
  mode: RestrictionEditMode;
  tokens: string[];
}

export function normalizeRestrictionToken(token: string): string[] {
  const rawNormalized = token.trim().toLowerCase();

  if (!rawNormalized || CLEAR_RESTRICTION_INPUTS.has(rawNormalized)) {
    return [];
  }

  if (RESTRICTION_LABELS[rawNormalized]) {
    return [rawNormalized];
  }

  if (rawNormalized.startsWith("contains_")) {
    return [rawNormalized];
  }

  const normalized = normalizeInput(token);

  if (!normalized || CLEAR_RESTRICTION_INPUTS.has(normalized)) {
    return [];
  }

  if (RESTRICTION_LABELS[normalized]) {
    return [normalized];
  }

  if (normalized.startsWith("contains_")) {
    return [normalized];
  }

  const plain = stripRestrictionPrefix(normalized);

  if (!plain) {
    return [];
  }

  return matchRestrictionText(plain);
}

export function parseRestrictions(input: string): string[] {
  return applyOperations([], parseRestrictionOperations(input, false));
}

export function readRestrictionList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .flatMap((entry) => normalizeRestrictionToken(entry)),
  );
}

export function readTagList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function applyRestrictionInput(current: string[], input: string): string[] {
  return applyOperations(current, parseRestrictionOperations(input, true));
}

export function formatRestriction(token: string): string {
  if (RESTRICTION_LABELS[token]) {
    return RESTRICTION_LABELS[token];
  }

  if (token.startsWith("contains_")) {
    return `без ${token.replace("contains_", "").replace(/_/g, " ")}`;
  }

  return token.replace(/_/g, " ");
}

export function formatRestrictionList(value: unknown): string[] {
  return readRestrictionList(value).map(formatRestriction);
}

function parseRestrictionOperations(input: string, allowMixedModes: boolean): RestrictionOperation[] {
  const parts = input
    .split(/\r?\n|;/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return [{ mode: "clear", tokens: [] }];
  }

  if (!allowMixedModes) {
    return [
      {
        mode: "append",
        tokens: unique(parts.flatMap((part) => normalizeRestrictionToken(part))),
      },
    ];
  }

  return parts.map((part) => {
    const mode = detectRestrictionEditMode(part);

    if (mode === "clear") {
      return { mode, tokens: [] };
    }

    return {
      mode,
      tokens: normalizeRestrictionToken(stripRestrictionModePrefix(part, mode)),
    };
  });
}

function applyOperations(current: string[], operations: RestrictionOperation[]): string[] {
  let result = readRestrictionList(current);

  for (const operation of operations) {
    if (operation.mode === "clear") {
      result = [];
      continue;
    }

    if (operation.mode === "replace") {
      result = [...operation.tokens];
      continue;
    }

    if (operation.mode === "remove") {
      const removed = new Set(operation.tokens);
      result = result.filter((token) => !removed.has(token));
      continue;
    }

    result = unique([...result, ...operation.tokens]);
  }

  return result;
}

function detectRestrictionEditMode(input: string): RestrictionEditMode {
  const normalized = normalizeInput(input);

  if (CLEAR_RESTRICTION_INPUTS.has(normalized)) {
    return "clear";
  }

  if (normalized.startsWith("-")) {
    return "remove";
  }

  if (normalized.startsWith("=")) {
    return "replace";
  }

  if (normalized.startsWith("+")) {
    return "append";
  }

  return "append";
}

function stripRestrictionModePrefix(input: string, mode: RestrictionEditMode): string {
  const trimmed = input.trim();

  if (mode === "append" && trimmed.startsWith("+")) {
    return trimmed.slice(1).trim();
  }

  if (mode === "remove" || mode === "replace") {
    return trimmed.slice(1).trim();
  }

  return trimmed;
}

function stripRestrictionPrefix(input: string): string {
  return input.replace(/^без\s+/, "").replace(/^no\s+/, "").trim();
}

function normalizeInput(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

function matchRestrictionText(plain: string): string[] {
  if (plain.includes("веган")) {
    return ["contains_meat", "contains_fish", "contains_shellfish", "contains_lactose", "contains_eggs"];
  }

  if (plain.includes("вегет")) {
    return ["contains_meat", "contains_fish", "contains_shellfish"];
  }

  if (plain.includes("морепродукт")) {
    return ["contains_fish", "contains_shellfish"];
  }

  if (plain.includes("кальмар") || plain.includes("кревет")) {
    return ["contains_shellfish"];
  }

  if (plain.includes("рыб") || plain.includes("тунец") || plain.includes("лосос") || plain.includes("треск")) {
    return ["contains_fish"];
  }

  if (plain.includes("говядин") || plain.includes("говяж") || plain.includes("beef")) {
    return ["contains_beef"];
  }

  if (plain.includes("свин")) {
    return ["contains_pork"];
  }

  if (plain.includes("мяс")) {
    return ["contains_meat"];
  }

  if (plain.includes("яиц") || plain.includes("яйц") || plain.includes("egg")) {
    return ["contains_eggs"];
  }

  if (plain.includes("лактоз") || plain.includes("молок") || plain.includes("dairy")) {
    return ["contains_lactose"];
  }

  if (plain.includes("глютен") || plain.includes("gluten")) {
    return ["contains_gluten"];
  }

  if (plain.includes("орех") || plain.includes("nut")) {
    return ["contains_nuts"];
  }

  if (plain.includes("соя") || plain.includes("soy")) {
    return ["contains_soy"];
  }

  if (plain.includes("семеч") || plain.includes("seeds")) {
    return ["contains_seeds"];
  }

  if (plain.includes("кунжут") || plain.includes("sesame")) {
    return ["contains_sesame"];
  }

  if (plain.includes("кофеин") || plain.includes("caffeine")) {
    return ["contains_caffeine"];
  }

  if (plain.includes("сахар") || plain.includes("sugar")) {
    return ["contains_added_sugar"];
  }

  const dictionary: Record<string, string[]> = {
    lactose: ["contains_lactose"],
    gluten: ["contains_gluten"],
    nuts: ["contains_nuts"],
    fish: ["contains_fish"],
    seafood: ["contains_shellfish"],
    eggs: ["contains_eggs"],
    soy: ["contains_soy"],
    beef: ["contains_beef"],
    pork: ["contains_pork"],
    meat: ["contains_meat"],
    seeds: ["contains_seeds"],
    sesame: ["contains_sesame"],
    caffeine: ["contains_caffeine"],
    sugar: ["contains_added_sugar"],
  };

  return dictionary[plain] ?? [];
}
