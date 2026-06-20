"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { decryptString, encryptString } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized.");

  return user;
}

async function ensureProfile() {
  const user = await requireUser();

  return prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      email: user.email,
      displayName: user.name,
    },
  });
}

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const ageRaw = String(formData.get("age") ?? "").trim();
  const age = ageRaw ? Number(ageRaw) : null;

  if (!displayName) {
    throw new Error("El nombre es obligatorio.");
  }

  if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
    throw new Error("La edad debe ser un numero valido.");
  }

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName,
      age,
    },
    create: {
      userId: user.id,
      email: user.email,
      displayName,
      age,
    },
  });

  revalidatePath("/perfil");
  revalidatePath("/dashboard");
}

export async function savePersonalSecret(formData: FormData) {
  const profile = await ensureProfile();
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name || !password) {
    throw new Error("El nombre y la clave son obligatorios.");
  }

  await prisma.personalSecret.create({
    data: {
      userId: profile.userId,
      name,
      username: username || null,
      secretData: encryptString(password),
      notes: notes || null,
    },
  });

  revalidatePath("/perfil");
}

export async function revealPersonalSecret(secretId: string) {
  const user = await requireUser();

  const secret = await prisma.personalSecret.findFirst({
    where: {
      id: secretId,
      userId: user.id,
    },
    select: { secretData: true },
  });

  if (!secret) throw new Error("Clave no encontrada.");

  return decryptString(secret.secretData);
}

export async function deletePersonalSecret(formData: FormData) {
  const user = await requireUser();
  const secretId = String(formData.get("secretId") ?? "");

  if (!secretId) return;

  await prisma.personalSecret.deleteMany({
    where: {
      id: secretId,
      userId: user.id,
    },
  });

  revalidatePath("/perfil");
}
