"use client";

import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, Loader2 } from "lucide-react";

type PasskeyLoginButtonProps = {
  email?: string;
};

export default function PasskeyLoginButton({ email }: PasskeyLoginButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  async function handlePasskeyLogin() {
    setIsPending(true);
    setError("");

    try {
      const optionsResponse = await fetch("/api/webauthn/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const options = await optionsResponse.json();

      if (!optionsResponse.ok) {
        throw new Error(options.error ?? "No se pudo iniciar el acceso con huella.");
      }

      const authentication = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch("/api/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authentication),
      });
      const result = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(result.error ?? "No se pudo verificar la huella.");
      }

      window.location.href = "/dashboard";
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo usar la huella.");
    } finally {
      setIsPending(false);
    }
  }

  if (!isSupported) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handlePasskeyLogin}
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-2 text-[13px] font-semibold text-neutral-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} strokeWidth={2} />}
        {isPending ? "Verificando..." : "Entrar con huella"}
      </button>
      {error && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
