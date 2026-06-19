"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { fetchAndCacheJson, readCachedJson } from "@/lib/client-cache";
import { useDebounce } from "@/lib/use-debounce";

type CompanyDocument = {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

type DocumentsPayload = {
  documents: CompanyDocument[];
  categories: string[];
  nextSkip: number;
  hasMore: boolean;
  total: number;
};

const DEFAULT_CATEGORIES = ["General", "Contratos", "Cotizaciones", "Plantillas", "Legal"];

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosPage() {
  const cached = readCachedJson<Partial<DocumentsPayload>>("documents:::0:50");
  const [documents, setDocuments] = useState<CompanyDocument[]>(() => asArray<CompanyDocument>(cached?.documents));
  const [categories, setCategories] = useState<string[]>(() => asArray<string>(cached?.categories));
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextSkip, setNextSkip] = useState(cached?.nextSkip ?? documents.length);
  const [hasMore, setHasMore] = useState(Boolean(cached?.hasMore));
  const [total, setTotal] = useState(cached?.total ?? documents.length);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", category: "General", file: null as File | null });

  const allCategories = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES, ...categories, ...documents.map((document) => document.category)])],
    [categories, documents],
  );

  const fetchDocuments = useCallback(async ({ append = false, skip = 0 } = {}) => {
    try {
      const params = new URLSearchParams({
        q: debouncedSearch,
        category: selectedCategory ?? "",
        skip: String(skip),
        take: "50",
      });
      const key = `documents:${debouncedSearch}:${selectedCategory ?? ""}:${skip}:50`;
      const data = await fetchAndCacheJson<DocumentsPayload>(key, `/api/documents?${params.toString()}`);
      const items = asArray<CompanyDocument>(data.documents);

      setError("");
      setDocuments((current) => (append ? [...current, ...items] : items));
      setCategories(asArray<string>(data.categories));
      setNextSkip(data.nextSkip ?? skip + items.length);
      setHasMore(Boolean(data.hasMore));
      setTotal(data.total ?? items.length);
    } catch {
      setError("No se pudieron cargar los documentos.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, selectedCategory]);

  useEffect(() => {
    setLoading(true);
    fetchDocuments();
  }, [fetchDocuments]);

  async function loadMore() {
    setLoadingMore(true);
    await fetchDocuments({ append: true, skip: nextSkip });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.file) {
      setError("Selecciona un archivo para subir.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.set("file", form.file);
      body.set("name", form.name);
      body.set("category", form.category);

      const response = await fetch("/api/documents", { method: "POST", body });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "No se pudo subir el documento.");
      }

      setModalOpen(false);
      setForm({ name: "", category: selectedCategory || "General", file: null });
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el documento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar este documento?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await fetchDocuments();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-neutral-800" />
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-lg border border-white/10 bg-neutral-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">Documentos</h1>
            <p className="mt-1 text-[13px] text-neutral-500">{total} archivos de empresa</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setForm({ name: "", category: selectedCategory || "General", file: null });
              setModalOpen(true);
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white sm:w-auto"
          >
            <Plus size={15} strokeWidth={2} />
            Subir Documento
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar por nombre o categoria..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-900 py-2.5 pl-10 pr-4 text-[14px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-white/20"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                selectedCategory === null ? "bg-neutral-100 text-neutral-950" : "bg-neutral-900 text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              Todas
            </button>
            {allCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`shrink-0 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  selectedCategory === category ? "bg-neutral-100 text-neutral-950" : "bg-neutral-900 text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-neutral-900">
        {documents.map((document, index) => (
          <div
            key={document.id}
            className={`flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
              index !== documents.length - 1 ? "border-b border-white/5" : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-neutral-950">
                <FileText size={17} className="text-neutral-300" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-medium text-neutral-200">{document.name}</h3>
                <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                  {document.category} / {formatBytes(document.size)} / {new Date(document.updatedAt).toLocaleDateString("es-MX")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/documents/${document.id}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
                title="Descargar"
              >
                <Download size={15} strokeWidth={1.5} />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(document.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition-colors hover:bg-white/5 hover:text-red-300"
                title="Eliminar"
              >
                <Trash2 size={15} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
            {search || selectedCategory ? "No se encontraron documentos." : "Todavia no hay documentos subidos."}
          </div>
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-lg border border-white/10 bg-neutral-950 px-4 py-2.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/5 disabled:opacity-60"
        >
          {loadingMore ? "Cargando..." : "Cargar mas"}
        </button>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-neutral-100">Subir Documento</h2>
              <button onClick={() => setModalOpen(false)} className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">Archivo</label>
                <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-neutral-950 px-4 py-5 text-center transition-colors hover:bg-white/[0.03]">
                  <Upload size={18} className="text-neutral-400" />
                  <span className="max-w-full truncate text-[13px] font-medium text-neutral-200">
                    {form.file ? form.file.name : "Seleccionar archivo"}
                  </span>
                  <span className="text-[11px] text-neutral-500">Maximo 12 MB</span>
                  <input
                    type="file"
                    required
                    className="hidden"
                    onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })}
                  />
                </label>
              </div>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                placeholder="Nombre visible (opcional)"
              />
              <input
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                list="document-category-suggestions"
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                placeholder="Categoria"
              />
              <datalist id="document-category-suggestions">
                {allCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-[13px] font-medium text-neutral-300 hover:bg-white/5">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white disabled:opacity-50">
                  {saving ? "Subiendo..." : "Subir"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
