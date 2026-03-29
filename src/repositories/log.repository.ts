import { ActionType } from "@prisma/client";

import { prisma } from "../config/prisma";
import { DailyPlan, DailyRecipeItem } from "../types/domain";
import { toPrismaJson } from "../utils/serialization";

export class LogRepository {
  async create(input: {
    userId?: number | null;
    actionType: ActionType;
    inputData: unknown;
    outputData: unknown;
  }) {
    return prisma.log.create({
      data: {
        userId: input.userId === undefined || input.userId === null ? null : BigInt(input.userId),
        actionType: input.actionType,
        inputData: toPrismaJson(input.inputData),
        outputData: toPrismaJson(input.outputData),
      },
    });
  }

  async findLatestPlan(userId: number): Promise<DailyPlan | null> {
    const logs = await this.findPlanLogs(userId, 10);

    for (const log of logs) {
      if (
        log.outputData &&
        typeof log.outputData === "object" &&
        !Array.isArray(log.outputData) &&
        "plan" in log.outputData
      ) {
        return log.outputData.plan as unknown as DailyPlan;
      }
    }

    return null;
  }

  async findRecentPlans(userId: number, limit: number): Promise<DailyPlan[]> {
    const logs = await this.findPlanLogs(userId, limit);
    const plans: DailyPlan[] = [];

    for (const log of logs) {
      if (
        log.outputData &&
        typeof log.outputData === "object" &&
        !Array.isArray(log.outputData) &&
        "plan" in log.outputData
      ) {
        plans.push(log.outputData.plan as unknown as DailyPlan);
      }
    }

    return plans;
  }

  async findPlanByLogId(logId: string, userId: number): Promise<DailyPlan | null> {
    const log = await prisma.log.findFirst({
      where: {
        logId: BigInt(logId),
        userId: BigInt(userId),
        actionType: {
          in: [ActionType.GENERATE_DAY, ActionType.REGENERATE_MEAL],
        },
      },
    });

    if (
      !log?.outputData ||
      typeof log.outputData !== "object" ||
      Array.isArray(log.outputData) ||
      !("plan" in log.outputData)
    ) {
      return null;
    }

    return log.outputData.plan as unknown as DailyPlan;
  }

  async findRecipeBundleByLogId(logId: string, userId: number): Promise<DailyRecipeItem[] | null> {
    const log = await prisma.log.findFirst({
      where: {
        logId: BigInt(logId),
        userId: BigInt(userId),
        actionType: ActionType.REQUEST_RECIPE,
      },
    });

    if (
      !log?.outputData ||
      typeof log.outputData !== "object" ||
      Array.isArray(log.outputData) ||
      !("recipes" in log.outputData) ||
      !Array.isArray(log.outputData.recipes)
    ) {
      return null;
    }

    return log.outputData.recipes as unknown as DailyRecipeItem[];
  }

  private async findPlanLogs(userId: number, take: number) {
    return prisma.log.findMany({
      where: {
        userId: BigInt(userId),
        actionType: {
          in: [ActionType.GENERATE_DAY, ActionType.REGENERATE_MEAL],
        },
      },
      orderBy: { timestamp: "desc" },
      take,
    });
  }
}
