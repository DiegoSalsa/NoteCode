"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
type Portal = {
  id: string;
  label: string;
  revokedAt: string | null;
  portalPath: string | null;
};
const button =
  "rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 disabled:opacity-40";
export default function ProjectPortal({ projectId }: { projectId: string }) {
  const [portals, setPortals] = useState<Portal[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef<{
    projectId: string;
    controller: AbortController;
  } | null>(null);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const r = await fetch(`/api/projects/${projectId}/portal`, { signal });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (!signal.aborted) setPortals(data);
    },
    [projectId],
  );
  useEffect(() => {
    const controller = new AbortController();
    active.current = { projectId, controller };
    setPortals([]);
    setError("");
    setBusy(false);
    void load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [load, projectId]);
  async function action(
    url: string,
    body: Record<string, unknown>,
    method = "POST",
  ) {
    const current = active.current;
    if (!current || current.projectId !== projectId) return;
    const { signal } = current.controller;
    if (signal.aborted) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        signal,
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (!signal.aborted) await load(signal);
    } catch (e) {
      if (!signal.aborted)
        setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Portal y aprobaciones</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Comparte propuestas publicadas, documentos y avances visibles. La
            aceptación registra una decisión; no es una firma electrónica.
          </p>
        </div>
        <button
          disabled={busy}
          className={button}
          onClick={() => void action(`/api/projects/${projectId}/portal`, {})}
        >
          Generar / recuperar enlace
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {portals.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-950 p-3"
          >
            <p className="text-xs">
              {p.label} · {p.revokedAt ? "Revocado" : "Activo"}
            </p>
            <div className="flex flex-wrap gap-2">
              {p.portalPath && !p.revokedAt && (
                <>
                  <button
                    className={button}
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `${window.location.origin}${p.portalPath}`,
                      )
                    }
                  >
                    Copiar enlace
                  </button>
                  <a
                    href={`${p.portalPath}?preview=1`}
                    target="_blank"
                    rel="noreferrer"
                    className={button}
                  >
                    Vista del cliente
                  </a>
                </>
              )}
              {!p.revokedAt && (
                <button
                  disabled={busy}
                  className={button}
                  onClick={() =>
                    void action(
                      `/api/erp/portal-tokens/${p.id}`,
                      { action: "revoke" },
                      "PATCH",
                    )
                  }
                >
                  Revocar
                </button>
              )}
              {!p.portalPath && (
                <Link className={button} href="/erp?tab=portal">
                  Recuperar acceso antiguo
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
