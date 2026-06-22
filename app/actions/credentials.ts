"use server";

import { prisma } from "@/lib/prisma";
import { decryptString, encryptString } from "@/lib/crypto";
import { getCurrentUser, hasRecentWebAuthn } from "@/lib/auth";

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

  const credential = await prisma.credential.create({
    data: {
      projectId: data.projectId || null,
      name: data.name,
      username: data.username,
      secretData: encryptString(data.password),
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

  if (!credentialId) {
    throw new Error("credentialId is required.");
  }

  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    select: { id: true, secretData: true },
  });

  if (!credential) {
    throw new Error("Credential not found.");
  }

  const password = decryptString(credential.secretData);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREDENTIAL_REVEALED",
      credentialId: credential.id,
    },
  });

  return password;
}
