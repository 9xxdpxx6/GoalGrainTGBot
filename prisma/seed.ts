import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Budget, PrismaClient, ProductCategory } from "@prisma/client";
import { config } from "dotenv";

import productCatalog from "../src/catalog/products.json";

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
});

async function main() {
  await prisma.product.deleteMany();

  for (const product of productCatalog) {
    await prisma.product.create({
      data: {
        name: product.name,
        usdaFdcId: product.usdaFdcId,
        usdaDescription: product.usdaDescription,
        priceSource: product.priceSource,
        caloriesPer100g: product.caloriesPer100g,
        proteinPer100g: product.proteinPer100g,
        fatPer100g: product.fatPer100g,
        carbsPer100g: product.carbsPer100g,
        category: product.category as ProductCategory,
        priceCategory: product.priceCategory as Budget,
        restrictionTags: product.restrictionTags,
        usageTags: product.usageTags,
        defaultServingG: product.defaultServingG,
        minServingG: product.minServingG,
        maxServingG: product.maxServingG,
        isJunkFood: product.isJunkFood,
      },
    });
  }

  console.log(`Seeded ${productCatalog.length} products.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
