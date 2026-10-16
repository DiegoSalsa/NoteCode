import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptString, encryptString } from "@/lib/crypto";
import {
  audit,
  lock,
  requireCommercial,
  transaction,
  type Actor,
} from "./transaction";

function describe(token: {
  id: string;
  label: string;
  tokenCiphertext: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}) {
  let portalPath: string | null = null;
  try {
    if (token.tokenCiphertext)
      portalPath = `/portal/${decryptString(token.tokenCiphertext)}`;
  } catch {
    /* Legacy key unavailable; explicit rotation remains available. */
  }
  return {
    id: token.id,
    label: token.label,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    portalPath,
  };
}
export async function projectPortals(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, visibility: "COMPANY", deletedAt: null },
  });
  requireCommercial(
    project?.clientId,
    "Proyecto comercial no encontrado.",
    404,
  );
  return (
    await prisma.clientPortalToken.findMany({
      where: { projectId, clientId: project.clientId },
      orderBy: { createdAt: "desc" },
    })
  ).map(describe);
}
export async function ensureProjectPortal(projectId: string, actor: Actor) {
  return transaction(async (tx) => {
    await lock(tx, "projects", projectId);
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        visibility: "COMPANY",
        deletedAt: null,
        client: { deletedAt: null },
      },
    });
    requireCommercial(
      project?.clientId,
      "Proyecto comercial no encontrado.",
      404,
    );
    const existing = await tx.clientPortalToken.findFirst({
      where: {
        projectId,
        clientId: project.clientId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return describe(existing);
    const token = randomBytes(32).toString("base64url");
    const created = await tx.clientPortalToken.create({
      data: {
        projectId,
        clientId: project.clientId,
        label: project.name,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        tokenCiphertext: encryptString(token),
      },
    });
    await audit(
      tx,
      actor,
      "CREATE_PROJECT_PORTAL",
      "ClientPortalToken",
      created.id,
    );
    return describe(created);
  });
}
