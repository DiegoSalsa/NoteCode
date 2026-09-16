"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import { formatDateTime, formatInt } from "@/lib/seo/format";

type Row = {
  id: string;
  keyword: string;
  targetUrl: string | null;
  country: string;
  language: string;
  device: string;
  location: string;
  active: boolean;
  group: { id: string; name: string } | null;
  searchVolume: number | null;
  position: number | null;
  previous: number | null;
  delta: number | null;
  best: number | null;
  url: string | null;
  targetMismatch: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  status: string;
  features: string[];
};

type Payload = {
  project: { name: string };
  primaryDomain: string | null;
  lastRankingsSyncAt: string | null;
  lastRankingsSyncStatus: string | null;
  lastRankingsError: string | null;
  groups: Array<{ id: string; name: string }>;
  rows: Row[];
  error?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  tracking: "Tracking",
  error: "Error",
  inactive: "Inactiva",
  sin_datos: "Sin datos",
};

export default function RankingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ keyword: "", targetUrl: "", group: "", country: "CL", language: "es", device: "desktop", location: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (groupId) params.set("groupId", groupId);
    if (status) params.set("status", status);
    const response = await fetch(`/api/seo/projects/${projectId}/keywords?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudieron cargar las keywords.");
    else {
      setError("");
      setData(payload);
    }
    setLoading(false);
  }, [projectId, q, groupId, status]);

  useEffect(() => { void load(); }, [load]);

  async function addKeyword() {
    setBusy("add");
    const response = await fetch(`/api/seo/projects/${projectId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo crear la keyword.");
    else {
      setNotice("Keyword agregada. La posición aparece tras sincronizar SERP.");
      setForm({ ...form, keyword: "", targetUrl: "" });
    }
    setBusy("");
    await load();
  }

  async function bulk(action: string) {
    if (!selected.length) return;
    setBusy(action);
    const response = await fetch(`/api/seo/projects/${projectId}/keywords/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids: selected }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo actualizar la selección.");
    else setSelected([]);
    setBusy("");
    await load();
  }

  async function sync() {
    setBusy("sync");
    setError("");
    const response = await fetch(`/api/seo/projects/${projectId}/rankings/sync`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo actualizar posiciones.");
    else setNotice(`Sync listo. ${payload.stats?.keywordsSuccess ?? 0} ok · ${payload.stats?.keywordsSkipped ?? 0} ya tenían dato de hoy · costo ~US$${(payload.stats?.estimatedCost ?? 0).toFixed(4)}`);
    setBusy("");
    await load();
  }

  const allIds = useMemo(() => data?.rows.map((row) => row.id) ?? [], [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="Rank tracker"
        title="Rankings"
        description="Posición observada en una SERP concreta. No es la posición media de Search Console."
        actions={
          <button type="button" disabled={busy === "sync"} onClick={() => void sync()} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950 disabled:opacity-40">
            {busy === "sync" ? "Consultando SERP…" : "Actualizar posiciones"}
          </button>
        }
      />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId)]} />
      {notice && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-200">{notice}</p>}
      {error && <SeoState tone="error" title="Error" description={error} />}
      {data?.lastRankingsSyncStatus === "budget_exceeded" && (
        <SeoState tone="warning" title="Presupuesto SERP agotado" description={data.lastRankingsError || "No se harán más consultas pagadas hasta el próximo periodo."} />
      )}

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-white">Agregar keyword</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input value={form.keyword} onChange={(event) => setForm({ ...form, keyword: event.target.value })} placeholder="software agenda barberias" className="rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[13px]" />
          <input value={form.targetUrl} onChange={(event) => setForm({ ...form, targetUrl: event.target.value })} placeholder="Target URL (opcional)" className="rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[13px]" />
          <input value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} placeholder="Grupo (Barberías)" className="rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[13px]" />
          <div className="flex gap-2">
            <input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} className="w-16 rounded-md border border-white/10 bg-neutral-950 px-2 py-2 text-[13px]" />
            <input value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} className="w-16 rounded-md border border-white/10 bg-neutral-950 px-2 py-2 text-[13px]" />
            <select value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-2 text-[13px]">
              <option value="desktop">desktop</option>
              <option value="mobile">mobile</option>
            </select>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button type="button" disabled={busy === "add"} onClick={() => void addKeyword()} className="rounded-md border border-white/10 px-3 py-2 text-[13px] text-neutral-200 hover:bg-white/5">Agregar</button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar" className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px]" />
        <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px]">
          <option value="">Todos los grupos</option>
          {data?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px]">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {selected.length > 0 && (
          <>
            <button type="button" onClick={() => void bulk("activate")} className="rounded-md border border-white/10 px-3 py-2 text-[12px]">Activar</button>
            <button type="button" onClick={() => void bulk("deactivate")} className="rounded-md border border-white/10 px-3 py-2 text-[12px]">Desactivar</button>
            <button type="button" onClick={() => void bulk("delete")} className="rounded-md border border-red-500/20 px-3 py-2 text-[12px] text-red-200">Borrar</button>
          </>
        )}
      </div>

      {loading && <div className="h-48 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />}
      {!loading && data && (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={selected.length === allIds.length && allIds.length > 0} onChange={(event) => setSelected(event.target.checked ? allIds : [])} /></th>
                <th className="px-3 py-3">Keyword</th>
                <th className="px-3 py-3 text-right">Posición</th>
                <th className="px-3 py-3 text-right">Anterior</th>
                <th className="px-3 py-3 text-right">Δ</th>
                <th className="px-3 py-3 text-right">Mejor</th>
                <th className="px-3 py-3">URL encontrada</th>
                <th className="px-3 py-3">Target</th>
                <th className="px-3 py-3 text-right">Volumen</th>
                <th className="px-3 py-3">SERP</th>
                <th className="px-3 py-3">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td>
                  <td className="px-3 py-3">
                    <Link href={`/seo/proyectos/${projectId}/rankings/${row.id}`} className="text-sm text-white hover:underline">{row.keyword}</Link>
                    <p className="text-[11px] text-neutral-600">{row.group?.name || "Sin grupo"} · {row.country}/{row.language}/{row.device} · {STATUS_LABEL[row.status] || row.status}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-sm">{row.position ?? "—"}</td>
                  <td className="px-3 py-3 text-right text-sm text-neutral-400">{row.previous ?? "—"}</td>
                  <td className={`px-3 py-3 text-right text-sm ${row.delta == null ? "text-neutral-500" : row.delta < 0 ? "text-emerald-300" : row.delta > 0 ? "text-red-300" : "text-neutral-500"}`}>{row.delta == null ? "—" : row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                  <td className="px-3 py-3 text-right text-sm">{row.best ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-3 text-[12px] text-neutral-400">{row.url || "—"}</td>
                  <td className="px-3 py-3 text-[12px]">{row.targetMismatch ? <span className="text-amber-300">⚠ distinta al target</span> : row.targetUrl || "—"}</td>
                  <td className="px-3 py-3 text-right text-sm text-neutral-500">{row.searchVolume == null ? "—" : formatInt(row.searchVolume)}</td>
                  <td className="px-3 py-3 text-[11px] text-neutral-500">{row.features.join(", ") || "organic"}</td>
                  <td className="px-3 py-3 text-[11px] text-neutral-500">{row.lastError || formatDateTime(row.lastSyncAt)}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={11} className="px-4 py-8 text-sm text-neutral-500">No hay keywords. Agrégalas y luego actualiza posiciones. No se muestran datos inventados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-600">Última sync SERP: {formatDateTime(data?.lastRankingsSyncAt)} · dominio propio {data?.primaryDomain || "sin definir"}</p>
    </div>
  );
}
