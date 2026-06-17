"use client";

import { useActionState } from "react";
import { LockKeyhole, LogIn, Mail } from "lucide-react";
import { login, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = { step: "email" };

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const isPasswordStep = state.step === "password" && state.email;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-10 text-neutral-100">
      <section className="w-full max-w-sm space-y-6">
        <div className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-neutral-900">
            <LockKeyhole size={18} strokeWidth={1.5} className="text-neutral-300" />
          </div>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-neutral-100">
              PuroCode
            </h1>
            <p className="mt-1 text-[14px] leading-relaxed text-neutral-400">
              Ingresa con tu correo interno. Si es tu primer acceso, te enviaremos un enlace seguro.
            </p>
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[13px] font-medium text-neutral-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              readOnly={Boolean(isPasswordStep)}
              defaultValue={state.email ?? ""}
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 read-only:text-neutral-400 focus:border-white/20"
              placeholder="email@purocode.com"
            />
          </div>

          {isPasswordStep && (
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[13px] font-medium text-neutral-300">
                Clave
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-white/20"
                placeholder="Tu clave segura"
              />
            </div>
          )}

          {state.error && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
              {state.error}
            </p>
          )}

          {state.message && (
            <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            name="intent"
            value={isPasswordStep ? "login" : "continue"}
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPasswordStep ? <LogIn size={15} strokeWidth={2} /> : <Mail size={15} strokeWidth={2} />}
            {isPending ? "Procesando..." : isPasswordStep ? "Entrar" : "Continuar"}
          </button>

          {isPasswordStep && (
            <button
              type="submit"
              name="intent"
              value="forgot"
              disabled={isPending}
              className="w-full rounded-md px-4 py-2 text-[13px] font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200 disabled:opacity-60"
            >
              Olvide mi contraseña
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
