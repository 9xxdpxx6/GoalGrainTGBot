import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  POLZA_AI_API_KEY: z.string().min(1).optional(),
  POLZA_AI_BASE_URL: z.string().url().default("https://polza.ai/api/v1"),
  POLZA_AI_MODEL: z.string().min(1).default("openai/gpt-4o"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse(process.env);

export function requireEnvValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
