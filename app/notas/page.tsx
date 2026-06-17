"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, X, FolderKanban } from "lucide-react";
import { fetchAndCacheJson, readCachedJson } from "@/lib/client-cache";
import { useDebounce } from "@/lib/use-debounce";

type Note = {
    id: string;
    title: string;
    content: string;
    folder: string;
    updatedAt: string;
    createdAt: string;
};

const FOLDERS = ["General", "Procesos", "Tech", "Reuniones", "Ideas"];

type NotesPayload = {
    items: Note[];
    nextSkip: number;
    hasMore: boolean;
    total: number;
};

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value : [];
}

export default function NotasPage() {
    const cached = readCachedJson<NotesPayload>("notes:::0:30");
    const [notes, setNotes] = useState<Note[]>(() => asArray<Note>(cached?.items));
    const [loading, setLoading] = useState(!cached);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextSkip, setNextSkip] = useState(cached?.nextSkip ?? notes.length);
    const [hasMore, setHasMore] = useState(Boolean(cached?.hasMore));
    const [total, setTotal] = useState(cached?.total ?? notes.length);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Note | null>(null);
    const [form, setForm] = useState({ title: "", content: "", folder: "General" });
    const [saving, setSaving] = useState(false);

    const fetchNotes = useCallback(async ({ append = false, skip = 0 } = {}) => {
        try {
            const params = new URLSearchParams({
                q: debouncedSearch,
                folder: selectedFolder ?? "",
                skip: String(skip),
                take: "30",
            });
            const key = `notes:${debouncedSearch}:${selectedFolder ?? ""}:${skip}:30`;
            const data = await fetchAndCacheJson<NotesPayload>(key, `/api/notes?${params.toString()}`);
            const items = asArray<Note>(data.items);
            setError(null);
            setNotes((current) => append ? [...current, ...items] : items);
            setNextSkip(data.nextSkip ?? skip + items.length);
            setHasMore(Boolean(data.hasMore));
            setTotal(data.total ?? items.length);
        } catch {
            setError("No se pudieron cargar las notas.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [debouncedSearch, selectedFolder]);

    useEffect(() => {
        setLoading(true);
        fetchNotes();
    }, [fetchNotes]);

    async function loadMore() {
        setLoadingMore(true);
        await fetchNotes({ append: true, skip: nextSkip });
    }

    function openCreate() {
        setEditing(null);
        setForm({ title: "", content: "", folder: selectedFolder || "General" });
        setModalOpen(true);
    }

    function openEdit(n: Note) {
        setEditing(n);
        setForm({ title: n.title, content: n.content, folder: n.folder });
        setModalOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await fetch(`/api/notes/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                });
            } else {
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                });
            }
            setModalOpen(false);
            await fetchNotes();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar esta nota?")) return;
        await fetch(`/api/notes/${id}`, { method: "DELETE" });
        setSelectedNoteId(null);
        await fetchNotes();
    }

    const folders = [...new Set([...FOLDERS, ...notes.map(n => n.folder)])];
    const filtered = notes;

    const selectedNote = selectedNoteId ? notes.find(n => n.id === selectedNoteId) : null;

    if (loading) {
        return (
            <div className="flex min-h-screen flex-col lg:h-[calc(100vh-0px)] lg:flex-row">
                <div className="space-y-2 border-b border-white/10 bg-neutral-950 p-4 lg:w-56 lg:border-b-0 lg:border-r">
                    <div className="h-6 w-20 rounded bg-neutral-800 animate-pulse" />
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-6 rounded bg-neutral-800 animate-pulse" />)}
                </div>
                <div className="flex-1 p-8 space-y-4">
                    <div className="h-8 w-48 rounded bg-neutral-800 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col lg:h-[calc(100vh-0px)] lg:flex-row">
            {/* Folder sidebar */}
            <div className="flex shrink-0 flex-col border-b border-white/10 bg-neutral-950 lg:w-56 lg:border-b-0 lg:border-r">
                <div className="px-4 py-4 border-b border-white/10">
                    {error && <p className="mb-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}
                    <button
                        onClick={openCreate}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white transition-colors"
                    >
                        <Plus size={14} strokeWidth={2} />
                        Nueva Nota
                    </button>
                </div>
                <div className="overflow-x-auto px-2 py-2 lg:flex-1 lg:overflow-y-auto">
                    <button
                        onClick={() => setSelectedFolder(null)}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors lg:flex lg:w-full lg:py-1.5 ${selectedFolder === null ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                            }`}
                    >
                        <FolderKanban size={14} strokeWidth={1.5} />
                        Todas
                    </button>
                    <div className="mt-2 flex gap-1 lg:block lg:space-y-0.5">
                        {folders.map((f) => (
                            <button
                                key={f}
                                onClick={() => setSelectedFolder(f)}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors lg:flex lg:w-full lg:py-1.5 ${selectedFolder === f ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="px-4 py-3 border-t border-white/10">
                    <p className="text-[11px] text-neutral-600">{total} notas</p>
                </div>
            </div>

            {/* Notes list */}
            <div className="flex max-h-96 shrink-0 flex-col border-b border-white/10 bg-neutral-950 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
                <div className="px-3 py-3 border-b border-white/10">
                    <div className="relative">
                        <Search size={14} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-md border border-white/10 bg-neutral-900 pl-8 pr-3 py-1.5 text-[13px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filtered.map((n) => (
                        <button
                            key={n.id}
                            onClick={() => setSelectedNoteId(n.id)}
                            className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${selectedNoteId === n.id ? "bg-neutral-800" : "hover:bg-white/[0.02]"
                                }`}
                        >
                            <h3 className="text-[14px] font-medium text-neutral-200 truncate">{n.title}</h3>
                            <p className="text-[12px] text-neutral-500 mt-0.5 truncate">
                                {n.content.slice(0, 80) || "Sin contenido"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] text-neutral-600 bg-neutral-800 rounded px-1.5 py-0.5">{n.folder}</span>
                                <span className="text-[11px] text-neutral-600">
                                    {new Date(n.updatedAt).toLocaleDateString("es-MX")}
                                </span>
                            </div>
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <p className="px-4 py-8 text-center text-[13px] text-neutral-500">
                            {search ? "Sin resultados." : "No hay notas en esta carpeta."}
                        </p>
                    )}
                    {hasMore && (
                        <div className="p-3">
                            <button
                                type="button"
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] font-medium text-neutral-300 hover:bg-white/5 disabled:opacity-60"
                            >
                                {loadingMore ? "Cargando..." : "Cargar mas"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Note viewer */}
            <div className="min-h-[50vh] flex-1 overflow-y-auto bg-neutral-950">
                {selectedNote ? (
                    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
                        <div className="mb-6 flex items-start justify-between gap-3">
                            <div>
                                <h1 className="text-[20px] font-bold text-neutral-100 sm:text-[22px]">{selectedNote.title}</h1>
                                <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
                                    <span className="text-[12px] text-neutral-500">{selectedNote.folder}</span>
                                    <span className="text-[12px] text-neutral-600">
                                        Actualizado: {new Date(selectedNote.updatedAt).toLocaleString("es-MX")}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => openEdit(selectedNote)}
                                    className="p-2 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5 transition-colors"
                                >
                                    <Pencil size={15} strokeWidth={1.5} />
                                </button>
                                <button
                                    onClick={() => handleDelete(selectedNote.id)}
                                    className="p-2 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                                >
                                    <Trash2 size={15} strokeWidth={1.5} />
                                </button>
                            </div>
                        </div>
                        <pre className="text-[15px] text-neutral-300 whitespace-pre-wrap leading-relaxed font-sans">
                            {selectedNote.content || "Sin contenido"}
                        </pre>
                    </div>
                ) : (
                    <div className="flex min-h-[40vh] items-center justify-center px-4 text-center lg:h-full">
                        <p className="text-[14px] text-neutral-500">Selecciona una nota o crea una nueva.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[17px] font-semibold text-neutral-100">
                                {editing ? "Editar Nota" : "Nueva Nota"}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5">
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Título</label>
                                <input
                                    required
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                    placeholder="Título de la nota"
                                />
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Carpeta</label>
                                <input
                                    value={form.folder}
                                    onChange={(e) => setForm({ ...form, folder: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                    placeholder="Ej: General, Reuniones..."
                                    list="folder-suggestions"
                                />
                                <datalist id="folder-suggestions">
                                    {folders.map((f) => (<option key={f} value={f} />))}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Contenido</label>
                                <textarea
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    rows={12}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors resize-none font-sans"
                                    placeholder="Escribe tu nota aquí..."
                                />
                            </div>
                            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-[13px] font-medium text-neutral-300 hover:bg-white/5 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white transition-colors disabled:opacity-50"
                                >
                                    {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
