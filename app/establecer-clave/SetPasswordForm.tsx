"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { completePasswordSetup, type PasswordTokenState } from "@/app/actions/auth";

const initialState: PasswordTokenState = {};

export default function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(completePasswordSetup, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-10 text-neutral-100">
      <section className="w-full max-w-sm space-y-6">
        <div className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-neutral-900">
            <KeyRound size={18} strokeWidth={1.5} className="text-neutral-300" />
          </div>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-neutral-100">
              Configura tu clave
            </h1>
            <p className="mt-1 text-[14px] leading-relaxed text-neutral-400">
              Crea una clave segura para tu cuenta interna.
            </p>
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-lg border border-white/10 bg-neutral-900 p-5">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[13px] font-medium text-neutral-300">
              Nueva clave
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-white/20"
              placeholder="Minimo 10 caracteres"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="text-[13px] font-medium text-neutral-300">
              Confirmar clave
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-white/20"
              placeholder="Repite tu clave"
            />
          </div>

          {state.error && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || !token}
            className="inline-flex w-full items-center justify-center rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Guardando..." : "Guardar clave"}
          </button>
        </form>
      </section>
    </main>
  );
}
