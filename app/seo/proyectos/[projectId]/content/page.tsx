"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import { formatDecimal, formatInt, formatPercent } from "@/lib/seo/format";

export default function ContentPages({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [pages, setPages] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/seo/projects/${projectId}/content/pages`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudieron cargar páginas.");
    setPages(payload?.pages || []);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader kicker="Content" title="Pages" description="Perfil consolidado GSC + GA4 + rankings + crawl. GSC position ≠ posición SERP trackeada." />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId), { href: `/seo/proyectos/${projectId}/content/opportunities`, label: "Opportunities" }]} />
      {error && <SeoState tone="error" title="Error" description={error} />}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
        <table className="w-full min-w-[960px] text-left text-[13px]">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3 text-right">Clicks</th>
              <th className="px-4 py-3 text-right">Impr.</th>
              <th className="px-4 py-3 text-right">CTR</th>
              <th className="px-4 py-3 text-right">GSC pos</th>
              <th className="px-4 py-3 text-right">Sessions</th>
              <th className="px-4 py-3">Tracked</th>
              <th className="px-4 py-3">Tech</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((row) => (
              <tr key={row.pageKey} className="border-b border-white/5">
                <td className="max-w-sm truncate px-4 py-2"><button type="button" className="text-white hover:underline" onClick={() => setSelected(row)}>{row.url}</button></td>
                <td className="px-4 py-2 text-right">{formatInt(row.gsc.clicks)}</td>
                <td className="px-4 py-2 text-right">{formatInt(row.gsc.impressions)}</td>
                <td className="px-4 py-2 text-right">{formatPercent(row.gsc.ctr)}</td>
                <td className="px-4 py-2 text-right">{row.gsc.position == null ? "—" : formatDecimal(row.gsc.position)}</td>
                <td className="px-4 py-2 text-right">{formatInt(row.ga4.sessions)}</td>
                <td className="px-4 py-2">{row.tracked.length}</td>
                <td className="px-4 py-2">{row.issues.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><Link href={`/seo/proyectos/${projectId}/content/opportunities`} className="text-sm text-sky-300 hover:underline">Ver oportunidades</Link></p>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-white/10 bg-neutral-950 p-5 text-sm">
            <h3 className="font-semibold text-white">{selected.url}</h3>
            <p className="mt-2 text-neutral-400">GSC clicks {formatInt(selected.gsc.clicks)} · impr {formatInt(selected.gsc.impressions)} · CTR {formatPercent(selected.gsc.ctr)} · pos {selected.gsc.position == null ? "—" : formatDecimal(selected.gsc.position)}</p>
            <p className="text-neutral-400">GA4 sessions {formatInt(selected.ga4.sessions)} · users {formatInt(selected.ga4.users)} · key events {formatInt(selected.ga4.keyEvents)}</p>
            <p className="mt-2 text-neutral-500">Tracked: {selected.tracked.map((k: any) => `${k.keyword} (#${k.currentPosition ?? "—"})`).join(", ") || "—"}</p>
            <p className="text-neutral-500">Issues: {selected.issues.map((i: any) => i.ruleKey).join(", ") || "—"}</p>
            <p className="text-neutral-500">Opportunities: {selected.opportunities.map((o: any) => o.type).join(", ") || "—"}</p>
            <p className="mt-2 text-xs text-neutral-600">Indexable: {selected.crawl ? String(selected.crawl.indexable) : "sin crawl"}</p>
            <button type="button" onClick={() => setSelected(null)} className="mt-4 rounded-md border border-white/10 px-3 py-2">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
