"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import SeoSparkline from "@/components/seo/SeoSparkline";
import { formatDateTime, formatDecimal, formatInt } from "@/lib/seo/format";

type Detail = {
  keyword: {
    id: string;
    keyword: string;
    targetUrl: string | null;
    country: string;
    language: string;
    device: string;
    currentPosition: number | null;
    previousPosition: number | null;
    bestPosition: number | null;
    worstPosition: number | null;
    currentUrl: string | null;
    targetMismatch: boolean;
    status: string;
    lastError: string | null;
  };
  primaryDomain: string | null;
  series: Array<{ date: string; position: number | null; url: string | null }>;
  events: Array<{ date: string; type: string; label: string }>;
  snapshot: { features: string[]; results: Array<{ position: number; domain: string; url: string; title: string | null; isOwn: boolean; type: string }> } | null;
  trackedSerpPosition: number | null;
  gscAveragePosition: number | null;
  gscClicks: number;
  gscImpressions: number;
};

export default function KeywordDetailPage({ params }: { params: Promise<{ projectId: string; keywordId: string }> }) {
  const { projectId, keywordId } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [targetUrl, setTargetUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/seo/projects/${projectId}/keywords/${keywordId}?range=3m`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo cargar la keyword.");
    else {
      setData(payload);
      setTargetUrl(payload.keyword.targetUrl || "");
    }
    setLoading(false);
  }, [projectId, keywordId]);

  useEffect(() => { void load(); }, [load]);

  async function saveTarget() {
    setBusy(true);
    const response = await fetch(`/api/seo/projects/${projectId}/keywords/${keywordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo guardar.");
    setBusy(false);
    await load();
  }

  const positions = (data?.series ?? []).map((point) => point.position).filter((value): value is number => value != null);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="Rank tracker"
        title={data?.keyword.keyword || "Keyword"}
        description={`${data?.keyword.country}/${data?.keyword.language}/${data?.keyword.device}`}
      />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId)]} />
      <Link href={`/seo/proyectos/${projectId}/rankings`} className="text-[12px] text-neutral-500 hover:underline">← Rankings</Link>
      {error && <SeoState tone="error" title="Error" description={error} />}
      {loading && <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <p className="text-[10px] uppercase tracking-wider text-neutral-600">Tracked SERP position</p>
              <p className="mt-3 text-xl font-semibold text-white">{data.trackedSerpPosition ?? "—"}</p>
              <p className="mt-1 text-xs text-neutral-500">Observada en Google vía proveedor. No es GSC.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <p className="text-[10px] uppercase tracking-wider text-neutral-600">GSC average position (periodo)</p>
              <p className="mt-3 text-xl font-semibold text-white">{data.gscAveragePosition == null ? "—" : formatDecimal(data.gscAveragePosition)}</p>
              <p className="mt-1 text-xs text-neutral-500">{formatInt(data.gscClicks)} clicks · {formatInt(data.gscImpressions)} impr.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <p className="text-[10px] uppercase tracking-wider text-neutral-600">Mejor / peor</p>
              <p className="mt-3 text-xl font-semibold text-white">{data.keyword.bestPosition ?? "—"} / {data.keyword.worstPosition ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <p className="text-[10px] uppercase tracking-wider text-neutral-600">URL actual</p>
              <p className="mt-3 truncate text-sm text-white">{data.keyword.currentUrl || "No aparece en la SERP guardada"}</p>
              {data.keyword.targetMismatch && <p className="mt-1 text-xs text-amber-300">⚠ Ranking URL distinta al target</p>}
            </div>
          </div>

          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Posición en el tiempo</h2>
            <p className="text-xs text-neutral-500">El eje pone 1 arriba (mejor) y valores altos abajo.</p>
            <SeoSparkline values={positions.length ? positions : [0, 0]} invert color="#fbbf24" />
          </section>

          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Target URL</h2>
            <div className="mt-3 flex gap-2">
              <input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} className="flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[13px]" />
              <button type="button" disabled={busy} onClick={() => void saveTarget()} className="rounded-md border border-white/10 px-3 py-2 text-[13px]">Guardar</button>
            </div>
          </section>

          {data.events.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-sm font-semibold text-white">Eventos</h2>
              <ul className="mt-3 space-y-2 text-[13px] text-neutral-400">
                {data.events.map((event) => (
                  <li key={`${event.date}-${event.type}`}>{event.date} · {event.label}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-white">Último snapshot SERP</h2>
            <p className="text-xs text-neutral-500">Features: {data.snapshot?.features.join(", ") || "organic"}</p>
            <div className="mt-3 space-y-2">
              {(data.snapshot?.results ?? []).map((result) => (
                <div key={`${result.position}-${result.url}`} className={`flex justify-between gap-3 text-[13px] ${result.isOwn ? "text-emerald-300" : "text-neutral-300"}`}>
                  <span>#{result.position} {result.domain}</span>
                  <span className="truncate text-neutral-500">{result.title}</span>
                </div>
              ))}
              {!data.snapshot && <p className="text-sm text-neutral-500">Todavía no hay snapshot. Ejecuta Actualizar posiciones.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
