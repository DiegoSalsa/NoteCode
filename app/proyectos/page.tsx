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

type Client = { id: string; name: string };

type Project = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    clientId: string;
    createdAt: string;
    updatedAt: string;
    client: Client;
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
    const [projects, setProjects] = useState<Project[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Project | null>(null);
    const [form, setForm] = useState({ name: "", description: "", status: "En progreso", clientId: "" });
    const [saving, setSaving] = useState(false);

    const fetchProjects = useCallback(async () => {
        const res = await fetch("/api/projects");
        const data = await res.json();
        setProjects(data);
    }, []);

    const fetchClients = useCallback(async () => {
        const res = await fetch("/api/clients");
        const data = await res.json();
        setClients(data);
    }, []);

    useEffect(() => {
        Promise.all([fetchProjects(), fetchClients()]).finally(() => setLoading(false));
    }, [fetchProjects, fetchClients]);

    function openCreate() {
        setEditing(null);
        setForm({ name: "", description: "", status: "En progreso", clientId: clients[0]?.id || "" });
        setModalOpen(true);
    }

    function openEdit(p: Project) {
        setEditing(p);
        setForm({ name: p.name, description: p.description || "", status: p.status, clientId: p.clientId });
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
                    body: JSON.stringify(form),
                });
            } else {
                await fetch("/api/projects", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                });
            }
            setModalOpen(false);
            await fetchProjects();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar este proyecto?")) return;
        await fetch(`/api/projects/${id}`, { method: "DELETE" });
        await fetchProjects();
    }

    const filtered = projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.client.name.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) {
        return (
            <div className="mx-auto max-w-5xl px-8 py-10">
                <div className="h-8 w-48 rounded bg-neutral-800 animate-pulse mb-6" />
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-neutral-900 animate-pulse border border-white/10" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl px-8 py-10 space-y-8">
            {/* Header */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[28px] font-bold tracking-tight text-neutral-100">Proyectos</h1>
                        <p className="text-[13px] text-neutral-500 mt-1">{projects.length} proyectos activos</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white transition-colors"
                    >
                        <Plus size={15} strokeWidth={2} />
                        Nuevo Proyecto
                    </button>
                </div>

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
                        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors group ${i !== filtered.length - 1 ? "border-b border-white/5" : ""
                            }`}
                    >
                        <GripVertical size={14} strokeWidth={1.5} className="shrink-0 text-neutral-700" />
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <a href={`/proyectos/${project.id}`} className="text-[14px] font-medium text-neutral-200 truncate hover:text-neutral-100 hover:underline transition-colors">
                                    {project.name}
                                </a>
                                <p className="text-[12px] text-neutral-500 mt-0.5">{project.client.name}</p>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <StatusBadge status={project.status} />
                                <span className="flex items-center gap-1.5 text-[12px] text-neutral-500 w-24 justify-end">
                                    <Clock size={11} strokeWidth={1.5} />
                                    {new Date(project.updatedAt).toLocaleDateString("es-MX")}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
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
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Cliente</label>
                                <select
                                    required
                                    value={form.clientId}
                                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors"
                                >
                                    <option value="">Seleccionar cliente</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
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
                            <div className="flex gap-3 pt-2">
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