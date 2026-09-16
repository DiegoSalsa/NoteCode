"use client";

import { use, useCallback, useEffect, useState } from "react";
import { SeoHeader, SeoKpi, SeoRangePills, SeoState, SeoSubnav } from "@/components/seo/SeoChrome";
import SeoSparkline from "@/components/seo/SeoSparkline";
import { formatInt, formatPercent } from "@/lib/seo/format";
import type { SeoRangeKey } from "@/lib/seo/dates";

type Overview = {
  period: { from: string; to: string };
  summary: { users: number; sessions: number; engagedSessions: number; engagementRate: number; organicSessions: number; keyEvents: number };
  series: Array<{ date: string; users: number; sessions: number; organicSessions: number; keyEvents: number }>;
  sources: Array<{ source: string; medium: string; users: number; sessions: number }>;
};

type Landings = {
  rows: Array<{ landingPage: string; users: number; sessions: number; engagementRate: number; keyEvents: number }>;
};

export default function AnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [range, setRange] = useState<SeoRangeKey>("28d");
  const [q, setQ] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [landings, setLandings] = useState<Landings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [overviewRes, landingRes] = await Promise.all([
      fetch(`/api/seo/projects/${projectId}/ga4?range=${range}&view=overview`),
      fetch(`/api/seo/projects/${projectId}/ga4?range=${range}&view=landings&q=${encodeURIComponent(q)}&take=80`),
    ]);
    const overviewPayload = await overviewRes.json().catch(() => null);
    const landingPayload = await landingRes.json().catch(() => null);
    if (!overviewRes.ok) setError(overviewPayload?.error || "No se pudo cargar Analytics.");
    else {
      setError("");
      setOverview(overviewPayload);
      setLandings(landingPayload);
    }
    setLoading(false);
  }, [projectId, range, q]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="Google Analytics 4"
        title="Analytics"
        description="Users, sessions, organic y landings. Field data de GA4, no lab data."
        actions={<SeoRangePills value={range} onChange={setRange} />}
      />
      <SeoSubnav items={[
        { href: "/seo", label: "Portafolio" },
        { href: `/seo/proyectos/${projectId}`, label: "Dashboard" },
        { href: `/seo/proyectos/${projectId}/search-console`, label: "Search Console" },
        { href: `/seo/proyectos/${projectId}/analytics`, label: "Analytics" },
      ]} />

      {error && <SeoState tone="error" title="Error" description={error} />}
      {loading && <div className="h-48 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />}

      {!loading && overview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SeoKpi label="Users" value={formatInt(overview.summary.users)} />
            <SeoKpi label="Sessions" value={formatInt(overview.summary.sessions)} />
            <SeoKpi label="Organic sessions" value={formatInt(overview.summary.organicSessions)} />
            <SeoKpi label="Engagement" value={formatPercent(overview.summary.engagementRate)} />
            <SeoKpi label="Engaged sessions" value={formatInt(overview.summary.engagedSessions)} />
            <SeoKpi label="Key events" value={formatInt(overview.summary.keyEvents)} />
          </div>
          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Sessions diarias</h2>
            <SeoSparkline values={overview.series.map((point) => point.sessions)} color="#86efac" />
          </section>
          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Source / medium</h2>
            <div className="mt-3 space-y-2">
              {overview.sources.map((row) => (
                <div key={`${row.source}|${row.medium}`} className="flex justify-between text-[13px]">
                  <span className="text-neutral-300">{row.source} / {row.medium}</span>
                  <span className="text-neutral-500">{formatInt(row.sessions)} sessions</span>
                </div>
              ))}
              {!overview.sources.length && <p className="text-sm text-neutral-500">Sin desglose de canales para este periodo.</p>}
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Landing pages</h2>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Filtrar URL" className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100" />
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
                  <tr>
                    <th className="px-4 py-3">Landing</th>
                    <th className="px-4 py-3 text-right">Users</th>
                    <th className="px-4 py-3 text-right">Sessions</th>
                    <th className="px-4 py-3 text-right">Engagement</th>
                    <th className="px-4 py-3 text-right">Key events</th>
                  </tr>
                </thead>
                <tbody>
                  {(landings?.rows ?? []).map((row) => (
                    <tr key={row.landingPage} className="border-b border-white/5 last:border-0">
                      <td className="max-w-md truncate px-4 py-3 text-sm text-neutral-100">{row.landingPage}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatInt(row.users)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatInt(row.sessions)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatPercent(row.engagementRate)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatInt(row.keyEvents)}</td>
                    </tr>
                  ))}
                  {!landings?.rows?.length && <tr><td colSpan={5} className="px-4 py-8 text-sm text-neutral-500">Sin landings sincronizadas para este periodo.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
