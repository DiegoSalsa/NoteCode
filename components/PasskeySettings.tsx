"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2 } from "lucide-react";

type PasskeySettingsProps = {
  passkeyCount: number;
};

export default function PasskeySettings({ passkeyCount }: PasskeySettingsProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIsSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  async function handleRegister() {
    setIsPending(true);
    setMessage("");
    setError("");

    try {
      const optionsResponse = await fetch("/api/webauthn/register/options", { method: "POST" });
      const options = await optionsResponse.json();

      if (!optionsResponse.ok) {
        throw new Error(options.error ?? "No se pudo preparar la huella.");
      }

      const registration = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      });
      const result = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(result.error ?? "No se pudo guardar la huella.");
      }

      setMessage("Huella activada para este dispositivo.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo activar la huella.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-neutral-900 p-5">
      <div className="mb-5">
        <h2 className="text-[16px] font-semibold text-neutral-100">Acceso con huella</h2>
        <p className="mt-1 text-[13px] text-neutral-500">
          {passkeyCount > 0
            ? `${passkeyCount} ${passkeyCount === 1 ? "dispositivo activado" : "dispositivos activados"}`
            : "Activa una passkey para entrar sin escribir tu clave."}
        </p>
      </div>

      <button
        type="button"
        onClick={handleRegister}
        disabled={!isSupported || isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isPending ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} strokeWidth={2} />}
        {isPending ? "Activando..." : passkeyCount > 0 ? "Agregar otro dispositivo" : "Activar huella"}
      </button>

      {!isSupported && (
        <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">
          Este navegador no soporta acceso biometrico.
        </p>
      )}

      {message && (
        <p className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
