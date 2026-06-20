"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { deletePersonalSecret, revealPersonalSecret } from "@/app/actions/profile";
import { ensureRecentWebAuthn } from "@/lib/client/webauthn";

type PersonalSecretCardProps = {
  secret: {
    id: string;
    name: string;
    username: string | null;
    notes: string | null;
  };
};

export default function PersonalSecretCard({ secret }: PersonalSecretCardProps) {
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isRevealed = value !== null;

  function toggleReveal() {
    if (isRevealed) {
      setValue(null);
      return;
    }

    startTransition(async () => {
      try {
        setError("");
        const reauthToken = await ensureRecentWebAuthn();
        const revealed = await revealPersonalSecret(secret.id, reauthToken);
        setValue(revealed);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "No se pudo revelar la clave.");
      }
    });
  }

  async function copySecret() {
    try {
      setError("");
      const reauthToken = await ensureRecentWebAuthn();
      const secretValue = value ?? (await revealPersonalSecret(secret.id, reauthToken));

      await navigator.clipboard.writeText(secretValue);
      setValue(secretValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo copiar la clave.");
    }
  }

  return (
    <article className="rounded-lg border border-white/10 bg-neutral-900 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium text-neutral-100">{secret.name}</h3>
          <p className="mt-0.5 truncate text-[12px] text-neutral-500">
            {secret.username || "Sin usuario"}
            {secret.notes ? ` / ${secret.notes}` : ""}
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 sm:flex-none">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-neutral-200 sm:max-w-44">
              {value ?? "************"}
            </span>
            <button
              type="button"
              onClick={toggleReveal}
              disabled={isPending}
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100 disabled:opacity-60"
              aria-label={isRevealed ? "Ocultar clave" : "Revelar clave"}
              title={isRevealed ? "Ocultar" : "Revelar"}
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <button
            type="button"
            onClick={copySecret}
            className="rounded-md border border-white/10 bg-neutral-950 p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100"
            aria-label="Copiar clave"
            title="Copiar"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>

          <form action={deletePersonalSecret}>
            <input type="hidden" name="secretId" value={secret.id} />
            <button
              type="submit"
              className="rounded-md border border-white/10 bg-neutral-950 p-2 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
              aria-label="Eliminar clave"
              title="Eliminar"
            >
              <Trash2 size={15} />
            </button>
          </form>
        </div>
      </div>

      {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
    </article>
  );
}
