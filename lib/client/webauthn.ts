"use client";

import { startAuthentication } from "@simplewebauthn/browser";

const RECENT_REAUTH_KEY = "notecode.recentWebAuthnAt";
const RECENT_REAUTH_MS = 1000 * 60 * 4;

export async function ensureRecentWebAuthn() {
  if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
    throw new Error("Este navegador no soporta huella/passkeys.");
  }

  const lastAuthAt = Number(window.sessionStorage.getItem(RECENT_REAUTH_KEY) ?? 0);
  if (Date.now() - lastAuthAt < RECENT_REAUTH_MS) return;

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
