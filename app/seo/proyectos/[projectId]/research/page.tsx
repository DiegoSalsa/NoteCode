"use client";

import { use, useState } from "react";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import { formatDecimal, formatInt, formatPercent } from "@/lib/seo/format";

export default function ResearchPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [q, setQ] = useState("agenda online");
  const [country, setCountry] = useState("CL");
  const [language, setLanguage] = useState("es");
  const [data, setData] = useState<any>(null);
  const [untracked, setUntracked] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function search(confirm = false) {
    setBusy("search");
    setError("");
    const response = await fetch(`/api/seo/projects/${projectId}/research?q=${encodeURIComponent(q)}&country=${country}&language=${language}&confirm=${confirm ? "1" : "0"}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "Research no disponible.");
    setData(payload);
    setBusy("");
  }

  async function loadUntracked() {
    const payload = await fetch(`/api/seo/projects/${projectId}/research/untracked`).then((r) => r.json()).catch(() => null);
    setUntracked(payload?.rows || []);
  }

  async function track(keyword: string) {
    const response = await fetch(`/api/seo/projects/${projectId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, country, language, device: "desktop" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo agregar.");
    else await search(true);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader kicker="Research" title="Keywords" description="Search Volume es del provider. Impressions/CTR vienen de GSC. No son la misma métrica. Dataset limitado a lo investigado/trackeado." />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId)]} />
      {error && <SeoState tone="error" title="Error" description={error} />}
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-56 flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px]" />
        <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-16 rounded-md border border-white/10 bg-neutral-900 px-2 py-2 text-[13px]" />
        <input value={language} onChange={(e) => setLanguage(e.target.value)} className="w-16 rounded-md border border-white/10 bg-neutral-900 px-2 py-2 text-[13px]" />
        <button type="button" disabled={!!busy} onClick={() => void search(false)} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">Explorar</button>
      </div>
      {data?.needsConfirm && (
        <SeoState
          tone="warning"
          title={`Costo estimado: US$${Number(data.estimatedCostUsd || 0).toFixed(4)}`}
          description="Se consultará DataForSEO Labs (overview, suggestions, related). El cache 30 días evita repetir el pago."
          action={<button type="button" onClick={() => void search(true)} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">Continuar</button>}
        />
      )}
      {data?.overview && (
        <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-sm font-semibold text-white">{data.overview.keyword}</h2>
          <p className="mt-2 text-sm text-neutral-400">Volume {data.overview.searchVolume ?? "—"} · CPC {data.overview.cpc ?? "—"} · Competition {data.overview.competition ?? "—"} · Intent {data.overview.intent || "—"}</p>
          <p className="mt-1 text-sm text-neutral-500">GSC 28d: {formatInt(data.gsc?.impressions)} impr. · {formatInt(data.gsc?.clicks)} clicks · CTR {formatPercent(data.gsc?.ctr)} · pos {data.gsc?.position == null ? "—" : formatDecimal(data.gsc.position)}</p>
          <p className="mt-1 text-xs text-neutral-600">Cache: {JSON.stringify(data.cached)} · costo esta llamada US${Number(data.costUsd || 0).toFixed(4)}</p>
          <button type="button" onClick={() => void track(data.overview.keyword)} className="mt-3 rounded-md border border-white/10 px-3 py-1.5 text-[12px]">{data.overview.tracked ? "Ya tracked" : "Agregar al tracking"}</button>
        </section>
      )}
      {["suggestions", "related", "questions"].map((section) => (
        <section key={section} className="rounded-xl border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-sm font-semibold capitalize text-white">{section}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                <tr><th className="py-2">Keyword</th><th>Volume</th><th>CPC</th><th>Comp</th><th>Intent</th><th>Tracked</th><th>Pos</th><th /></tr>
              </thead>
              <tbody>
                {(data?.[section] ?? []).map((row: any) => (
                  <tr key={row.keyword} className="border-t border-white/5">
                    <td className="py-2 text-white">{row.keyword}</td>
                    <td>{row.searchVolume ?? "—"}</td>
                    <td>{row.cpc ?? "—"}</td>
                    <td>{row.competition ?? "—"}</td>
                    <td>{row.intent || "—"}</td>
                    <td>{row.tracked ? "sí" : "no"}</td>
                    <td>{row.ourPosition ?? "—"}</td>
                    <td><button type="button" onClick={() => void track(row.keyword)} className="text-[12px] text-sky-300">Track</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Untracked GSC queries</h2>
          <button type="button" onClick={() => void loadUntracked()} className="text-[12px] text-sky-300">Cargar</button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Fuente gratuita: queries con impresiones que aún no están en el rank tracker.</p>
        <ul className="mt-3 space-y-1 text-[13px]">
          {untracked.slice(0, 40).map((row) => (
            <li key={row.keyword} className="flex justify-between gap-3">
              <span className="text-neutral-200">{row.keyword} <span className="text-neutral-500">{formatInt(row.impressions)} impr · pos {row.position == null ? "—" : formatDecimal(row.position)}</span></span>
              <button type="button" onClick={() => void track(row.keyword)} className="text-sky-300">Add to tracking</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
