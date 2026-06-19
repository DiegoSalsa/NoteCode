"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Plus,
    Search,
    GripVertical,
    Clock,
    Pencil,
    Trash2,
    X,
    ArrowUpRight,
} from "lucide-react";
import ProjectPrefetchLink from "@/components/ProjectPrefetchLink";
import { fetchAndCacheJson, readCachedJson } from "@/lib/client-cache";
import { useDebounce } from "@/lib/use-debounce";

type Client = { id: string; name: string };

type Project = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    agreedAmount: number;
    clientId: string;
    createdAt: string;
    updatedAt: string;
    client: Client;
};

type ProjectsPayload = {
    projects: Project[];
    clients: Client[];
    nextSkip: number;
    hasMore: boolean;
    total: number;
};

const STATUSES = ["Planificado", "En progreso", "Revisión", "Completado"];

function StatusBadge({ status }: { status: string }) {
    let style = "";
    switch (status) {
        case "En progreso": style = "bg-sky-500/10 text-sky-400 border-sky-500/20"; break;
        case "Revisión": style = "bg-amber-500/10 text-amber-400 border-amber-500/20"; break;
        case "Completado": style = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"; break;
        case "Planificado": style = "bg-violet-500/10 text-violet-400 border-violet-500/20"; break;
        default: style = "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";
    }
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${style}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
            {status}
        </span>
    );
}

export default function ProyectosPage() {
    const cached = readCachedJson<Partial<ProjectsPayload>>("projects:init::0:25");
    const [projects, setProjects] = useState<Project[]>(() => Array.isArray(cached?.projects) ? cached.projects : []);
    const [clients, setClients] = useState<Client[]>(() => Array.isArray(cached?.clients) ? cached.clients : []);
    const [loading, setLoading] = useState(!cached);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextSkip, setNextSkip] = useState(cached?.nextSkip ?? projects.length);
    const [hasMore, setHasMore] = useState(Boolean(cached?.hasMore));
    const [total, setTotal] = useState(cached?.total ?? projects.length);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Project | null>(null);
    const [form, setForm] = useState({ name: "", description: "", status: "En progreso", clientId: "", clientName: "", agreedAmount: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const fetchData = useCallback(async ({ append = false, skip = 0 } = {}) => {
        const params = new URLSearchParams({ q: debouncedSearch, skip: String(skip), take: "25" });
        const key = `projects:init:${debouncedSearch}:${skip}:25`;
        const data = await fetchAndCacheJson<Partial<ProjectsPayload>>(key, `/api/projects/init?${params.toString()}`);
        const items = Array.isArray(data.projects) ? data.projects : [];
        setError("");
        setProjects((current) => append ? [...current, ...items] : items);
        setClients(Array.isArray(data.clients) ? data.clients : []);
        setNextSkip(data.nextSkip ?? skip + items.length);
        setHasMore(Boolean(data.hasMore));
        setTotal(data.total ?? items.length);
        setLoading(false);
        setLoadingMore(false);
    }, [debouncedSearch]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);

    async function loadMore() {
        setLoadingMore(true);
        await fetchData({ append: true, skip: nextSkip });
    }

    function openCreate() {
        setEditing(null);
        setForm({ name: "", description: "", status: "En progreso", clientId: "", clientName: "", agreedAmount: "" });
        setModalOpen(true);
    }

    function openEdit(p: Project) {
        setEditing(p);
        setForm({ name: p.name, description: p.description || "", status: p.status, clientId: p.clientId, clientName: p.client.name, agreedAmount: String(p.agreedAmount || "") });
        setModalOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await fetch(`/api/projects/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...form, agreedAmount: Number(form.agreedAmount) || 0 }),
                });
            } else {
                await fetch("/api/projects", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...form, agreedAmount: Number(form.agreedAmount) || 0 }),
                });
            }
            setModalOpen(false);
            await fetchData();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar este proyecto?")) return;
        setError("");
        const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
        if (!response.ok) {
            const data = await response.json().catch(() => null);
            setError(data?.error || "No se pudo eliminar el proyecto.");
            return;
        }
        await fetchData();
    }

    const filtered = projects;
    const clientSuggestions = form.clientName.trim()
        ? clients.filter((client) => client.name.toLowerCase().includes(form.clientName.toLowerCase())).slice(0, 5)
        : [];

    if (loading) {
        return (
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                <div className="h-8 w-48 rounded bg-neutral-800 animate-pulse mb-6" />
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-neutral-900 animate-pulse border border-white/10" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            {/* Header */}
            <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">Proyectos</h1>
                        <p className="text-[13px] text-neutral-500 mt-1">{total} proyectos</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white sm:w-auto"
                    >
                        <Plus size={15} strokeWidth={2} />
                        Nuevo Proyecto
                    </button>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
                        {error}
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                        type="text"
                        placeholder="Buscar proyectos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 pl-10 pr-4 py-2.5 text-[14px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20 transition-colors"
                    />
                </div>
            </section>

            {/* Project List */}
            <div className="rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                {filtered.map((project, i) => (
                    <div
                        key={project.id}
                        className={`group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:items-center sm:gap-4 sm:px-5 sm:py-3.5 ${i !== filtered.length - 1 ? "border-b border-white/5" : ""
                            }`}
                    >
                        <GripVertical size={14} strokeWidth={1.5} className="shrink-0 text-neutral-700" />
                        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="min-w-0">
                                <ProjectPrefetchLink
                                    projectId={project.id}
                                    className="text-[14px] font-medium text-neutral-200 truncate hover:text-neutral-100 hover:underline transition-colors"
                                >
                                    {project.name}
                                </ProjectPrefetchLink>
                                <p className="text-[12px] text-neutral-500 mt-0.5">{project.client.name}</p>
                                <p className="text-[12px] text-neutral-600 mt-0.5">
                                    Valor acordado: ${(project.agreedAmount || 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                                <StatusBadge status={project.status} />
                                <span className="flex items-center gap-1.5 text-[12px] text-neutral-500 sm:w-24 sm:justify-end">
                                    <Clock size={11} strokeWidth={1.5} />
                                    {new Date(project.updatedAt).toLocaleDateString("es-MX")}
                                </span>
                                <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                    <button
                                        onClick={() => openEdit(project)}
                                        className="p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5 transition-colors"
                                    >
                                        <Pencil size={13} strokeWidth={1.5} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(project.id)}
                                        className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                                    >
                                        <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
                        {search ? "No se encontraron proyectos con ese criterio." : "No hay proyectos. Crea el primero."}
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

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[17px] font-semibold text-neutral-100">
                                {editing ? "Editar Proyecto" : "Nuevo Proyecto"}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5">
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Nombre</label>
                                <input
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                    placeholder="Nombre del proyecto"
                                />
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Descripción</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    rows={2}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors resize-none"
                                    placeholder="Opcional"
                                />
                            </div>
                            <div className="relative">
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Cliente</label>
                                <input
                                    required
                                    value={form.clientName}
                                    onChange={(e) => setForm({ ...form, clientName: e.target.value, clientId: "" })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                    placeholder="Escribe el cliente"
                                />
                                {clientSuggestions.length > 0 && !form.clientId && (
                                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-white/10 bg-neutral-950 shadow-xl">
                                        {clientSuggestions.map((client) => (
                                            <button
                                                key={client.id}
                                                type="button"
                                                onClick={() => setForm({ ...form, clientId: client.id, clientName: client.name })}
                                                className="block w-full px-3 py-2 text-left text-[13px] text-neutral-300 hover:bg-white/5 hover:text-neutral-100"
                                            >
                                                Usar cliente existente: {client.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Valor acordado ($)</label>
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.agreedAmount}
                                    onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                    placeholder="Ej: 1500000"
                                />
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Estado</label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                >
                                    {STATUSES.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
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
