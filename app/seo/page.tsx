"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoKpi, SeoRangePills, SeoState, SeoSubnav } from "@/components/seo/SeoChrome";
import { formatDecimal, formatInt, formatPercent, deltaClass, formatDelta, formatDateTime } from "@/lib/seo/format";
import type { SeoRangeKey } from "@/lib/seo/dates";

type OverviewResponse = {
  configured: boolean;
  connection: { status: string; googleAccountEmail: string; lastError: string | null } | null;
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  permissions: { manage: boolean; integrations: boolean };
  totals: {
    projects: number;
    withGsc: number;
    withGa4: number;
    missingGsc: number;
    missingGa4: number;
    syncErrors: number;
    clicks: number;
    impressions: number;
  };
  projects: Array<{
    id: string;
    projectId: string;
    name: string;
    status: string;
    client: { id: string; name: string } | null;
    gsc: { siteUrl: string | null } | null;
    ga4: { displayName: string } | null;
    lastGscSyncAt: string | null;
    lastGa4SyncAt: string | null;
    lastGscSyncStatus: string | null;
    lastGa4SyncStatus: string | null;
    lastGscError: string | null;
    lastGa4Error: string | null;
    metrics: {
      gsc: {
        clicks: { value: number; deltaPct: number };
        impressions: { value: number; deltaPct: number };
        ctr: { value: number };
        position: { value: number; deltaPct: number };
      };
    };
  }>;
  unlinked: Array<{ id: string; name: string; client: { name: string } | null }>;
  error?: string;
};

export default function SeoOverviewPage() {
  const [range, setRange] = useState<SeoRangeKey>("28d");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<OverviewResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ range });
    if (clientId) params.set("clientId", clientId);
    if (status) params.set("status", status);
    const response = await fetch(`/api/seo/overview?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "No se pudo cargar el portafolio SEO.");
      setData(null);
    } else {
      setData(payload);
    }
    setLoading(false);
  }, [range, clientId, status]);

  useEffect(() => { void load(); }, [load]);

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of data?.projects ?? []) {
      if (project.client) map.set(project.client.id, project.client.name);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="SEO"
        title="Portafolio SEO"
        description="Clicks, impresiones y estado de Search Console / Analytics por proyecto de empresa."
        actions={<SeoRangePills value={range} onChange={setRange} />}
      />
      <SeoSubnav items={[{ href: "/seo", label: "Overview" }, { href: "/seo/integraciones", label: "Integraciones" }, { href: "/seo/alerts", label: "Alerts" }]} />

      {loading && <div className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 rounded-xl border border-white/10 bg-neutral-900" />)}</div>}

      {error && <SeoState tone="error" title="No se pudo cargar SEO" description={error} action={<button type="button" onClick={() => void load()} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">Reintentar</button>} />}

      {!loading && data && !data.configured && (
        <SeoState
          tone="warning"
          title="Integración no configurada"
          description="Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. Agrégalas al entorno y vuelve a entrar."
        />
      )}

      {!loading && data?.configured && !data.connection && (
        <SeoState
          tone="disconnected"
          title="Google no está conectado"
          description="Conecta la cuenta de Google de PuroCode una sola vez para descubrir Search Console y Analytics."
          action={data.permissions.integrations ? <Link href="/seo/integraciones" className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">Ir a integraciones</Link> : undefined}
        />
      )}

      {!loading && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SeoKpi label="Clicks" value={formatInt(data.totals.clicks)} detail={`${data.period.from} → ${data.period.to}`} />
            <SeoKpi label="Impresiones" value={formatInt(data.totals.impressions)} />
            <SeoKpi label="Proyectos SEO" value={formatInt(data.totals.projects)} detail={`${data.totals.withGsc} con GSC · ${data.totals.withGa4} con GA4`} />
            <SeoKpi label="Alertas de sync" value={formatInt(data.totals.syncErrors)} detail={`${data.unlinked.length} sin vincular`} />
          </div>

          <div className="flex flex-wrap gap-3">
            <select value={clientId} onChange={(event) => setClientId(event.target.value)} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-200">
              <option value="">Todos los clientes</option>
              {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-200">
              <option value="">Todos los estados</option>
              {["Planificado", "En progreso", "Revisión", "Completado"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <section className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Proyecto</th>
                  <th className="px-4 py-3">GSC</th>
                  <th className="px-4 py-3">GA4</th>
                  <th className="px-4 py-3 text-right">Clicks</th>
                  <th className="px-4 py-3 text-right">Δ28d</th>
                  <th className="px-4 py-3 text-right">Impr.</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3 text-right">Posición</th>
                  <th className="px-4 py-3">Sync</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((project) => (
                  <tr key={project.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/seo/proyectos/${project.projectId}`} className="text-sm font-medium text-white hover:underline">{project.name}</Link>
                      <p className="text-xs text-neutral-600">{project.client?.name || "Producto interno"} · {project.status}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{project.gsc ? <span className="text-emerald-300">Vinculado</span> : <span className="text-amber-300">Sin GSC</span>}</td>
                    <td className="px-4 py-3 text-xs">{project.ga4 ? <span className="text-emerald-300">Vinculado</span> : <span className="text-amber-300">Sin GA4</span>}</td>
                    <td className="px-4 py-3 text-right text-sm text-neutral-200">{formatInt(project.metrics.gsc.clicks.value)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${deltaClass(project.metrics.gsc.clicks.deltaPct)}`}>{formatDelta(project.metrics.gsc.clicks.deltaPct)}</td>
                    <td className="px-4 py-3 text-right text-sm text-neutral-300">{formatInt(project.metrics.gsc.impressions.value)}</td>
                    <td className="px-4 py-3 text-right text-sm text-neutral-300">{formatPercent(project.metrics.gsc.ctr.value)}</td>
                    <td className="px-4 py-3 text-right text-sm text-neutral-300">{formatDecimal(project.metrics.gsc.position.value)}</td>
                    <td className="px-4 py-3 text-[11px] text-neutral-500">
                      {project.lastGscSyncStatus === "error" || project.lastGa4SyncStatus === "error"
                        ? <span className="text-red-300">{project.lastGscError || project.lastGa4Error}</span>
                        : formatDateTime(project.lastGscSyncAt || project.lastGa4SyncAt)}
                    </td>
                  </tr>
                ))}
                {!data.projects.length && (
                  <tr><td colSpan={9} className="px-4 py-8 text-sm text-neutral-500">Todavía no hay proyectos con SEO habilitado.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {data.unlinked.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-sm font-semibold text-white">Proyectos sin SEO</h2>
              <p className="mt-1 text-sm text-neutral-500">Existen en NoteCode pero todavía no están vinculados a GSC o GA4.</p>
              <ul className="mt-4 space-y-2">
                {data.unlinked.map((project) => (
                  <li key={project.id} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-200">{project.name}<span className="ml-2 text-neutral-600">{project.client?.name || "Interno"}</span></span>
                    <Link href="/seo/integraciones" className="text-[12px] text-sky-300 hover:underline">Vincular</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
