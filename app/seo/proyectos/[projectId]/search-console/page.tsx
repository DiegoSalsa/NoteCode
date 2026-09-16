"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoKpi, SeoRangePills, SeoState, SeoSubnav } from "@/components/seo/SeoChrome";
import SeoSparkline from "@/components/seo/SeoSparkline";
import { formatDecimal, formatInt, formatPercent } from "@/lib/seo/format";
import type { SeoRangeKey } from "@/lib/seo/dates";

type Overview = {
  period: { from: string; to: string };
  summary: { clicks: number; impressions: number; ctr: number; position: number };
  series: Array<{ date: string; clicks: number; impressions: number; position: number }>;
  devices: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>;
  countries: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>;
};

type TablePayload = {
  total?: number;
  rows: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number; deltaPosition?: number | null }>;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "queries", label: "Queries" },
  { key: "pages", label: "Pages" },
  { key: "devices", label: "Devices" },
  { key: "countries", label: "Countries" },
];

export default function SearchConsolePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [range, setRange] = useState<SeoRangeKey>("28d");
  const [tab, setTab] = useState("overview");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("clicks");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [table, setTable] = useState<TablePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ range, view: tab, q, sort, take: "80" });
    const response = await fetch(`/api/seo/projects/${projectId}/gsc?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "No se pudo cargar Search Console.");
      setOverview(null);
      setTable(null);
    } else {
      setError("");
      if (tab === "overview") {
        setOverview(payload);
        setTable(null);
      } else {
        setTable(payload);
      }
    }
    setLoading(false);
  }, [projectId, range, tab, q, sort]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="Search Console"
        title="Performance"
        description="Histórico propio. No depende de la retención de Google."
        actions={<SeoRangePills value={range} onChange={setRange} />}
      />
      <SeoSubnav items={[
        { href: "/seo", label: "Portafolio" },
        { href: `/seo/proyectos/${projectId}`, label: "Dashboard" },
        { href: `/seo/proyectos/${projectId}/search-console`, label: "Search Console" },
        { href: `/seo/proyectos/${projectId}/analytics`, label: "Analytics" },
      ]} />

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((item) => (
          <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`rounded-md px-3 py-2 text-[13px] ${tab === item.key ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-white/5"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {error && <SeoState tone="error" title="Error" description={error} />}
      {loading && <div className="h-48 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />}

      {!loading && tab === "overview" && overview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SeoKpi label="Clicks" value={formatInt(overview.summary.clicks)} />
            <SeoKpi label="Impresiones" value={formatInt(overview.summary.impressions)} />
            <SeoKpi label="CTR" value={formatPercent(overview.summary.ctr)} />
            <SeoKpi label="Posición" value={formatDecimal(overview.summary.position)} />
          </div>
          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Clicks diarios</h2>
            <SeoSparkline values={overview.series.map((point) => point.clicks)} />
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <MetricTable title="Dispositivos" rows={overview.devices} />
            <MetricTable title="Países" rows={overview.countries} />
          </div>
        </>
      )}

      {!loading && tab !== "overview" && (
        <section className="space-y-3">
          {(tab === "queries" || tab === "pages") && (
            <div className="flex flex-wrap gap-2">
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={tab === "queries" ? "Buscar keyword" : "Buscar URL"} className="min-w-56 flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100" />
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-200">
                <option value="clicks">Clicks</option>
                <option value="impressions">Impresiones</option>
                <option value="ctr">CTR</option>
                <option value="position">Posición</option>
              </select>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-4 py-3">{tab === "pages" ? "URL" : tab === "queries" ? "Keyword" : "Dimensión"}</th>
                  <th className="px-4 py-3 text-right">Clicks</th>
                  <th className="px-4 py-3 text-right">Impr.</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3 text-right">Posición</th>
                  {tab === "queries" || tab === "pages" ? <th className="px-4 py-3 text-right">Δ Pos.</th> : null}
                </tr>
              </thead>
              <tbody>
                {(table?.rows ?? []).map((row) => (
                  <tr key={row.key} className="border-b border-white/5 last:border-0">
                    <td className="max-w-md truncate px-4 py-3 text-sm text-neutral-100">{row.key}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatInt(row.clicks)}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatInt(row.impressions)}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatPercent(row.ctr)}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatDecimal(row.position)}</td>
                    {(tab === "queries" || tab === "pages") && (
                      <td className="px-4 py-3 text-right text-sm text-neutral-400">{row.deltaPosition == null ? "—" : formatDecimal(row.deltaPosition)}</td>
                    )}
                  </tr>
                ))}
                {!table?.rows?.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-sm text-neutral-500">Sin datos para este periodo. Sincroniza el proyecto o espera a que Google entregue filas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-600"><Link href={`/seo/proyectos/${projectId}`} className="hover:underline">Volver al dashboard</Link></p>
        </section>
      )}
    </div>
  );
}

function MetricTable({ title, rows }: { title: string; rows: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }> }) {
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between text-[13px]">
            <span className="text-neutral-300">{row.key}</span>
            <span className="text-neutral-500">{formatInt(row.clicks)} clicks · {formatPercent(row.ctr)}</span>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-neutral-500">Sin datos.</p>}
      </div>
    </section>
  );
}
