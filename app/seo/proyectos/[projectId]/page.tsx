"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoKpi, SeoRangePills, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import SeoSparkline from "@/components/seo/SeoSparkline";
import { formatDateTime, formatDecimal, formatInt, formatPercent } from "@/lib/seo/format";
import type { SeoRangeKey } from "@/lib/seo/dates";

type Dashboard = {
  project: { id: string; name: string; client: { name: string } | null };
  seoProject: {
    enabled: boolean;
    primaryDomain: string | null;
    gscProperty: { siteUrl: string | null; displayName: string } | null;
    ga4Property: { displayName: string; externalId: string } | null;
    lastGscSyncAt: string | null;
    lastGa4SyncAt: string | null;
    lastGscSyncStatus: string | null;
    lastGa4SyncStatus: string | null;
    lastGscError: string | null;
    lastGa4Error: string | null;
  } | null;
  period: { from: string; to: string };
  metrics: {
    gsc: {
      clicks: { value: number; deltaPct: number };
      impressions: { value: number; deltaPct: number };
      ctr: { value: number; deltaPct: number };
      position: { value: number; deltaPct: number };
    };
    ga4: {
      users: { value: number; deltaPct: number };
      sessions: { value: number; deltaPct: number };
      organicSessions: { value: number; deltaPct: number };
      engagementRate: { value: number; deltaPct: number };
      keyEvents: { value: number; deltaPct: number };
    };
    series: {
      gsc: Array<{ date: string; clicks: number; impressions: number; position: number }>;
      ga4: Array<{ date: string; users: number; sessions: number; organicSessions: number }>;
    };
  } | null;
  jobs: Array<{ id: string; type: string; status: string; error: string | null; startedAt: string | null; recordsProcessed: number }>;
};

export default function SeoProjectDashboard({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [range, setRange] = useState<SeoRangeKey>("28d");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/seo/projects/${projectId}?range=${range}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo cargar el dashboard SEO.");
    else {
      setError("");
      setData(payload);
    }
    setLoading(false);
  }, [projectId, range]);

  useEffect(() => { void load(); }, [load]);

  async function sync(full = false) {
    setBusy(true);
    const response = await fetch(`/api/seo/projects/${projectId}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "La sincronización falló.");
    setBusy(false);
    await load();
  }

  const nav = projectSeoNav(projectId);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="SEO del proyecto"
        title={data?.project.name || "SEO"}
        description={data?.project.client?.name || data?.seoProject?.primaryDomain || "Producto interno"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SeoRangePills value={range} onChange={setRange} />
            <button type="button" disabled={busy || !data?.seoProject} onClick={() => void sync(false)} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950 disabled:opacity-40">
              {busy ? "Sincronizando…" : "Sincronizar"}
            </button>
            <button type="button" disabled={busy || !data?.seoProject} onClick={() => void sync(true)} className="rounded-md border border-white/10 px-3 py-2 text-[13px] text-neutral-200 hover:bg-white/5 disabled:opacity-40">
              Histórico
            </button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...nav]} />
        <Link href={`/proyectos/${projectId}`} className="text-[12px] text-neutral-500 hover:text-neutral-300">Abrir ficha del proyecto</Link>
      </div>

      {loading && <div className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 rounded-xl border border-white/10 bg-neutral-900" />)}</div>}
      {error && <SeoState tone="error" title="Error" description={error} />}

      {!loading && data && !data.seoProject && (
        <SeoState
          title="SEO no habilitado"
          description="Este proyecto todavía no está vinculado a Search Console ni Analytics."
          action={<Link href="/seo/integraciones" className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">Ir a integraciones</Link>}
        />
      )}

      {!loading && data?.seoProject && data.metrics && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SeoKpi label="Clicks" value={formatInt(data.metrics.gsc.clicks.value)} delta={data.metrics.gsc.clicks.deltaPct} />
            <SeoKpi label="Impresiones" value={formatInt(data.metrics.gsc.impressions.value)} delta={data.metrics.gsc.impressions.deltaPct} />
            <SeoKpi label="CTR" value={formatPercent(data.metrics.gsc.ctr.value)} delta={data.metrics.gsc.ctr.deltaPct} />
            <SeoKpi label="Posición media" value={formatDecimal(data.metrics.gsc.position.value)} delta={data.metrics.gsc.position.deltaPct} inverted />
            <SeoKpi label="Users" value={formatInt(data.metrics.ga4.users.value)} delta={data.metrics.ga4.users.deltaPct} />
            <SeoKpi label="Sessions" value={formatInt(data.metrics.ga4.sessions.value)} delta={data.metrics.ga4.sessions.deltaPct} />
            <SeoKpi label="Organic sessions" value={formatInt(data.metrics.ga4.organicSessions.value)} delta={data.metrics.ga4.organicSessions.deltaPct} />
            <SeoKpi label="Key events" value={formatInt(data.metrics.ga4.keyEvents.value)} delta={data.metrics.ga4.keyEvents.deltaPct} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-sm font-semibold text-white">Clicks Search Console</h2>
              <SeoSparkline values={data.metrics.series.gsc.map((point) => point.clicks)} />
              <p className="mt-2 text-xs text-neutral-500">{data.period.from} → {data.period.to} · comparado con el periodo anterior</p>
            </section>
            <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-sm font-semibold text-white">Posición media</h2>
              <SeoSparkline values={data.metrics.series.gsc.map((point) => point.position)} color="#fbbf24" />
              <p className="mt-2 text-xs text-neutral-500">Más bajo es mejor. Los deltas de posición se invierten en color.</p>
            </section>
          </div>

          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Integraciones</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-neutral-600">Search Console</p>
                <p className="mt-1 text-sm text-white">{data.seoProject.gscProperty?.siteUrl || "No vinculado"}</p>
                <p className="text-xs text-neutral-500">{data.seoProject.lastGscSyncStatus === "error" ? data.seoProject.lastGscError : `Última sync ${formatDateTime(data.seoProject.lastGscSyncAt)}`}</p>
              </div>
              <div className="rounded-lg border border-white/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-neutral-600">Analytics 4</p>
                <p className="mt-1 text-sm text-white">{data.seoProject.ga4Property?.displayName || "No vinculado"}</p>
                <p className="text-xs text-neutral-500">{data.seoProject.lastGa4SyncStatus === "error" ? data.seoProject.lastGa4Error : `Última sync ${formatDateTime(data.seoProject.lastGa4SyncAt)}`}</p>
              </div>
            </div>
          </section>

          {data.jobs.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-sm font-semibold text-white">Jobs recientes</h2>
              <ul className="mt-3 space-y-2 text-[13px] text-neutral-400">
                {data.jobs.map((job) => (
                  <li key={job.id} className="flex justify-between gap-3">
                    <span>{job.type} · {job.status} · {job.recordsProcessed} filas</span>
                    <span>{job.error || formatDateTime(job.startedAt)}</span>
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
