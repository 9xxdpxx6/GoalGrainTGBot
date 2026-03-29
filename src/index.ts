import { Update } from "telegraf/types";

import { createBot } from "./bot/app";
import { prisma } from "./config/prisma";

async function main() {
  const bot = createBot();
  let shouldStop = false;
  let pollingErrorCount = 0;

  const shutdown = async () => {
    shouldStop = true;
    await prisma.$disconnect();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  bot.botInfo = await withRetry(() => bot.telegram.getMe(), "telegram.getMe");
  await withRetry(
    () => bot.telegram.deleteWebhook({ drop_pending_updates: false }),
    "telegram.deleteWebhook",
  );
  await withRetry(
    () =>
      bot.telegram.setMyCommands([
        { command: "start", description: "Открыть бота и заполнить профиль" },
        { command: "profile", description: "Показать текущий профиль" },
        { command: "generate", description: "Сгенерировать рацион на день" },
      ]),
    "telegram.setMyCommands",
  );

  console.log(`GoalGrain bot started as @${bot.botInfo.username}.`);

  let offset = 0;

  while (!shouldStop) {
    try {
      const updates = (await bot.telegram.callApi("getUpdates", {
        timeout: 30,
        offset,
        allowed_updates: [],
      })) as Update[];

      pollingErrorCount = 0;

      if (updates.length > 0) {
        offset = updates[updates.length - 1].update_id + 1;
      }

      for (const update of updates) {
        await bot.handleUpdate(update);
      }
    } catch (error) {
      pollingErrorCount += 1;
      console.error("GoalGrain polling failed:", error);

      if (!isRetryableNetworkError(error)) {
        await delay(1_000);
        continue;
      }

      const waitMs = Math.min(100 * 2 ** Math.min(pollingErrorCount - 1, 4), 1_500);
      await delay(waitMs);
    }
  }
}

async function withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;

      if (!isRetryableNetworkError(error) || attempt >= 8) {
        throw error;
      }

      const waitMs = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      console.warn(`${label} failed, retrying in ${waitMs}ms (attempt ${attempt}/8).`);
      await delay(waitMs);
    }
  }
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; errno?: string; type?: string };

  return (
    maybeError.code === "ECONNRESET" ||
    maybeError.code === "ETIMEDOUT" ||
    maybeError.code === "ERR_SOCKET_TIMEOUT" ||
    maybeError.code === "ECONNREFUSED" ||
    maybeError.code === "EAI_AGAIN" ||
    maybeError.code === "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC" ||
    maybeError.errno === "ECONNRESET" ||
    maybeError.errno === "ETIMEDOUT" ||
    maybeError.errno === "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC" ||
    maybeError.type === "system" ||
    maybeError.type === "request-timeout"
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(async (error) => {
  console.error("Failed to start GoalGrain bot:", error);
  await prisma.$disconnect();
  process.exit(1);
});
