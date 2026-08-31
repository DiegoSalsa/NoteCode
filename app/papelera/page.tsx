"use client";

import { useCallback, useEffect, useState } from "react";

type TrashItem = { id: string; title?: string; name?: string; code?: string; description?: string; deletedAt: string | null; entity: string };

export default function TrashPage() {
  const [data, setData] = useState<{ retentionDays: number; items: TrashItem[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/trash");
    if (!response.ok) throw new Error("No se pudo cargar la papelera.");
    const payload = await response.json();
    const items: TrashItem[] = [
      ...payload.projects.map((item: { id: string; name: string; deletedAt: string }) => ({ ...item, entity: "project", title: item.name })),
      ...payload.tasks.map((item: { id: string; title: string; deletedAt: string }) => ({ ...item, entity: "task" })),
      ...payload.requirements.map((item: { id: string; code: string; description: string; deletedAt: string }) => ({ ...item, entity: "requirement", title: `${item.code} ${item.description}` })),
      ...payload.notes.map((item: { id: string; title: string; deletedAt: string }) => ({ ...item, entity: "note" })),
      ...payload.documents.map((item: { id: string; name: string; deletedAt: string }) => ({ ...item, entity: "document", title: item.name })),
      ...payload.techs.map((item: { id: string; name: string; deletedAt: string }) => ({ ...item, entity: "tech", title: item.name })),
    ];
    setData({ retentionDays: payload.retentionDays, items });
  }, []);

  useEffect(() => {
    load().catch((caught) => setError(caught instanceof Error ? caught.message : "Error"));
  }, [load]);

  async function restore(item: TrashItem) {
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: item.entity, id: item.id }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "No se pudo restaurar.");
      setNotice(`Restaurado: ${item.title}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo restaurar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-100">Papelera</h1>
        <p className="mt-1 text-[13px] text-neutral-400">
          Los elementos se pueden restaurar durante {data?.retentionDays ?? 30} días. La eliminación definitiva requiere un rol de administración.
        </p>
      </div>
      <div aria-live="polite" className="text-[13px] text-emerald-300">{notice}</div>
      {error && <p role="alert" className="text-[13px] text-red-300">{error}</p>}
      <ul className="space-y-2">
        {(data?.items ?? []).map((item) => (
          <li key={`${item.entity}:${item.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-neutral-900 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">{item.entity}</p>
              <p className="text-[14px] text-neutral-100">{item.title}</p>
            </div>
            <button
              type="button"
              disabled={busy === item.id}
              onClick={() => restore(item)}
              className="rounded-md bg-neutral-100 px-3 py-2 text-[12px] font-semibold text-neutral-950 disabled:opacity-50"
            >
              {busy === item.id ? "Restaurando…" : "Restaurar"}
            </button>
          </li>
        ))}
      </ul>
      {data && data.items.length === 0 && <p className="text-[13px] text-neutral-500">La papelera está vacía.</p>}
    </div>
  );
}
