"use client";

import { use, useCallback, useEffect, useState } from "react";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";

export default function OpportunitiesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<any>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/seo/projects/${projectId}/opportunities?type=${encodeURIComponent(type)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudieron cargar oportunidades.");
    setRows(payload?.rows || []);
  }, [projectId, type]);
  useEffect(() => { void load(); }, [load]);

  async function analyze() {
    const response = await fetch(`/api/seo/projects/${projectId}/opportunities/analyze`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "El análisis falló.");
    await load();
  }
  async function setStatus(id: string, status: string) {
    await fetch(`/api/seo/projects/${projectId}/opportunities/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }
  async function createTask(id: string) {
    const response = await fetch(`/api/seo/projects/${projectId}/opportunities/${id}/task`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo crear la tarea.");
    await load();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="Content"
        title="Opportunities"
        description="Prioridad operacional 0–100, distinta de SEO Health. Keyword gap usa solo SERPs trackeadas, no todo Google."
        actions={<button type="button" onClick={() => void analyze()} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">Recalcular</button>}
      />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId), { href: `/seo/proyectos/${projectId}/content/opportunities`, label: "Opportunities" }]} />
      {error && <SeoState tone="error" title="Error" description={error} />}
      <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px]">
        <option value="">Todos los tipos</option>
        {["NEAR_WIN", "LOW_CTR", "CONTENT_DECAY", "CANNIBALIZATION", "KEYWORD_GAP", "POTENTIAL_NEW_CONTENT", "TECHNICAL_HIGH_TRAFFIC", "TARGET_URL_MISMATCH"].map((item) => <option key={item}>{item}</option>)}
      </select>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
        <table className="w-full min-w-[1000px] text-left text-[13px]">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Page / Keyword</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5">
                <td className="px-4 py-2 font-medium text-white">{Math.round(row.score)}</td>
                <td className="px-4 py-2">{row.type}</td>
                <td className="px-4 py-2">
                  <button type="button" className="text-left text-white hover:underline" onClick={() => setOpen(row)}>{row.title}</button>
                  <p className="text-[12px] text-neutral-500">{row.keyword || row.url || ""}</p>
                </td>
                <td className="px-4 py-2">{row.confidence}</td>
                <td className="px-4 py-2">
                  <select value={row.status} onChange={(e) => void setStatus(row.id, e.target.value)} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-[12px]">
                    {["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">{row.taskId ? "Tarea" : <button type="button" onClick={() => void createTask(row.id)} className="text-sky-300">Crear tarea</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-8 text-neutral-500">Sin oportunidades. Pulsa Recalcular (usa GSC/rankings/crawl ya guardados, sin costo extra).</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-white/10 bg-neutral-950 p-5 text-sm">
            <h3 className="font-semibold text-white">{open.title}</h3>
            <p className="mt-2 text-neutral-300">{open.summary}</p>
            <p className="mt-3 text-neutral-400">{open.recommendation}</p>
            <p className="mt-3 text-xs text-neutral-600">Why: {JSON.stringify(open.evidence)}</p>
            <p className="mt-2 text-xs text-neutral-600">Score {Math.round(open.score)} · confidence {open.confidence} · no es SEO Health</p>
            <button type="button" onClick={() => setOpen(null)} className="mt-4 rounded-md border border-white/10 px-3 py-2">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
