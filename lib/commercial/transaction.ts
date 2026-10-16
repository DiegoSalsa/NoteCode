import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

export type Tx = Prisma.TransactionClient;
export class CommercialError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function requireCommercial(
  condition: unknown,
  message: string,
  status = 409,
): asserts condition {
  if (!condition) throw new CommercialError(message, status);
}
export type Actor = {
  name: string;
  origin: "INTERNAL" | "PORTAL" | "AI" | "AUTOMATION";
  userId?: string | null;
  portalTokenId?: string;
  clientId?: string;
  projectId?: string | null;
};
export async function transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await prisma.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      });
      [
        "project:",
        "projects:",
        "erp:",
        "invoices",
        "dashboard:",
        "reports:",
        "tax:",
        "gilberto:today:",
      ].forEach(invalidateCache);
      return result;
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (["P2034", "P2002"].includes(error.code) ||
          (error.code === "P2010" &&
            ["40001", "40P01"].includes(String(error.meta?.code))));
      if (retryable && attempt < 3) continue;
      throw error;
    }
  }
}
export async function lock(
  tx: Tx,
  table:
    | "quotes"
    | "projects"
    | "opportunities"
    | "invoices"
    | "support_contracts"
    | "commercial_agreements"
    | "client_approvals",
  id: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`,
  );
}
export async function assertPortalActor(tx: Tx, actor: Actor) {
  if (actor.origin !== "PORTAL") return;
  const token = actor.portalTokenId
    ? await tx.clientPortalToken.findUnique({
        where: { id: actor.portalTokenId },
        include: { client: true },
      })
    : null;
  requireCommercial(
    token &&
      !token.revokedAt &&
      (!token.expiresAt || token.expiresAt > new Date()) &&
      !token.client.deletedAt &&
      token.clientId === actor.clientId &&
      token.projectId === (actor.projectId ?? null),
    "Acceso inválido o revocado.",
    404,
  );
}
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.auditEvent.create({
    data: {
      actorUserId: actor.userId ?? null,
      actorType: actor.origin.toLowerCase(),
      action,
      entityType,
      entityId,
      metadata,
    },
  });
}
