"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SeoHeader, SeoState, SeoSubnav } from "@/components/seo/SeoChrome";
import { formatDateTime, integrationLabel } from "@/lib/seo/format";

type Property = { id: string; kind: string; displayName: string; siteUrl: string | null; hostname: string | null; externalId: string };
type Project = { id: string; name: string; client: { name: string; website: string | null } | null };
type Group = {
  key: string;
  label: string;
  hostname: string | null;
  gsc: Property | null;
  ga4: Property | null;
  suggestions: Array<{ projectId: string; projectName: string; score: number; reason: string }>;
  linkedProjects: Array<{ id: string; name: string }>;
};

type Payload = {
  configured: boolean;
  connection: { id: string; googleAccountEmail: string; status: string; lastError: string | null; lastDiscoveredAt: string | null } | null;
  groups: Group[];
  projects: Project[];
  properties: Property[];
};

function IntegracionesContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(searchParams.get("connected") ? "Google quedó conectado." : "");
  const [error, setError] = useState(searchParams.get("error") || "");
  const [canIntegrate, setCanIntegrate] = useState(false);
  const [usage, setUsage] = useState<{
    configured: boolean;
    message: string | null;
    spend: { dailyUsd: number; dailyRequests: number; monthlyUsd: number; monthlyRequests: number };
    limits: { dailyUsd: number; monthlyUsd: number };
  } | null>(null);
  const [linkFor, setLinkFor] = useState<Group | null>(null);
  const [projectId, setProjectId] = useState("");
  const [gscPropertyId, setGscPropertyId] = useState<string>("");
  const [ga4PropertyId, setGa4PropertyId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const [properties, status, usagePayload] = await Promise.all([
      fetch("/api/seo/properties").then((response) => response.json()),
      fetch("/api/seo/google/status").then((response) => response.json()),
      fetch("/api/seo/usage").then((response) => response.json()),
    ]);
    if (properties.error) setError(properties.error);
    setData(properties);
    setCanIntegrate(Boolean(status?.permissions?.integrations));
    setUsage(usagePayload);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function discover() {
    setBusy("discover");
    setError("");
    const response = await fetch("/api/seo/google/discover", { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudieron descubrir propiedades.");
    else setNotice("Propiedades actualizadas.");
    setBusy("");
    await load();
  }

  async function disconnect() {
    if (!confirm("¿Desconectar la cuenta de Google? Los históricos locales se conservan.")) return;
    setBusy("disconnect");
    const response = await fetch("/api/seo/google/disconnect", { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo desconectar.");
    else setNotice("Google desconectado.");
    setBusy("");
    await load();
  }

  function openLink(group: Group) {
    setLinkFor(group);
    setGscPropertyId(group.gsc?.id || "");
    setGa4PropertyId(group.ga4?.id || "");
    setProjectId(group.suggestions[0]?.projectId || group.linkedProjects[0]?.id || "");
  }

  async function saveLink() {
    if (!projectId) {
      setError("Elige un proyecto de NoteCode.");
      return;
    }
    setBusy("link");
    const response = await fetch(`/api/seo/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        gscPropertyId: gscPropertyId || null,
        ga4PropertyId: ga4PropertyId || null,
        sync: true,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo vincular.");
    else {
      setNotice("Proyecto vinculado. La sincronización inicial quedó en marcha.");
      setLinkFor(null);
    }
    setBusy("");
    await load();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="SEO"
        title="Integraciones"
        description="Una cuenta Google de PuroCode. NoteCode descubre las propiedades y tú confirmas el vínculo con cada proyecto."
      />
      <SeoSubnav items={[{ href: "/seo", label: "Overview" }, { href: "/seo/integraciones", label: "Integraciones" }, { href: "/seo/alerts", label: "Alerts" }]} />

      {notice && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{error}</p>}

      {loading && <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />}

      {!loading && data && !data.configured && (
        <SeoState tone="warning" title="Integración no configurada" description="Define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI en el entorno. No hay datos simulados." />
      )}

      {!loading && data?.configured && (
        <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Google</p>
              {data.connection ? (
                <>
                  <p className="mt-1 text-sm text-neutral-300">{data.connection.googleAccountEmail}</p>
                  <p className="text-xs text-neutral-500">{integrationLabel(data.connection.status)} · último descubrimiento {formatDateTime(data.connection.lastDiscoveredAt)}</p>
                  {data.connection.lastError && <p className="mt-1 text-xs text-red-300">{data.connection.lastError}</p>}
                </>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">Ninguna cuenta conectada.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canIntegrate && (
                <a href="/api/seo/google/connect" className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">
                  {data.connection ? "Reconectar Google" : "Conectar Google"}
                </a>
              )}
              {canIntegrate && data.connection && (
                <>
                  <button type="button" disabled={busy === "discover"} onClick={() => void discover()} className="rounded-md border border-white/10 px-3 py-2 text-[13px] text-neutral-200 hover:bg-white/5">
                    {busy === "discover" ? "Descubriendo…" : "Redescubrir propiedades"}
                  </button>
                  <button type="button" disabled={busy === "disconnect"} onClick={() => void disconnect()} className="rounded-md border border-red-500/20 px-3 py-2 text-[13px] text-red-200 hover:bg-red-500/10">
                    Desconectar
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {!loading && (
        <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm font-semibold text-white">DataForSEO</p>
          {!usage?.configured ? (
            <p className="mt-2 text-sm text-amber-200">{usage?.message || "Proveedor SERP no configurado"}</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-neutral-600">Hoy</p>
                <p className="mt-1 text-neutral-200">{usage.spend.dailyRequests} requests</p>
                <p className="text-neutral-500">US${usage.spend.dailyUsd.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-neutral-600">Mes</p>
                <p className="mt-1 text-neutral-200">{usage.spend.monthlyRequests} requests</p>
                <p className="text-neutral-500">US${usage.spend.monthlyUsd.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-neutral-600">Budget</p>
                <p className="mt-1 text-neutral-200">US${usage.limits.dailyUsd.toFixed(2)} / día</p>
                <p className="text-neutral-500">US${usage.limits.monthlyUsd.toFixed(2)} / mes</p>
              </div>
            </div>
          )}
        </section>
      )}

      {!loading && data?.connection && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Propiedades detectadas</h2>
          <p className="text-sm text-neutral-500">Las coincidencias son sugerencias. Nada se asocia hasta que confirmes.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.groups.map((group) => (
              <article key={group.key} className="rounded-xl border border-white/10 bg-neutral-900 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                    <p className="text-xs text-neutral-500">{group.hostname || "Sin hostname"}</p>
                  </div>
                  <button type="button" onClick={() => openLink(group)} className="rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-neutral-200 hover:bg-white/5">
                    Vincular a proyecto
                  </button>
                </div>
                <div className="mt-4 flex gap-4 text-[12px]">
                  <span className={group.gsc ? "text-emerald-300" : "text-neutral-600"}>GSC {group.gsc ? "✓" : "—"}</span>
                  <span className={group.ga4 ? "text-emerald-300" : "text-neutral-600"}>GA4 {group.ga4 ? "✓" : "—"}</span>
                </div>
                {group.linkedProjects.length > 0 && (
                  <p className="mt-3 text-xs text-neutral-400">Ya vinculado: {group.linkedProjects.map((item) => item.name).join(", ")}</p>
                )}
                {group.suggestions[0] && (
                  <p className="mt-2 text-xs text-neutral-500">Sugerencia: {group.suggestions[0].projectName} ({group.suggestions[0].score} · {group.suggestions[0].reason})</p>
                )}
              </article>
            ))}
            {!data.groups.length && <SeoState title="Sin propiedades" description="Google no devolvió sitios de Search Console ni propiedades GA4 para esta cuenta." />}
          </div>
        </section>
      )}

      {linkFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-neutral-950 p-5">
            <h3 className="text-sm font-semibold text-white">Vincular {linkFor.label}</h3>
            <p className="mt-1 text-xs text-neutral-500">Elige el proyecto de NoteCode. La sincronización inicial se lanza al confirmar.</p>
            <label className="mt-4 block text-[12px] text-neutral-400">Proyecto
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100">
                <option value="">Seleccionar…</option>
                {data?.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}{project.client ? ` · ${project.client.name}` : ""}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[12px] text-neutral-400">Search Console
              <select value={gscPropertyId} onChange={(event) => setGscPropertyId(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100">
                <option value="">Sin GSC</option>
                {(data?.properties.filter((property) => property.kind === "GSC") ?? []).map((property) => (
                  <option key={property.id} value={property.id}>{property.siteUrl || property.displayName}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[12px] text-neutral-400">Google Analytics 4
              <select value={ga4PropertyId} onChange={(event) => setGa4PropertyId(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100">
                <option value="">Sin GA4</option>
                {(data?.properties.filter((property) => property.kind === "GA4_PROPERTY") ?? []).map((property) => (
                  <option key={property.id} value={property.id}>{property.displayName}</option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setLinkFor(null)} className="rounded-md px-3 py-2 text-[13px] text-neutral-400">Cancelar</button>
              <button type="button" disabled={busy === "link"} onClick={() => void saveLink()} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">
                {busy === "link" ? "Vinculando…" : "Confirmar vínculo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SeoIntegracionesPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-sm text-neutral-500">Cargando integraciones…</div>}>
      <IntegracionesContent />
    </Suspense>
  );
}
