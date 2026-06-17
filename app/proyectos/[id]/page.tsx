"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { revealCredential } from "@/app/actions/credentials";
import {
    ArrowLeft,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    Check,
    ExternalLink,
    Pencil,
    X,
    GripVertical,
} from "lucide-react";

type ProjectData = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    agreedAmount: number;
    client: { id: string; name: string };
    createdAt: string;
    updatedAt: string;
};

type StatusLog = {
    id: string;
    status: string;
    note: string | null;
    createdAt: string;
};

type Requirement = {
    id: string;
    description: string;
    category: string;
    priority: string;
    completed: boolean;
    createdAt: string;
};

type Tech = { id: string; name: string; category: string };

type Credential = {
    id: string;
    title: string;
    service: string;
    username: string;
    password: string;
    url: string | null;
    notes: string | null;
};

type ProjectNote = {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
};

type ProjectDetailPayload = {
    project: ProjectData;
    statusLogs: StatusLog[];
    requirements: Requirement[];
    techs: Tech[];
    credentials: Credential[];
    notes: ProjectNote[];
};

const STATUSES = ["Planificado", "En progreso", "Revisión", "Completado"];
const REQ_CATEGORIES = ["Funcional", "Técnico", "UX/UI", "Seguridad"];
const PRIORITIES = ["Alta", "Media", "Baja"];
const TECH_CATEGORIES = ["Frontend", "Backend", "DevOps", "Base de Datos", "Herramientas"];

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value : [];
}

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

function PriorityBadge({ priority }: { priority: string }) {
    let style = "";
    switch (priority) {
        case "Alta": style = "text-red-400"; break;
        case "Media": style = "text-amber-400"; break;
        case "Baja": style = "text-neutral-400"; break;
        default: style = "text-neutral-400";
    }
    return <span className={`text-[11px] font-semibold uppercase ${style}`}>{priority}</span>;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [project, setProject] = useState<ProjectData | null>(null);
    const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [techs, setTechs] = useState<Tech[]>([]);
    const [creds, setCreds] = useState<Credential[]>([]);
    const [notes, setNotes] = useState<ProjectNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [revealed, setRevealed] = useState<Set<string>>(new Set());
    const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});

    // Tab
    const [tab, setTab] = useState("overview");

    // Status modal
    const [statusOpen, setStatusOpen] = useState(false);
    const [newStatus, setNewStatus] = useState("En progreso");
    const [statusNote, setStatusNote] = useState("");

    // Requirement form
    const [reqDesc, setReqDesc] = useState("");
    const [reqCat, setReqCat] = useState("Funcional");
    const [reqPriority, setReqPriority] = useState("Media");

    // Tech form
    const [techName, setTechName] = useState("");
    const [techCat, setTechCat] = useState("Frontend");

    // Credential form
    const [credOpen, setCredOpen] = useState(false);
    const [credForm, setCredForm] = useState({ title: "", service: "", username: "", password: "", url: "", notes: "" });

    // Note form
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteTitle, setNoteTitle] = useState("");
    const [noteContent, setNoteContent] = useState("");

    const fetchAll = useCallback(async () => {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) {
            setProject(null);
            return;
        }

        const data = (await res.json()) as ProjectDetailPayload;
        setProject(data.project);
        setStatusLogs(asArray<StatusLog>(data.statusLogs));
        setRequirements(asArray<Requirement>(data.requirements));
        setTechs(asArray<Tech>(data.techs));
        setCreds(asArray<Credential>(data.credentials));
        setNotes(asArray<ProjectNote>(data.notes));
    }, [id]);

    useEffect(() => {
        fetchAll().finally(() => setLoading(false));
    }, [fetchAll]);

    async function updateStatus() {
        await fetch(`/api/projects/${id}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, note: statusNote || null }),
        });
        setStatusOpen(false);
        setStatusNote("");
        await fetchAll();
    }

    async function addRequirement() {
        if (!reqDesc.trim()) return;
        await fetch(`/api/projects/${id}/requirements`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: reqDesc, category: reqCat, priority: reqPriority }),
        });
        setReqDesc("");
        await fetchAll();
    }

    async function toggleRequirement(reqId: string, completed: boolean) {
        await fetch(`/api/projects/${id}/requirements/${reqId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed }),
        });
        await fetchAll();
    }

    async function deleteRequirement(reqId: string) {
        await fetch(`/api/projects/${id}/requirements/${reqId}`, { method: "DELETE" });
        await fetchAll();
    }

    async function addTech() {
        if (!techName.trim()) return;
        await fetch(`/api/projects/${id}/techs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: techName, category: techCat }),
        });
        setTechName("");
        await fetchAll();
    }

    async function deleteTech(techId: string) {
        await fetch(`/api/projects/${id}/techs/${techId}`, { method: "DELETE" });
        await fetchAll();
    }

    async function addCredential() {
        await fetch(`/api/projects/${id}/credentials`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credForm),
        });
        setCredOpen(false);
        setCredForm({ title: "", service: "", username: "", password: "", url: "", notes: "" });
        await fetchAll();
    }

    async function deleteCredential(credId: string) {
        if (!confirm("¿Eliminar esta credencial?")) return;
        await fetch(`/api/projects/${id}/credentials/${credId}`, { method: "DELETE" });
        await fetchAll();
    }

    async function addNote() {
        if (!noteTitle.trim()) return;
        await fetch(`/api/projects/${id}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: noteTitle, content: noteContent }),
        });
        setNoteOpen(false);
        setNoteTitle("");
        setNoteContent("");
        await fetchAll();
    }

    async function deleteNote(noteId: string) {
        if (!confirm("¿Eliminar esta nota?")) return;
        await fetch(`/api/projects/${id}/notes/${noteId}`, { method: "DELETE" });
        await fetchAll();
    }

    async function toggleReveal(cId: string) {
        if (!revealed.has(cId) && !revealedSecrets[cId]) {
            const secret = await revealCredential(cId);
            setRevealedSecrets(prev => ({ ...prev, [cId]: secret }));
        }

        setRevealed(prev => {
            const next = new Set(prev);
            next.has(cId) ? next.delete(cId) : next.add(cId);
            return next;
        });
    }

    if (loading) {
        return (
            <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                <div className="h-6 w-32 rounded bg-neutral-800 animate-pulse" />
                <div className="h-10 w-full max-w-72 rounded bg-neutral-800 animate-pulse" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                <p className="text-neutral-400">Proyecto no encontrado.</p>
                <Link href="/proyectos" className="text-sky-400 text-sm mt-2 inline-block">← Volver a proyectos</Link>
            </div>
        );
    }

    const tabs = [
        { key: "overview", label: "General", count: null },
        { key: "requirements", label: "Requisitos", count: requirements.length },
        { key: "techs", label: "Tecnologías", count: techs.length },
        { key: "credentials", label: "Credenciales", count: creds.length },
        { key: "notes", label: "Notas", count: notes.length },
    ];

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            {/* Header */}
            <div className="space-y-4">
                <Link href="/proyectos" className="inline-flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-neutral-200 transition-colors">
                    <ArrowLeft size={14} strokeWidth={1.5} />
                    Proyectos
                </Link>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">{project.name}</h1>
                        <p className="text-[14px] text-neutral-500 mt-1">{project.client.name}</p>
                        <p className="text-[13px] text-neutral-500 mt-1">
                            Valor acordado: ${(project.agreedAmount || 0).toLocaleString()}
                        </p>
                        {project.description && (
                            <p className="text-[14px] text-neutral-400 mt-2 max-w-2xl">{project.description}</p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={project.status} />
                        <button
                            onClick={() => { setNewStatus(project.status); setStatusNote(""); setStatusOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-300 hover:bg-white/5 transition-colors"
                        >
                            <Pencil size={12} strokeWidth={1.5} />
                            Actualizar estado
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="-mx-4 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:px-0">
                <div className="flex min-w-max gap-0">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${tab === t.key ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                            }`}
                    >
                        {t.label}
                        {t.count !== null && (
                            <span className="ml-1.5 text-[11px] text-neutral-600">{t.count}</span>
                        )}
                        {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-100" />}
                    </button>
                ))}
                </div>
            </div>

            {/* Tab: Overview */}
            {tab === "overview" && (
                <div className="space-y-4">
                    <h3 className="text-[15px] font-semibold text-neutral-200">Historial de Estados</h3>
                    <div className="space-y-0">
                        {statusLogs.map((log, i) => (
                            <div key={log.id} className={`flex items-start gap-3 px-4 py-3 ${i !== statusLogs.length - 1 ? "border-b border-white/5" : ""}`}>
                                <div className="flex flex-col items-center">
                                    <div className="h-2 w-2 rounded-full bg-neutral-600 mt-2" />
                                    {i !== statusLogs.length - 1 && <div className="w-px flex-1 bg-white/10 my-1" />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={log.status} />
                                        <span className="text-[12px] text-neutral-500">
                                            {new Date(log.createdAt).toLocaleString("es-MX")}
                                        </span>
                                    </div>
                                    {log.note && (
                                        <p className="text-[13px] text-neutral-400 mt-1">{log.note}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {statusLogs.length === 0 && (
                            <p className="text-[13px] text-neutral-500 py-4 text-center">Sin cambios de estado registrados.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Tab: Requirements */}
            {tab === "requirements" && (
                <div className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                        <input
                            value={reqDesc}
                            onChange={e => setReqDesc(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") addRequirement(); }}
                            placeholder="Nuevo requerimiento..."
                            className="flex-1 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[14px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20"
                        />
                        <select value={reqCat} onChange={e => setReqCat(e.target.value)} className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-200">
                            {REQ_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={reqPriority} onChange={e => setReqPriority(e.target.value)} className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-200">
                            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button onClick={addRequirement} className="inline-flex items-center justify-center rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white">
                            <Plus size={14} strokeWidth={2} />
                        </button>
                    </div>
                    <div className="space-y-1">
                        {requirements.map(req => (
                            <div key={req.id} className="group flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-white/[0.02] sm:items-center sm:px-4 sm:py-2.5">
                                <button onClick={() => toggleRequirement(req.id, !req.completed)} className="shrink-0">
                                    <div className={`h-4 w-4 rounded border ${req.completed ? "bg-neutral-100 border-neutral-100 flex items-center justify-center" : "border-white/20"}`}>
                                        {req.completed && <Check size={10} strokeWidth={3} className="text-neutral-950" />}
                                    </div>
                                </button>
                                <span className={`flex-1 text-[14px] ${req.completed ? "text-neutral-500 line-through" : "text-neutral-200"}`}>
                                    {req.description}
                                </span>
                                <span className="text-[11px] text-neutral-600">{req.category}</span>
                                <PriorityBadge priority={req.priority} />
                                <button onClick={() => deleteRequirement(req.id)} className="rounded p-1 text-neutral-700 opacity-100 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100">
                                    <Trash2 size={12} strokeWidth={1.5} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab: Technologies */}
            {tab === "techs" && (
                <div className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <input
                            value={techName}
                            onChange={e => setTechName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") addTech(); }}
                            placeholder="Ej: Next.js, PostgreSQL..."
                            className="flex-1 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[14px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20"
                        />
                        <select value={techCat} onChange={e => setTechCat(e.target.value)} className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-200">
                            {TECH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={addTech} className="inline-flex items-center justify-center rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white">
                            <Plus size={14} strokeWidth={2} />
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TECH_CATEGORIES.map(cat => {
                            const catTechs = techs.filter(t => t.category === cat);
                            if (catTechs.length === 0) return null;
                            return (
                                <div key={cat} className="w-full">
                                    <p className="text-[11px] font-semibold uppercase text-neutral-600 mb-2 mt-3">{cat}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {catTechs.map(t => (
                                            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-neutral-800 px-3 py-1.5 text-[13px] text-neutral-200 group">
                                                {t.name}
                                                <button onClick={() => deleteTech(t.id)} className="text-neutral-600 opacity-100 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100">
                                                    <X size={11} strokeWidth={2} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tab: Credentials */}
            {tab === "credentials" && (
                <div className="space-y-4">
                    <button onClick={() => setCredOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white">
                        <Plus size={14} strokeWidth={2} />
                        Nueva Credencial
                    </button>
                    <div className="space-y-1">
                        {creds.map(c => (
                            <div key={c.id} className="group flex flex-col gap-3 rounded-lg border border-white/5 bg-neutral-900 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[14px] font-medium text-neutral-200">{c.title}</h4>
                                        {c.url && <a href={c.url} target="_blank" className="text-neutral-600 hover:text-neutral-400"><ExternalLink size={11} /></a>}
                                    </div>
                                    <p className="text-[12px] text-neutral-500">{c.service} / {c.username}</p>
                                </div>
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                    <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 sm:py-1.5">
                                        <span className="min-w-0 flex-1 truncate text-[13px] font-mono text-neutral-300 select-all sm:flex-none">
                                            {revealed.has(c.id) ? revealedSecrets[c.id] : "************"}
                                        </span>
                                        <button onClick={() => toggleReveal(c.id)} className="text-neutral-500 hover:text-neutral-300">
                                            {revealed.has(c.id) ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                                        </button>
                                    </div>
                                    <button onClick={() => deleteCredential(c.id)} className="rounded p-1.5 text-neutral-600 opacity-100 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100">
                                        <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {creds.length === 0 && <p className="text-[13px] text-neutral-500 py-4 text-center">Sin credenciales para este proyecto.</p>}
                    </div>

                    {credOpen && (
                        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
                            <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 sm:p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-[17px] font-semibold text-neutral-100">Nueva Credencial</h2>
                                    <button onClick={() => setCredOpen(false)} className="p-1"><X size={16} /></button>
                                </div>
                                <form onSubmit={e => { e.preventDefault(); addCredential(); }} className="space-y-4">
                                    <input required placeholder="Título" value={credForm.title} onChange={e => setCredForm({ ...credForm, title: e.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <input required placeholder="Servicio" value={credForm.service} onChange={e => setCredForm({ ...credForm, service: e.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <input required placeholder="Usuario" value={credForm.username} onChange={e => setCredForm({ ...credForm, username: e.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <input required placeholder="Contraseña" value={credForm.password} onChange={e => setCredForm({ ...credForm, password: e.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <input placeholder="URL" value={credForm.url} onChange={e => setCredForm({ ...credForm, url: e.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <input placeholder="Notas" value={credForm.notes} onChange={e => setCredForm({ ...credForm, notes: e.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <button type="submit" className="w-full rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white">Crear</button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Notes */}
            {tab === "notes" && (
                <div className="space-y-4">
                    <button onClick={() => setNoteOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white">
                        <Plus size={14} strokeWidth={2} />
                        Nueva Nota
                    </button>
                    <div className="space-y-3">
                        {notes.map(n => (
                            <div key={n.id} className="rounded-lg border border-white/5 bg-neutral-900 p-5 group hover:border-white/10 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <h4 className="text-[15px] font-semibold text-neutral-100">{n.title}</h4>
                                        <pre className="text-[13px] text-neutral-400 whitespace-pre-wrap mt-2 font-sans">{n.content || "Sin contenido"}</pre>
                                        <p className="text-[11px] text-neutral-600 mt-3">
                                            Actualizado: {new Date(n.updatedAt).toLocaleString("es-MX")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                        <button onClick={() => { setNoteTitle(n.title); setNoteContent(n.content); setNoteOpen(true); }} className="p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5">
                                            <Pencil size={13} strokeWidth={1.5} />
                                        </button>
                                        <button onClick={() => deleteNote(n.id)} className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5">
                                            <Trash2 size={13} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {notes.length === 0 && <p className="text-[13px] text-neutral-500 py-4 text-center">Sin notas en este proyecto.</p>}
                    </div>

                    {noteOpen && (
                        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
                            <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 sm:p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-[17px] font-semibold text-neutral-100">Nueva Nota</h2>
                                    <button onClick={() => setNoteOpen(false)} className="p-1"><X size={16} /></button>
                                </div>
                                <form onSubmit={e => { e.preventDefault(); addNote(); }} className="space-y-4">
                                    <input required placeholder="Título de la nota" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100" />
                                    <textarea rows={6} placeholder="Contenido..." value={noteContent} onChange={e => setNoteContent(e.target.value)} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 resize-none" />
                                    <button type="submit" className="w-full rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white">Crear Nota</button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Status Update Modal */}
            {statusOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 sm:p-6">
                        <h2 className="text-[17px] font-semibold text-neutral-100 mb-4">Actualizar Estado</h2>
                        <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 mb-4">
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <textarea rows={2} placeholder="Nota opcional..." value={statusNote} onChange={e => setStatusNote(e.target.value)} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 mb-4 resize-none" />
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button onClick={() => setStatusOpen(false)} className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-[13px] text-neutral-300">Cancelar</button>
                            <button onClick={updateStatus} className="flex-1 rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950">Actualizar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
