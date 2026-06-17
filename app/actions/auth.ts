"use server";

import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSessionToken,
  findUserByEmail,
  getSessionMaxAge,
  hashPassword,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 1000 * 60 * 30;
const SET_PASSWORD = "SET_PASSWORD";
const RESET_PASSWORD = "RESET_PASSWORD";

export type LoginState = {
  step?: "email" | "password";
  email?: string;
  error?: string;
  message?: string;
};

export type PasswordTokenState = {
  error?: string;
};

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getBaseUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") || "http";

  return process.env.APP_URL || (host ? `${proto}://${host}` : "http://localhost:3000");
}

async function createAuthToken(userId: string, purpose: string) {
  const token = randomBytes(32).toString("base64url");

  await prisma.authToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return token;
}

async function sendPasswordLink(email: string, userId: string, purpose: typeof SET_PASSWORD | typeof RESET_PASSWORD) {
  await prisma.authToken.updateMany({
    where: {
      userId,
      purpose,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  const token = await createAuthToken(userId, purpose);
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/establecer-clave?token=${encodeURIComponent(token)}`;
  const isReset = purpose === RESET_PASSWORD;
  const subject = isReset ? "Recupera tu clave de NoteCode" : "Configura tu clave de NoteCode";
  const intro = isReset
    ? "Recibimos una solicitud para recuperar tu clave."
    : "Tu acceso a NoteCode esta listo. Configura una clave segura para entrar.";

  await sendEmail({
    to: email,
    subject,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#171717">
        <h1 style="font-size:20px;margin:0 0 12px">NoteCode</h1>
        <p>${intro}</p>
        <p>Este enlace vence en 30 minutos y solo puede usarse una vez.</p>
        <p>
          <a href="${url}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px">
            ${isReset ? "Crear nueva clave" : "Configurar clave"}
          </a>
        </p>
        <p style="font-size:13px;color:#666">Si no solicitaste esto, puedes ignorar este correo.</p>
      </div>
    `,
    text: `${intro}\n\nAbre este enlace para ${isReset ? "crear una nueva clave" : "configurar tu clave"}:\n${url}\n\nVence en 30 minutos y solo puede usarse una vez.`,
  });
}

function genericEmailMessage() {
  return "Si el correo esta autorizado, recibiras las instrucciones en tu bandeja.";
}

async function setSession(userId: string) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionMaxAge(),
  });
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "continue");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email) {
    return { step: "email", error: "Ingresa tu correo." };
  }

  const user = await findUserByEmail(email);

  if (intent === "forgot") {
    if (user?.passwordHash) {
      try {
        await sendPasswordLink(user.email, user.id, RESET_PASSWORD);
      } catch {
        return {
          step: "password",
          email: user.email,
          error: "No se pudo enviar el correo de recuperacion. Revisa la configuracion de Resend.",
        };
      }
    }

    return { step: "email", message: genericEmailMessage() };
  }

  if (!user) {
    return { step: "email", message: genericEmailMessage() };
  }

  if (!user.passwordHash) {
    try {
      await sendPasswordLink(user.email, user.id, SET_PASSWORD);
    } catch {
      return {
        step: "email",
        error: "No se pudo enviar el correo de configuracion. Revisa la configuracion de Resend.",
      };
    }

    return {
      step: "email",
      message: "Te enviamos un correo para configurar tu clave segura.",
    };
  }

  if (intent === "continue") {
    return { step: "password", email: user.email };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { step: "password", email: user.email, error: "Clave incorrecta." };
  }

  await setSession(user.id);
  redirect("/dashboard");
}

export async function completePasswordSetup(
  _state: PasswordTokenState,
  formData: FormData,
): Promise<PasswordTokenState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 10) {
    return { error: "La clave debe tener al menos 10 caracteres." };
  }

  if (password !== confirmPassword) {
    return { error: "Las claves no coinciden." };
  }

  const tokenRecord = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { select: { userId: true } },
    },
  });

  if (
    !tokenRecord ||
    tokenRecord.usedAt ||
    tokenRecord.expiresAt < new Date() ||
    ![SET_PASSWORD, RESET_PASSWORD].includes(tokenRecord.purpose)
  ) {
    return { error: "El enlace expiro o ya fue utilizado." };
  }

  await prisma.$transaction([
    prisma.userProfile.update({
      where: { userId: tokenRecord.userId },
      data: {
        passwordHash: hashPassword(password),
        passwordChangedAt: new Date(),
      },
    }),
    prisma.authToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.updateMany({
      where: {
        userId: tokenRecord.userId,
        id: { not: tokenRecord.id },
        purpose: { in: [SET_PASSWORD, RESET_PASSWORD] },
        usedAt: null,
      },
      data: { usedAt: new Date() },
    }),
  ]);

  await setSession(tokenRecord.userId);
  redirect("/dashboard");
}

export async function changePassword(formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const { verifySessionToken } = await import("@/lib/auth");
  const user = await verifySessionToken(token);

  if (!user) throw new Error("Unauthorized.");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new Error("La clave actual no es correcta.");
  }

  if (password.length < 10) {
    throw new Error("La clave debe tener al menos 10 caracteres.");
  }

  if (password !== confirmPassword) {
    throw new Error("Las claves no coinciden.");
  }

  await prisma.userProfile.update({
    where: { userId: user.id },
    data: {
      passwordHash: hashPassword(password),
      passwordChangedAt: new Date(),
    },
  });

  revalidatePath("/perfil");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/");
}
