"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { revealCredential } from "@/app/actions/credentials";

type CredentialCardProps = {
  credential: {
    id: string;
    name: string;
    username: string;
  };
};

const MASKED_SECRET = "\u2022".repeat(12);

export function CredentialCard({ credential }: CredentialCardProps) {
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isRevealed = secret !== null;

  function handleReveal() {
    if (isRevealed) {
      setSecret(null);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const revealedSecret = await revealCredential(credential.id);
        setSecret(revealedSecret);
      } catch {
        setError("No se pudo revelar la credencial.");
      }
    });
  }

  async function handleCopy() {
    const valueToCopy = secret ?? (await revealCredential(credential.id));

    await navigator.clipboard.writeText(valueToCopy);
    setSecret(valueToCopy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="rounded-lg border border-white/10 bg-neutral-900 px-4 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium text-neutral-100">
            {credential.name}
          </h3>
          <p className="mt-0.5 truncate text-[12px] text-neutral-400">
            {credential.username}
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 sm:flex-none">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-neutral-100">
              {secret ?? MASKED_SECRET}
            </span>
            <button
              type="button"
              onClick={handleReveal}
              disabled={isPending}
              className="shrink-0 rounded p-1 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={isRevealed ? "Ocultar password" : "Revelar password"}
              title={isRevealed ? "Ocultar" : "Revelar"}
            >
              {isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : isRevealed ? (
                <EyeOff size={15} />
              ) : (
                <Eye size={15} />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-white/10 bg-neutral-950 p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
            aria-label="Copiar password"
            title="Copiar"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
    </article>
  );
}

export default CredentialCard;
