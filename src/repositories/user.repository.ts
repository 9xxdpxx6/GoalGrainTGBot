import { User } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ProfileInput } from "../types/domain";
import { toPrismaJson } from "../utils/serialization";

export class UserRepository {
  async findByTelegramId(userId: number): Promise<User | null> {
    return prisma.user.findUnique({
      where: { userId: BigInt(userId) },
    });
  }

  async upsertProfile(userId: number, profile: ProfileInput): Promise<User> {
    return prisma.user.upsert({
      where: { userId: BigInt(userId) },
      create: {
        userId: BigInt(userId),
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        goal: profile.goal,
        targetCalories: profile.targetCalories,
        budget: profile.budget,
        allowJunkFood: profile.allowJunkFood,
        limitations: toPrismaJson(profile.limitations),
      },
      update: {
        lastSeenAt: new Date(),
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        goal: profile.goal,
        targetCalories: profile.targetCalories,
        budget: profile.budget,
        allowJunkFood: profile.allowJunkFood,
        limitations: toPrismaJson(profile.limitations),
      },
    });
  }

  async setAllowJunkFood(userId: number, allowJunkFood: boolean): Promise<User> {
    return prisma.user.update({
      where: { userId: BigInt(userId) },
      data: {
        allowJunkFood,
        lastSeenAt: new Date(),
      },
    });
  }

  async touchLastSeen(userId: number): Promise<void> {
    await prisma.user.updateMany({
      where: { userId: BigInt(userId) },
      data: { lastSeenAt: new Date() },
    });
  }
}
