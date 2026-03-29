import { readFile, writeFile } from "node:fs/promises";

const PRICE_SOURCE =
  "USDA FoodData Central + Rosstat / regional retail benchmarks for Omsk, Novosibirsk, Krasnoyarsk, Krasnodar and Saint Petersburg, March 2026";

const CORE_TYPES = ["Foundation", "SR Legacy"];
const BRANDED_TYPES = ["Branded", "Foundation", "SR Legacy"];
const FOUNDATION_PATH = ".cache/usda/foundation/FoodData_Central_foundation_food_json_2025-12-18.json";
const SR_LEGACY_PATH = ".cache/usda/sr_legacy/FoodData_Central_sr_legacy_food_json_2018-04.json";
const REMOVED_PRODUCT_NAMES = ["Coca-Cola", "Холодный чай", "Хлебцы кукурузные"];

const CATEGORY_ORDER = [
  "MEAT",
  "FISH",
  "SEAFOOD",
  "EGG",
  "DAIRY",
  "LEGUME",
  "GRAIN",
  "BREAD",
  "FAT",
  "NUT",
  "VEGETABLE",
  "FRUIT",
  "SNACK",
  "SWEET",
  "DRINK",
];

function productSpec(name, query, category, priceCategory, options = {}) {
  const resolvedCategory = options.category ?? category;
  return {
    name,
    query,
    category: resolvedCategory,
    priceCategory,
    include: options.include ?? [],
    exclude: options.exclude ?? [],
    dataTypes: options.dataTypes ?? CORE_TYPES,
    usageTags: options.usageTags ?? defaultUsageTags(resolvedCategory, name),
    restrictionTags: options.restrictionTags ?? defaultRestrictionTags(resolvedCategory, name),
    defaultServingG: options.defaultServingG ?? defaultServingG(resolvedCategory, name),
    minServingG: options.minServingG ?? defaultMinServingG(resolvedCategory, name),
    maxServingG: options.maxServingG ?? defaultMaxServingG(resolvedCategory, name),
    isJunkFood: options.isJunkFood ?? isJunkCategory(resolvedCategory),
  };
}

function protein(name, query, category, priceCategory, options = {}) {
  return productSpec(name, query, category, priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["protein", "lunch", "dinner"],
  });
}

function snackProtein(name, query, category, priceCategory, options = {}) {
  return productSpec(name, query, category, priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["protein", "breakfast", "snack"],
  });
}

function legume(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "LEGUME", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["protein", "carb", "lunch", "dinner"],
  });
}

function grain(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "GRAIN", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["carb", "breakfast", "lunch", "dinner", "snack"],
  });
}

function bread(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "BREAD", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["carb", "breakfast", "snack"],
  });
}

function vegetable(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "VEGETABLE", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["vegetable", "lunch", "dinner"],
  });
}

function breakfastVegetable(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "VEGETABLE", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["vegetable", "breakfast", "lunch", "dinner"],
  });
}

function fruit(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "FRUIT", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["fruit", "breakfast", "snack"],
  });
}

function nut(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "NUT", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["fat", "breakfast", "snack"],
  });
}

function fat(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "FAT", priceCategory, {
    ...options,
    usageTags: options.usageTags ?? ["fat", "breakfast", "lunch", "dinner", "snack"],
  });
}

function snack(name, query, category, priceCategory, options = {}) {
  return productSpec(name, query, category, priceCategory, {
    ...options,
    dataTypes: options.dataTypes ?? BRANDED_TYPES,
    usageTags: options.usageTags ?? ["junk", "snack"],
    isJunkFood: true,
  });
}

function drink(name, query, priceCategory, options = {}) {
  return productSpec(name, query, "DRINK", priceCategory, {
    ...options,
    dataTypes: options.dataTypes ?? BRANDED_TYPES,
    usageTags: options.usageTags ?? ["drink", "snack"],
    isJunkFood: options.isJunkFood ?? true,
  });
}

function defaultUsageTags(category, name) {
  switch (category) {
    case "MEAT":
    case "FISH":
    case "SEAFOOD":
      return ["protein", "lunch", "dinner"];
    case "EGG":
      return ["protein", "breakfast", "snack"];
    case "DAIRY":
      return ["protein", "breakfast", "snack"];
    case "LEGUME":
      return ["protein", "carb", "lunch", "dinner"];
    case "GRAIN":
      return ["carb", "breakfast", "lunch", "dinner", "snack"];
    case "BREAD":
      return ["carb", "breakfast", "snack"];
    case "FAT":
      return ["fat", "breakfast", "lunch", "dinner", "snack"];
    case "NUT":
      return ["fat", "breakfast", "snack"];
    case "VEGETABLE":
      return name.includes("Том") || name.includes("Огур") || name.includes("Шпин") || name.includes("Салат")
        ? ["vegetable", "breakfast", "lunch", "dinner"]
        : ["vegetable", "lunch", "dinner"];
    case "FRUIT":
      return ["fruit", "breakfast", "snack"];
    case "SNACK":
    case "SWEET":
      return ["junk", "snack"];
    case "DRINK":
      return ["drink", "snack"];
    default:
      return ["snack"];
  }
}

function defaultRestrictionTags(category, name) {
  if (category === "MEAT") {
    return ["contains_meat"];
  }

  if (category === "FISH") {
    return ["contains_fish"];
  }

  if (category === "SEAFOOD") {
    return ["contains_shellfish"];
  }

  if (category === "EGG") {
    return ["contains_eggs"];
  }

  if (category === "DAIRY") {
    return ["contains_lactose"];
  }

  if (category === "NUT") {
    return ["contains_nuts"];
  }

  if (category === "BREAD") {
    return ["contains_gluten"];
  }

  if (category === "GRAIN") {
    if (/(пшениц|булгур|кускус|фарро|манн|соба|макарон|ячнев|овсян)/i.test(name)) {
      return ["contains_gluten"];
    }

    return [];
  }

  if (category === "LEGUME" && /(соя|эдамаме|темпе)/i.test(name)) {
    return ["contains_soy"];
  }

  return [];
}

function defaultServingG(category, name) {
  switch (category) {
    case "MEAT":
    case "FISH":
    case "SEAFOOD":
      return 180;
    case "EGG":
      return name.includes("перепели") ? 90 : 120;
    case "DAIRY":
      return /(айран|ряженка|кефир|йогурт|молоко)/i.test(name) ? 250 : 220;
    case "LEGUME":
      return 180;
    case "GRAIN":
      return /(мюсли|гранола|хлопья|отруби)/i.test(name) ? 60 : 70;
    case "BREAD":
      return 60;
    case "FAT":
      return /(масло)/i.test(name) ? 10 : 25;
    case "NUT":
      return 25;
    case "VEGETABLE":
      return /(зелень|петрушка|укроп|кинза|чеснок)/i.test(name) ? 30 : 150;
    case "FRUIT":
      return /(финик|курага|чернослив|инжир суш)/i.test(name) ? 35 : 160;
    case "SNACK":
    case "SWEET":
      return 45;
    case "DRINK":
      return 250;
    default:
      return 100;
  }
}

function defaultMinServingG(category, name) {
  switch (category) {
    case "MEAT":
    case "FISH":
    case "SEAFOOD":
      return 100;
    case "EGG":
      return 40;
    case "DAIRY":
      return /(айран|ряженка|кефир|йогурт|молоко)/i.test(name) ? 150 : 120;
    case "LEGUME":
      return 100;
    case "GRAIN":
      return /(мюсли|гранола|хлопья|отруби)/i.test(name) ? 30 : 40;
    case "BREAD":
      return 20;
    case "FAT":
      return /(масло)/i.test(name) ? 5 : 10;
    case "NUT":
      return 10;
    case "VEGETABLE":
      return /(зелень|петрушка|укроп|кинза|чеснок)/i.test(name) ? 5 : 60;
    case "FRUIT":
      return /(финик|курага|чернослив|инжир суш)/i.test(name) ? 15 : 80;
    case "SNACK":
    case "SWEET":
      return 20;
    case "DRINK":
      return 150;
    default:
      return 20;
  }
}

function defaultMaxServingG(category, name) {
  switch (category) {
    case "MEAT":
    case "FISH":
    case "SEAFOOD":
      return 280;
    case "EGG":
      return 220;
    case "DAIRY":
      return /(айран|ряженка|кефир|йогурт|молоко)/i.test(name) ? 500 : 350;
    case "LEGUME":
      return 280;
    case "GRAIN":
      return /(мюсли|гранола|хлопья|отруби)/i.test(name) ? 120 : 140;
    case "BREAD":
      return 140;
    case "FAT":
      return /(масло)/i.test(name) ? 25 : 60;
    case "NUT":
      return 60;
    case "VEGETABLE":
      return /(зелень|петрушка|укроп|кинза|чеснок)/i.test(name) ? 60 : 320;
    case "FRUIT":
      return /(финик|курага|чернослив|инжир суш)/i.test(name) ? 80 : 320;
    case "SNACK":
    case "SWEET":
      return 100;
    case "DRINK":
      return 500;
    default:
      return 200;
  }
}

function isJunkCategory(category) {
  return category === "SNACK" || category === "SWEET" || category === "DRINK";
}

const additions = [
  protein("Куриный фарш 5%", "ground chicken 95% lean raw", "MEAT", "CHEAP", {
    include: ["ground", "chicken"],
  }),
  protein("Куриная печень", "chicken liver raw", "MEAT", "CHEAP", {
    include: ["chicken", "liver"],
  }),
  protein("Куриные сердечки", "chicken heart raw", "MEAT", "CHEAP", {
    include: ["chicken", "heart"],
  }),
  protein("Фарш из индейки 7%", "ground turkey 93% lean raw", "MEAT", "MID", {
    include: ["ground", "turkey"],
  }),
  protein("Голень индейки без кожи", "turkey drumstick meat only raw", "MEAT", "MID", {
    include: ["turkey", "drumstick"],
  }),
  protein("Говядина лопатка", "beef chuck raw", "MEAT", "MID", {
    include: ["beef", "chuck"],
  }),
  protein("Говядина тонкий край", "beef loin top sirloin raw", "MEAT", "HIGH", {
    include: ["beef", "sirloin"],
  }),
  protein("Говяжья печень", "beef liver raw", "MEAT", "CHEAP", {
    include: ["beef", "liver"],
  }),
  protein("Телятина вырезка", "veal loin raw", "MEAT", "HIGH", {
    include: ["veal", "loin"],
  }),
  protein("Телятина окорок", "veal leg raw", "MEAT", "HIGH", {
    include: ["veal", "leg"],
  }),
  protein("Свинина окорок", "pork ham lean raw", "MEAT", "MID", {
    include: ["pork", "ham"],
  }),
  protein("Свинина лопатка постная", "pork shoulder lean raw", "MEAT", "MID", {
    include: ["pork", "shoulder"],
  }),
  protein("Минтай", "pollock raw", "FISH", "CHEAP", {
    include: ["pollock"],
  }),
  protein("Хек", "hake raw", "FISH", "CHEAP", {
    include: ["hake"],
  }),
  protein("Горбуша", "pink salmon raw", "FISH", "MID", {
    include: ["pink", "salmon"],
  }),
  protein("Форель радужная", "rainbow trout raw", "FISH", "HIGH", {
    include: ["rainbow", "trout"],
  }),
  protein("Тилапия", "tilapia raw", "FISH", "MID", {
    include: ["tilapia"],
  }),
  protein("Пикша", "haddock raw", "FISH", "MID", {
    include: ["haddock"],
  }),
  protein("Сайда", "pollock alaska raw", "FISH", "CHEAP", {
    include: ["pollock"],
  }),
  protein("Сардины консервированные в собственном соку", "sardines canned in water", "FISH", "MID", {
    include: ["sardines", "water"],
  }),
  protein("Мидии", "mussels cooked moist heat", "SEAFOOD", "HIGH", {
    include: ["mussels"],
  }),
  productSpec("Яйцо перепелиное", "quail egg raw", "EGG", "MID", {
    include: ["quail", "egg"],
    usageTags: ["protein", "breakfast", "snack"],
  }),
  snackProtein("Скир обезжиренный", "skyr nonfat plain", "DAIRY", "MID", {
    include: ["skyr"],
  }),
  snackProtein("Сыр зерненый 5%", "cottage cheese 4% milkfat", "DAIRY", "MID", {
    include: ["cottage", "cheese"],
  }),
  snackProtein("Йогурт натуральный 2.5%", "yogurt plain lowfat", "DAIRY", "MID", {
    include: ["yogurt", "plain"],
    exclude: ["greek"],
    usageTags: ["protein", "breakfast", "snack"],
  }),
  snackProtein("Айран 1%", "kefir lowfat plain", "DAIRY", "CHEAP", {
    include: ["kefir"],
    usageTags: ["protein", "breakfast", "snack"],
  }),
  snackProtein("Ряженка 2.5%", "cultured lowfat milk plain", "DAIRY", "MID", {
    include: ["cultured", "milk"],
    usageTags: ["protein", "breakfast", "snack"],
  }),
  snackProtein("Творог 2%", "cottage cheese 2% milkfat", "DAIRY", "CHEAP", {
    include: ["cottage", "cheese"],
  }),
  snackProtein("Творог 9%", "cottage cheese 8% milkfat", "DAIRY", "MID", {
    include: ["cottage", "cheese"],
  }),
  legume("Эдамаме", "edamame frozen prepared", "MID", {
    include: ["edamame"],
    restrictionTags: ["contains_soy"],
  }),
  legume("Фасоль белая", "white beans cooked", "CHEAP", {
    include: ["white", "beans"],
  }),
  legume("Фасоль черная", "black beans cooked", "CHEAP", {
    include: ["black", "beans"],
  }),
  legume("Маш вареный", "mung beans cooked", "MID", {
    include: ["mung", "beans"],
  }),
  legume("Горох вареный", "peas split cooked", "CHEAP", {
    include: ["peas", "split"],
  }),
  legume("Темпе", "tempeh", "HIGH", {
    include: ["tempeh"],
    restrictionTags: ["contains_soy"],
    usageTags: ["protein", "lunch", "dinner"],
  }),

  grain("Рис басмати", "basmati rice dry", "MID", {
    include: ["basmati", "rice"],
  }),
  grain("Рис жасмин", "jasmine rice dry", "MID", {
    include: ["jasmine", "rice"],
  }),
  grain("Рис круглозерный", "white rice short grain dry", "CHEAP", {
    include: ["white", "rice", "short"],
  }),
  grain("Пшено", "millet dry", "CHEAP", {
    include: ["millet"],
  }),
  grain("Манная крупа", "semolina dry", "CHEAP", {
    include: ["semolina"],
  }),
  grain("Ячневая крупа", "pearled barley dry", "CHEAP", {
    include: ["barley"],
  }),
  grain("Кукурузная крупа", "cornmeal dry", "CHEAP", {
    include: ["cornmeal"],
  }),
  grain("Соба", "buckwheat soba noodles dry", "MID", {
    include: ["soba"],
  }),
  grain("Лапша рисовая", "rice noodles dry", "MID", {
    include: ["rice", "noodles"],
  }),
  grain("Макароны из твердых сортов", "durum wheat pasta dry", "CHEAP", {
    include: ["durum", "pasta"],
  }),
  grain("Овсяные отруби", "oat bran raw", "CHEAP", {
    include: ["oat", "bran"],
  }),
  grain("Хлопья гречневые", "buckwheat flakes dry", "MID", {
    include: ["buckwheat", "flakes"],
  }),
  grain("Кукурузные хлопья", "corn flakes", "MID", {
    include: ["corn", "flakes"],
    dataTypes: BRANDED_TYPES,
  }),
  grain("Мюсли без сахара", "muesli dry", "MID", {
    include: ["muesli"],
    dataTypes: BRANDED_TYPES,
  }),
  grain("Гранола", "granola", "MID", {
    include: ["granola", "cereal"],
    exclude: ["bar"],
    dataTypes: BRANDED_TYPES,
  }),
  bread("Хлеб бородинский", "rye bread", "CHEAP", {
    include: ["rye", "bread"],
  }),
  bread("Лаваш тонкий", "pita bread", "CHEAP", {
    include: ["pita", "bread"],
    defaultServingG: 70,
    minServingG: 35,
    maxServingG: 140,
  }),
  bread("Пита пшеничная", "pita bread wheat", "CHEAP", {
    include: ["pita", "bread"],
  }),
  bread("Хлебцы гречневые", "buckwheat crispbread", "MID", {
    include: ["buckwheat"],
    dataTypes: BRANDED_TYPES,
  }),
  bread("Хлебцы кукурузные", "corn crispbread", "MID", {
    include: ["corn", "crispbread"],
    exclude: ["oil"],
    dataTypes: BRANDED_TYPES,
  }),

  breakfastVegetable("Томаты черри", "cherry tomatoes raw", "MID", {
    include: ["cherry", "tomatoes"],
  }),
  breakfastVegetable("Руккола", "arugula raw", "MID", {
    include: ["arugula"],
  }),
  breakfastVegetable("Ромэн", "romaine lettuce raw", "MID", {
    include: ["romaine"],
  }),
  breakfastVegetable("Листовой салат", "green leaf lettuce raw", "CHEAP", {
    include: ["leaf", "lettuce"],
  }),
  breakfastVegetable("Сельдерей стеблевой", "celery raw", "CHEAP", {
    include: ["celery"],
  }),
  breakfastVegetable("Редис", "radish raw", "CHEAP", {
    include: ["radish"],
  }),
  vegetable("Тыква", "pumpkin raw", "CHEAP", {
    include: ["pumpkin"],
    exclude: ["seeds"],
  }),
  vegetable("Спаржа", "asparagus raw", "HIGH", {
    include: ["asparagus"],
  }),
  vegetable("Фасоль стручковая", "green beans raw", "CHEAP", {
    include: ["green", "beans"],
  }),
  vegetable("Зеленый горошек", "green peas raw", "CHEAP", {
    include: ["green", "peas"],
  }),
  vegetable("Кукуруза сладкая", "sweet corn kernels", "MID", {
    include: ["sweet", "corn"],
  }),
  vegetable("Брюссельская капуста", "brussels sprouts raw", "MID", {
    include: ["brussels", "sprouts"],
  }),
  vegetable("Пекинская капуста", "napa cabbage raw", "CHEAP", {
    include: ["napa", "cabbage"],
  }),
  vegetable("Краснокочанная капуста", "red cabbage raw", "CHEAP", {
    include: ["red", "cabbage"],
  }),
  vegetable("Лук красный", "red onion raw", "CHEAP", {
    include: ["red", "onion"],
    exclude: ["rings", "breaded"],
  }),
  vegetable("Лук-порей", "leeks raw", "MID", {
    include: ["leeks"],
  }),
  vegetable("Чеснок", "garlic raw", "CHEAP", {
    include: ["garlic"],
  }),
  vegetable("Дайкон", "daikon radish raw", "CHEAP", {
    include: ["daikon"],
  }),
  vegetable("Редька зеленая", "radish raw", "CHEAP", {
    include: ["radish"],
  }),
  vegetable("Репа", "turnip raw", "CHEAP", {
    include: ["turnip"],
  }),
  breakfastVegetable("Вешенки", "oyster mushrooms raw", "MID", {
    include: ["oyster", "mushrooms"],
  }),
  breakfastVegetable("Цукини", "zucchini raw", "CHEAP", {
    include: ["zucchini"],
  }),
  breakfastVegetable("Петрушка", "parsley raw", "MID", {
    include: ["parsley"],
  }),
  breakfastVegetable("Укроп", "dill fresh", "MID", {
    include: ["dill"],
    exclude: ["pickles", "cucumber"],
  }),
  breakfastVegetable("Кинза", "cilantro raw", "MID", {
    include: ["cilantro"],
  }),
  breakfastVegetable("Зеленый лук", "spring onions raw", "CHEAP", {
    include: ["spring", "onions"],
  }),
  vegetable("Щавель", "sorrel raw", "MID", {
    include: ["sorrel"],
  }),
  breakfastVegetable("Салат корн", "corn salad raw", "MID", {
    include: ["corn", "salad"],
  }),
  vegetable("Капуста савойская", "savoy cabbage raw", "CHEAP", {
    include: ["savoy", "cabbage"],
  }),
  vegetable("Корень сельдерея", "celeriac raw", "MID", {
    include: ["celeriac"],
  }),
  vegetable("Оливки", "olives canned ripe", "MID", {
    include: ["olives"],
    category: "FAT",
    usageTags: ["fat", "breakfast", "lunch", "dinner", "snack"],
    defaultServingG: 35,
    minServingG: 10,
    maxServingG: 80,
  }),
  vegetable("Маслины", "black olives canned", "MID", {
    include: ["olives"],
    category: "FAT",
    usageTags: ["fat", "breakfast", "lunch", "dinner", "snack"],
    defaultServingG: 35,
    minServingG: 10,
    maxServingG: 80,
  }),

  fruit("Персик", "peach raw", "MID", {
    include: ["peach"],
  }),
  fruit("Нектарин", "nectarine raw", "MID", {
    include: ["nectarine"],
  }),
  fruit("Слива", "plums raw", "CHEAP", {
    include: ["plums"],
  }),
  fruit("Абрикос", "apricots raw", "CHEAP", {
    include: ["apricots"],
  }),
  fruit("Грейпфрут", "grapefruit raw", "MID", {
    include: ["grapefruit"],
    exclude: ["juice"],
  }),
  fruit("Помело", "pomelo raw", "MID", {
    include: ["pomelo"],
  }),
  fruit("Ананас", "pineapple raw", "MID", {
    include: ["pineapple"],
  }),
  fruit("Манго", "mango raw", "MID", {
    include: ["mango"],
  }),
  fruit("Арбуз", "watermelon raw", "CHEAP", {
    include: ["watermelon"],
  }),
  fruit("Дыня", "cantaloupe raw", "CHEAP", {
    include: ["cantaloupe"],
  }),
  fruit("Малина", "raspberries raw", "HIGH", {
    include: ["raspberries"],
  }),
  fruit("Ежевика", "blackberries raw", "HIGH", {
    include: ["blackberries"],
  }),
  fruit("Вишня", "cherries sweet raw", "MID", {
    include: ["cherries"],
  }),
  fruit("Черешня", "cherries sweet raw", "MID", {
    include: ["cherries"],
  }),
  fruit("Гранат", "pomegranate raw", "MID", {
    include: ["pomegranate"],
    exclude: ["juice"],
  }),
  fruit("Хурма", "persimmons raw", "MID", {
    include: ["persimmons"],
  }),
  fruit("Черника", "bilberries raw", "HIGH", {
    include: ["bilberries"],
  }),
  fruit("Смородина черная", "currants black raw", "MID", {
    include: ["currants", "black"],
  }),
  fruit("Смородина красная", "currants red raw", "MID", {
    include: ["currants", "red"],
  }),
  fruit("Клюква", "cranberries raw", "MID", {
    include: ["cranberries"],
  }),
  fruit("Финики", "dates medjool", "MID", {
    include: ["dates"],
    defaultServingG: 35,
    minServingG: 15,
    maxServingG: 80,
  }),
  fruit("Курага", "apricots dried", "MID", {
    include: ["apricots", "dried"],
    defaultServingG: 35,
    minServingG: 15,
    maxServingG: 80,
  }),
  fruit("Чернослив", "prunes dried", "MID", {
    include: ["prunes"],
    defaultServingG: 35,
    minServingG: 15,
    maxServingG: 80,
  }),
  fruit("Инжир сушеный", "figs dried", "MID", {
    include: ["figs", "dried"],
    defaultServingG: 35,
    minServingG: 15,
    maxServingG: 80,
  }),
  fruit("Лимон", "lemon raw", "CHEAP", {
    include: ["lemon"],
    exclude: ["chicken", "restaurant"],
  }),
  fruit("Инжир", "figs raw", "MID", {
    include: ["figs"],
  }),
  fruit("Облепиха", "sea buckthorn raw", "HIGH", {
    include: ["sea", "buckthorn"],
  }),

  nut("Фисташки", "pistachios dry roasted", "HIGH", {
    include: ["pistachios"],
  }),
  nut("Пекан", "pecans raw", "HIGH", {
    include: ["pecans"],
  }),
  nut("Кедровые орехи", "pine nuts raw", "HIGH", {
    include: ["pine", "nuts"],
  }),
  nut("Семена чиа", "chia seeds", "HIGH", {
    include: ["chia"],
  }),
  nut("Льняное семя", "flaxseed", "MID", {
    include: ["flaxseed"],
  }),
  nut("Кунжут", "sesame seeds", "MID", {
    include: ["sesame", "seeds"],
    exclude: ["butter", "tahini"],
  }),
  fat("Тахини", "tahini sesame butter", "HIGH", {
    include: ["tahini"],
    defaultServingG: 20,
    minServingG: 10,
    maxServingG: 40,
  }),
  fat("Масло льняное", "flaxseed oil", "MID", {
    include: ["flaxseed", "oil"],
  }),
  fat("Масло кунжутное", "sesame oil", "MID", {
    include: ["sesame", "oil"],
  }),
  fat("Масло кукурузное", "corn oil", "CHEAP", {
    include: ["corn", "oil"],
  }),
  fat("Паста кешью", "cashew butter", "HIGH", {
    include: ["cashew", "butter"],
    defaultServingG: 20,
    minServingG: 10,
    maxServingG: 40,
  }),
  fat("Паста миндальная", "almond butter", "HIGH", {
    include: ["almond", "butter"],
    defaultServingG: 20,
    minServingG: 10,
    maxServingG: 40,
  }),
  nut("Кокосовая стружка", "coconut unsweetened dried", "MID", {
    include: ["coconut"],
  }),
  nut("Бразильский орех", "brazil nuts raw", "HIGH", {
    include: ["brazil", "nuts"],
  }),

  snack("Twix", "twix candy bar", "SWEET", "MID", {
    include: ["twix"],
  }),
  snack("KitKat", "kit kat bar", "SWEET", "MID", {
    include: ["kit", "kat"],
  }),
  snack("Bounty", "bounty candy bar", "SWEET", "MID", {
    include: ["bounty"],
  }),
  snack("Печенье овсяное", "oatmeal cookies", "SWEET", "CHEAP", {
    include: ["oatmeal", "cookies"],
  }),
  snack("Крекеры соленые", "saltine crackers", "SNACK", "CHEAP", {
    include: ["crackers"],
  }),
  snack("Мармелад", "fruit gummies candy", "SWEET", "CHEAP", {
    include: ["gummies"],
  }),
  snack("Пастила", "fruit leather", "SWEET", "CHEAP", {
    include: ["fruit", "leather"],
  }),
  snack("Пряники", "gingerbread cookies", "SWEET", "CHEAP", {
    include: ["gingerbread"],
  }),
  snack("Вафли сливочные", "wafer cookies", "SWEET", "CHEAP", {
    include: ["wafer"],
  }),
  snack("Попкорн соленый", "popcorn air popped salted", "SNACK", "CHEAP", {
    include: ["popcorn"],
  }),
  snack("Попкорн сладкий", "caramel popcorn", "SWEET", "MID", {
    include: ["caramel", "popcorn"],
  }),
  drink("Coca-Cola", "coca cola", "CHEAP", {
    include: ["coca", "cola"],
    usageTags: ["drink", "snack"],
  }),
  drink("Апельсиновый сок", "orange juice", "MID", {
    include: ["orange", "juice"],
    isJunkFood: false,
    usageTags: ["drink", "breakfast", "snack"],
  }),
  drink("Яблочный сок", "apple juice", "MID", {
    include: ["apple", "juice"],
    isJunkFood: false,
    usageTags: ["drink", "breakfast", "snack"],
  }),
  drink("Холодный чай", "iced tea sweetened", "CHEAP", {
    include: ["iced", "tea"],
  }),
  snack("Чипсы сырные", "cheese crisps", "SNACK", "MID", {
    include: ["cheese", "crisps"],
  }),
  snack("Злаковый батончик", "cereal bar", "SNACK", "CHEAP", {
    include: ["cereal", "bar"],
  }),
  snack("Батончик протеиновый", "protein bar", "SNACK", "MID", {
    include: ["protein", "bar"],
  }),
  drink("Энергетик Burn", "burn energy drink", "MID", {
    include: ["burn"],
  }),
  snack("Сушеное манго", "mango dried sweetened", "SWEET", "MID", {
    include: ["mango", "dried"],
  }),
  snack("Соленый арахис", "peanuts dry roasted salted", "SNACK", "CHEAP", {
    include: ["peanuts"],
    category: "NUT",
    usageTags: ["fat", "snack"],
    restrictionTags: ["contains_nuts"],
    isJunkFood: true,
    defaultServingG: 30,
    minServingG: 10,
    maxServingG: 60,
  }),
];

function normalizeCategory(spec) {
  if (spec.category) {
    return spec.category;
  }

  return "SNACK";
}

function nutrientValue(food, nutrientNumbers) {
  const nutrients = food.foodNutrients ?? [];
  for (const nutrient of nutrients) {
    const nutrientNumber = nutrient.nutrient?.number ?? nutrient.nutrientNumber;
    if (nutrientNumbers.includes(String(nutrientNumber))) {
      return Number(nutrient.value ?? nutrient.amount ?? 0);
    }
  }
  return 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function extractMacros(food) {
  const protein = nutrientValue(food, ["1003", "203"]);
  const fat = nutrientValue(food, ["1004", "204"]);
  const carbs = nutrientValue(food, ["1005", "205"]);
  let calories = nutrientValue(food, ["1008", "208"]);

  if (!calories || calories <= 0) {
    calories = protein * 4 + carbs * 4 + fat * 9;
  }

  return {
    caloriesPer100g: round(calories, 1),
    proteinPer100g: round(protein, 1),
    fatPer100g: round(fat, 1),
    carbsPer100g: round(carbs, 1),
  };
}

function applyMacroFixups(product) {
  if (product.category === "FAT" && /oil/i.test(product.usdaDescription) && product.fatPer100g <= 0) {
    return {
      ...product,
      caloriesPer100g: 884,
      proteinPer100g: 0,
      fatPer100g: 100,
      carbsPer100g: 0,
    };
  }

  return product;
}

function pickFood(spec, foods) {
  const scored = foods.map((food) => {
    const description = String(food.description ?? "").toLowerCase();
    let score = 0;
    const queryTokens = tokenizeQuery(spec.query);
    const queryMatches = queryTokens.filter((token) => description.includes(token)).length;

    for (const token of spec.include) {
      if (description.includes(token.toLowerCase())) {
        score += 5;
      }
    }

    for (const token of spec.exclude) {
      if (description.includes(token.toLowerCase())) {
        score -= 100;
      }
    }

    if (food.dataType === "Foundation") {
      score += 2;
    } else if (food.dataType === "SR Legacy") {
      score += 1;
    }

    score += queryMatches * 2;

    if (description === spec.query.toLowerCase()) {
      score += 6;
    } else if (description.startsWith(spec.query.toLowerCase())) {
      score += 4;
    }

    return { food, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0] && scored[0].score > 0 ? scored[0].food : null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeQuery(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function searchUsdaLocal(spec, foods) {
  const tokens = tokenizeQuery(spec.query);
  const narrowed = foods.filter((food) => {
    const description = String(food.description ?? "").toLowerCase();
    const includeMatch = spec.include.length === 0 || spec.include.every((token) => description.includes(token.toLowerCase()));
    const queryMatches = tokens.filter((token) => description.includes(token)).length;
    return includeMatch && (queryMatches >= Math.min(2, tokens.length) || spec.include.length > 0);
  });

  if (narrowed.length === 0) {
    return null;
  }

  return pickFood(spec, narrowed);
}

async function loadFoods() {
  const foundationPayload = JSON.parse(await readFile(FOUNDATION_PATH, "utf8"));
  const srLegacyPayload = JSON.parse(await readFile(SR_LEGACY_PATH, "utf8"));

  return [
    ...(foundationPayload.FoundationFoods ?? []),
    ...(srLegacyPayload.SRLegacyFoods ?? []),
  ];
}

function withDerivedTags(product) {
  const restrictionTags = [...new Set(product.restrictionTags)];

  if (product.category === "MEAT" && /говяд|beef/i.test(product.name + product.usdaDescription)) {
    restrictionTags.push("contains_beef");
  }

  if (product.category === "MEAT" && /свин|pork/i.test(product.name + product.usdaDescription)) {
    restrictionTags.push("contains_pork");
  }

  return {
    ...product,
    restrictionTags: [...new Set(restrictionTags)],
  };
}

function sortProducts(products) {
  return [...products].sort((left, right) => {
    const categoryDelta = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }
    return left.name.localeCompare(right.name, "ru");
  });
}

async function main() {
  const existing = JSON.parse(await readFile("src/catalog/products.json", "utf8"));
  const byName = new Map(existing.map((product) => [product.name, { ...product, priceSource: PRICE_SOURCE }]));
  const foods = await loadFoods();
  let added = 0;

  for (const spec of additions) {
    try {
      const food = searchUsdaLocal(spec, foods);

      if (!food) {
        throw new Error(`No USDA match for "${spec.name}"`);
      }
      const macros = extractMacros(food);
      const category = normalizeCategory(spec);
      const product = withDerivedTags({
        name: spec.name,
        usdaFdcId: Number(food.fdcId),
        usdaDescription: String(food.description ?? spec.query),
        priceSource: PRICE_SOURCE,
        ...macros,
        category,
        priceCategory: spec.priceCategory,
        restrictionTags: spec.restrictionTags,
        usageTags: spec.usageTags,
        defaultServingG: spec.defaultServingG,
        minServingG: spec.minServingG,
        maxServingG: spec.maxServingG,
        isJunkFood: spec.isJunkFood,
      });

      byName.set(product.name, applyMacroFixups(product));
      added += 1;
      console.log(`Added ${product.name} -> USDA ${product.usdaFdcId}`);
      await sleep(120);
    } catch (error) {
      byName.delete(spec.name);
      console.warn(`Skipped ${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const name of REMOVED_PRODUCT_NAMES) {
    byName.delete(name);
  }

  const merged = sortProducts([...byName.values()]);
  await writeFile("src/catalog/products.json", `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`Catalog written. Added ${added} products, total ${merged.length}.`);
}

await main();
