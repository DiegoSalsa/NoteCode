"use client";

import { startAuthentication } from "@simplewebauthn/browser";

const RECENT_REAUTH_KEY = "notecode.recentWebAuthnAt";
const RECENT_REAUTH_MS = 1000 * 60 * 4;

export async function ensureRecentWebAuthn() {
  if (typeof window === "undefined") return;

  const lastAuthAt = Number(window.sessionStorage.getItem(RECENT_REAUTH_KEY) ?? 0);
  if (Date.now() - lastAuthAt < RECENT_REAUTH_MS) return;

  if (!("PublicKeyCredential" in window)) {
    await ensureRecentPasswordAuth();
    return;
  }

  try {
    await ensureRecentPasskeyAuth();
    return;
  } catch {
    await ensureRecentPasswordAuth();
  }
}

async function ensureRecentPasskeyAuth() {
  const optionsResponse = await fetch("/api/webauthn/reauth/options", { method: "POST" });
  const options = await optionsResponse.json();
  if (!optionsResponse.ok) {
    throw new Error(options.error ?? "No se pudo iniciar la verificacion biometrica.");
  }

  const authentication = await startAuthentication({ optionsJSON: options });
  const verifyResponse = await fetch("/api/webauthn/reauth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authentication),
  });
  const result = await verifyResponse.json();

  if (!verifyResponse.ok) {
    throw new Error(result.error ?? "No se pudo verificar la huella.");
  }

  window.sessionStorage.setItem(RECENT_REAUTH_KEY, String(Date.now()));
}

async function ensureRecentPasswordAuth() {
  const password = window.prompt("Confirma tu clave para revelar este secreto.");

  if (!password) {
    throw new Error("Necesitas confirmar tu identidad para revelar secretos.");
  }

  const response = await fetch("/api/auth/reauth-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? "No se pudo confirmar tu identidad.");
  }

  window.sessionStorage.setItem(RECENT_REAUTH_KEY, String(Date.now()));
}
