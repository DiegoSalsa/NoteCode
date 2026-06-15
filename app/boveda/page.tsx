"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Eye, EyeOff, Pencil, Trash2, X, ExternalLink } from "lucide-react";

type Credential = {
    id: string;
    title: string;
    service: string;
    username: string;
    password: string;
    url: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
};

export default function BovedaPage() {
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [revealed, setRevealed] = useState<Set<string>>(new Set());

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Credential | null>(null);
    const [form, setForm] = useState({ title: "", service: "", username: "", password: "", url: "", notes: "" });
    const [saving, setSaving] = useState(false);

    const fetchCredentials = useCallback(async () => {
        const res = await fetch("/api/credentials");
        const data = await res.json();
        setCredentials(data);
    }, []);

    useEffect(() => {
        fetchCredentials().finally(() => setLoading(false));
    }, [fetchCredentials]);

    function openCreate() {
        setEditing(null);
        setForm({ title: "", service: "", username: "", password: "", url: "", notes: "" });
        setModalOpen(true);
    }

    function openEdit(c: Credential) {
        setEditing(c);
        setForm({ title: c.title, service: c.service, username: c.username, password: "", url: c.url || "", notes: c.notes || "" });
        setModalOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                const body: Record<string, string> = { title: form.title, service: form.service, username: form.username, url: form.url, notes: form.notes };
                if (form.password) body.password = form.password;
                await fetch(`/api/credentials/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            } else {
                await fetch("/api/credentials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                });
            }
            setModalOpen(false);
            await fetchCredentials();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar esta credencial?")) return;
        await fetch(`/api/credentials/${id}`, { method: "DELETE" });
        await fetchCredentials();
    }

    function toggleReveal(id: string) {
        setRevealed(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    const filtered = credentials.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.service.toLowerCase().includes(search.toLowerCase()) ||
        c.username.toLowerCase().includes(search.toLowerCase())
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
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[28px] font-bold tracking-tight text-neutral-100">Bóveda</h1>
                        <p className="text-[13px] text-neutral-500 mt-1">{credentials.length} credenciales almacenadas</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white transition-colors"
                    >
                        <Plus size={15} strokeWidth={2} />
                        Nueva Credencial
                    </button>
                </div>
                <div className="relative">
                    <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                        type="text"
                        placeholder="Buscar credenciales..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-neutral-900 pl-10 pr-4 py-2.5 text-[14px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20 transition-colors"
                    />
                </div>
            </section>

            <div className="rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                {filtered.map((cred, i) => (
                    <div
                        key={cred.id}
                        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors group ${i !== filtered.length - 1 ? "border-b border-white/5" : ""
                            }`}
                    >
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-[14px] font-medium text-neutral-200 truncate">{cred.title}</h3>
                                    {cred.url && (
                                        <a href={cred.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-neutral-600 hover:text-neutral-400">
                                            <ExternalLink size={11} strokeWidth={1.5} />
                                        </a>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <p className="text-[12px] text-neutral-500">{cred.service}</p>
                                    <span className="text-neutral-700">/</span>
                                    <p className="text-[12px] text-neutral-500">{cred.username}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-2 bg-neutral-950 border border-white/10 rounded-md px-3 py-1.5">
                                    <span className="text-[13px] font-mono text-neutral-300 select-all">
                                        {revealed.has(cred.id) ? cred.password : "••••••••"}
                                    </span>
                                    <button onClick={() => toggleReveal(cred.id)} className="text-neutral-500 hover:text-neutral-300">
                                        {revealed.has(cred.id) ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEdit(cred)} className="p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5 transition-colors">
                                        <Pencil size={13} strokeWidth={1.5} />
                                    </button>
                                    <button onClick={() => handleDelete(cred.id)} className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5 transition-colors">
                                        <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
                        {search ? "No se encontraron credenciales." : "La bóveda está vacía. Agrega tu primera credencial."}
                    </div>
                )}
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[17px] font-semibold text-neutral-100">
                                {editing ? "Editar Credencial" : "Nueva Credencial"}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5">
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Título</label>
                                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" placeholder="Ej: AWS Producción" />
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Servicio</label>
                                <input required value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" placeholder="Ej: Amazon Web Services" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Usuario</label>
                                    <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Contraseña {editing && "(dejar vacío = no cambiar)"}</label>
                                    <input required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">URL</label>
                                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" placeholder="https://..." />
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Notas</label>
                                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors resize-none" placeholder="Opcional" />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setModalOpen(false)}
                                    className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-[13px] font-medium text-neutral-300 hover:bg-white/5 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={saving}
                                    className="flex-1 rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white transition-colors disabled:opacity-50">
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