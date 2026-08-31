"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useDebounce } from "@/lib/use-debounce";

type Hit = { type: string; id: string; title: string; snippet: string; href: string };

const TYPES = [
  { key: "all", label: "Todo" },
  { key: "project", label: "Proyectos" },
  { key: "task", label: "Tareas" },
  { key: "requirement", label: "Requisitos" },
  { key: "note", label: "Notas" },
  { key: "document", label: "Documentos" },
  { key: "tech", label: "Tecnologías" },
];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [items, setItems] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounced = useDebounce(q);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setItems([]);
      setTotal(0);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/search?q=${encodeURIComponent(debounced)}&type=${type}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "No se pudo buscar.");
        return response.json();
      })
      .then((data) => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((caught) => {
        if (caught.name !== "AbortError") setError(caught instanceof Error ? caught.message : "No se pudo buscar.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced, type]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold text-neutral-100">Búsqueda</h1>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-neutral-300">Buscar en el espacio de trabajo</span>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 px-3">
            <Search size={16} className="text-neutral-500" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="h-11 w-full bg-transparent text-[14px] outline-none"
              placeholder="Proyectos, tareas, requisitos, notas..."
              autoFocus
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar tipo">
          {TYPES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setType(item.key)}
              className={`rounded-full border px-3 py-1.5 text-[12px] ${type === item.key ? "border-white/20 bg-neutral-100 text-neutral-950" : "border-white/10 text-neutral-400"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div aria-live="polite" className="text-[13px] text-neutral-500">
        {loading ? "Buscando…" : q.trim().length >= 2 ? `${total} resultado${total === 1 ? "" : "s"}` : "Escribe al menos dos caracteres."}
      </div>
      {error && <p role="alert" className="text-[13px] text-red-300">{error}</p>}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.type}:${item.id}`}>
            <Link href={item.href} className="block rounded-lg border border-white/10 bg-neutral-900 px-4 py-3 hover:bg-white/[0.03]">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">{item.type}</p>
              <h2 className="text-[15px] font-medium text-neutral-100">{item.title}</h2>
              <p className="mt-1 text-[13px] text-neutral-400">{item.snippet}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
