"use server";

import { prisma } from "@/lib/prisma";
import { CURRENT_KEY_VERSION, decryptString, encryptString } from "@/lib/crypto";
import { canManage, getCurrentUser, hasRecentWebAuthn } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { encodeVaultSecret, decodeVaultSecret } from "@/lib/secret-payload";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

type SaveCredentialInput = {
  projectId?: string;
  name: string;
  username: string;
  password: string;
};

export async function saveCredential(data: SaveCredentialInput) {
  if (!data.name || !data.username || !data.password) {
    throw new Error("name, username and password are required.");
  }

  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized.");
  if (data.projectId && !await findAccessibleProject(data.projectId, user.id)) {
    throw new Error("Project not found.");
  }
  const credential = await prisma.credential.create({
    data: {
      projectId: data.projectId || null,
      name: data.name,
      username: data.username,
      secretData: encryptString(encodeVaultSecret({ password: data.password })),
      keyVersion: CURRENT_KEY_VERSION,
    },
    select: {
      id: true,
      projectId: true,
      name: true,
      username: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return credential;
}

export async function revealCredential(credentialId: string) {
  const user = await getCurrentUser();

  if (!user) throw new Error("Unauthorized.");
  if (!(await hasRecentWebAuthn(user.id))) {
    throw new Error("Necesitas confirmar tu identidad para revelar credenciales.");
  }
  const limited = rateLimit(`reveal:${user.id}`, 10, 60_000);
  if (!limited.ok) {
    throw new Error("Demasiados intentos de revelar secretos. Espera un momento.");
  }

  if (!credentialId) {
    throw new Error("credentialId is required.");
  }

  const credential = await prisma.credential.findUnique({
    where: { id: credentialId, deletedAt: null },
    select: { id: true, secretData: true, projectId: true },
  });

  if (!credential) {
    throw new Error("Credential not found.");
  }
  if (credential.projectId && !await findAccessibleProject(credential.projectId, user.id)) {
    throw new Error("Credential not found.");
  }
  if (!credential.projectId && !canManage(user)) {
    throw new Error("Credential not found.");
  }

  const payload = decodeVaultSecret(decryptString(credential.secretData));

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREDENTIAL_REVEALED",
      credentialId: credential.id,
    },
  });
  await recordAudit({
    action: "reveal",
    entityType: "credential",
    entityId: credential.id,
    summary: "Secreto revelado",
    metadata: { credentialId: credential.id },
  });

  return payload.password;
}
