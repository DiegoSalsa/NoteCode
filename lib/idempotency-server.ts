import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  IdempotencyStore,
  isValidIdempotencyKey,
  runIdempotent,
} from "@/lib/idempotency";

const TTL_MS = 24 * 60 * 60 * 1000;

function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const prismaIdempotencyStore: IdempotencyStore = {
  async begin(userId, key) {
    try {
      await prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          method: "POST",
          path: "",
          pending: true,
          statusCode: 0,
          responseBody: { pending: true },
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });
      return "created";
    } catch (error) {
      if (isUniqueError(error)) return "exists";
      throw error;
    }
  },
  async get<T>(userId: string, key: string) {
    const row = await prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!row) return null;
    return {
      status: row.pending ? "pending" : "complete",
      statusCode: row.statusCode,
      body: row.responseBody as T,
    };
  },
  async complete(userId, key, statusCode, body) {
    await prisma.idempotencyRecord.update({
      where: { userId_key: { userId, key } },
      data: {
        pending: false,
        statusCode,
        responseBody: body as Prisma.InputJsonValue,
      },
    });
  },
  async abort(userId, key) {
    await prisma.idempotencyRecord.deleteMany({
      where: { userId, key, pending: true },
    });
  },
};

export async function jsonWithIdempotency<T>(
  request: NextRequest,
  userId: string,
  execute: () => Promise<{ status: number; body: T }>,
) {
  const key = request.headers.get("idempotency-key")?.trim() || null;
  if (key && !isValidIdempotencyKey(key)) {
    return NextResponse.json({ error: "Idempotency-Key inválida." }, { status: 400 });
  }
  const result = await runIdempotent(prismaIdempotencyStore, { userId, key }, execute);
  const response = NextResponse.json(result.body, { status: result.status });
  if (key) response.headers.set("Idempotency-Replayed", result.replayed ? "true" : "false");
  return response;
}
