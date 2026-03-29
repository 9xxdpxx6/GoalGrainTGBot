import { Product } from "@prisma/client";

import { prisma } from "../config/prisma";

export class ProductRepository {
  async findAll(): Promise<Product[]> {
    return prisma.product.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  async findByIds(productIds: number[]): Promise<Product[]> {
    if (productIds.length === 0) {
      return [];
    }

    return prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
    });
  }
}
