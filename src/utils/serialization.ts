import { Prisma } from "@prisma/client";

function serializer(_: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, serializer)) as Prisma.InputJsonValue;
}
