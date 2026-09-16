"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import { formatDecimal } from "@/lib/seo/format";

type Row = {
  id: string;
  domain: string;
  name: string | null;
  source: string;
  metrics: { sharedKeywords: number; top3: number; top10: number; averagePosition: number | null; visibility: number };
};

export default function CompetitorsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [rows, setRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<Array<{ domain: string; sharedKeywords: number; totalKeywords: number }>>([]);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [list, detected] = await Promise.all([
      fetch(`/api/seo/projects/${projectId}/competitors`).then((response) => response.json()),
      fetch(`/api/seo/projects/${projectId}/competitors/detected`).then((response) => response.json()),
    ]);
    if (list.error) setError(list.error);
    setRows(list.rows || []);
    setCandidates(detected.candidates || []);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function add(value: string, source = "manual") {
    setBusy(value);
    const response = await fetch(`/api/seo/projects/${projectId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: value, source }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo agregar.");
    setDomain("");
    setBusy("");
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/seo/projects/${projectId}/competitors/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader kicker="SEO" title="Competitors" description="Comparación sobre keywords trackeadas. Visibility es una fórmula interna CTR-weighted, no una métrica de Google." />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId)]} />
      {error && <SeoState tone="error" title="Error" description={error} />}

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-white">Agregar competidor</h2>
        <div className="mt-3 flex gap-2">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="agendapro.com" className="flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[13px]" />
          <button type="button" disabled={busy !== ""} onClick={() => void add(domain)} className="rounded-md border border-white/10 px-3 py-2 text-[13px]">Añadir</button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
        <table className="w-full min-w-[800px] text-left">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3 text-right">Shared</th>
              <th className="px-4 py-3 text-right">Top 3</th>
              <th className="px-4 py-3 text-right">Top 10</th>
              <th className="px-4 py-3 text-right">Avg pos</th>
              <th className="px-4 py-3 text-right">Visibility</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3"><Link href={`/seo/proyectos/${projectId}/competitors/${row.id}`} className="text-sm text-white hover:underline">{row.domain}</Link><p className="text-[11px] text-neutral-600">{row.source}</p></td>
                <td className="px-4 py-3 text-right text-sm">{row.metrics.sharedKeywords}</td>
                <td className="px-4 py-3 text-right text-sm">{row.metrics.top3}</td>
                <td className="px-4 py-3 text-right text-sm">{row.metrics.top10}</td>
                <td className="px-4 py-3 text-right text-sm">{row.metrics.averagePosition == null ? "—" : formatDecimal(row.metrics.averagePosition)}</td>
                <td className="px-4 py-3 text-right text-sm">{formatDecimal(row.metrics.visibility)}</td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => void remove(row.id)} className="text-[12px] text-red-300">Quitar</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-sm text-neutral-500">Sin competidores confirmados.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-white">Competidores detectados</h2>
        <p className="mt-1 text-sm text-neutral-500">Dominios que aparecen de forma repetida en las SERPs trackeadas. No se agregan solos.</p>
        <ul className="mt-4 space-y-2">
          {candidates.map((item) => (
            <li key={item.domain} className="flex items-center justify-between text-sm">
              <span className="text-neutral-200">{item.domain} <span className="text-neutral-500">Coincide en {item.sharedKeywords}/{item.totalKeywords} keywords</span></span>
              <button type="button" disabled={busy === item.domain} onClick={() => void add(item.domain, "detected")} className="rounded-md border border-white/10 px-3 py-1.5 text-[12px]">Añadir</button>
            </li>
          ))}
          {!candidates.length && <li className="text-sm text-neutral-500">Todavía no hay candidatos. Sincroniza rankings primero.</li>}
        </ul>
      </section>
    </div>
  );
}
