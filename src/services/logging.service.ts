import { ActionType, Log, Prisma } from "@prisma/client";

import { LogRepository } from "../repositories/log.repository";
import { DailyPlan, DailyRecipeItem } from "../types/domain";

export class LoggingService {
  constructor(private readonly logRepository: LogRepository) {}

  async logAction(input: {
    userId?: number | null;
    actionType: ActionType;
    inputData: unknown;
    outputData: unknown;
  }): Promise<Log> {
    try {
      return await this.logRepository.create(input);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003" || input.userId == null) {
        throw error;
      }

      return this.logRepository.create({
        ...input,
        userId: null,
        inputData: attachTelegramUserId(input.inputData, input.userId),
      });
    }
  }

  async getLatestPlan(userId: number): Promise<DailyPlan | null> {
    return this.logRepository.findLatestPlan(userId);
  }

  async getRecentPlans(userId: number, limit = 5): Promise<DailyPlan[]> {
    return this.logRepository.findRecentPlans(userId, limit);
  }

  async getPlanByLogId(logId: string, userId: number): Promise<DailyPlan | null> {
    return this.logRepository.findPlanByLogId(logId, userId);
  }

  async getRecipeBundleByLogId(logId: string, userId: number): Promise<DailyRecipeItem[] | null> {
    return this.logRepository.findRecipeBundleByLogId(logId, userId);
  }
}

function attachTelegramUserId(inputData: unknown, userId: number) {
  if (inputData && typeof inputData === "object" && !Array.isArray(inputData)) {
    return {
      ...inputData,
      telegramUserId: userId,
    };
  }

  return {
    telegramUserId: userId,
    originalInputData: inputData,
  };
}
