"use client";

import { useEffect, useState } from "react";
import {
    FolderKanban,
    ShieldCheck,
    Coins,
    ArrowRight,
    Clock,
    GripVertical,
} from "lucide-react";

type ProjectWithClient = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    clientId: string;
    createdAt: string;
    updatedAt: string;
    client: { id: string; name: string };
};

type SummaryData = {
    projects: number;
    credentials: number;
    pendingInvoices: number;
    pendingAmount: number;
};

type Me = {
    displayName: string;
    nationality: string | null;
    age: number | null;
};

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value : [];
}

function StatusBadge({ status }: { status: string }) {
    let style = "";

    switch (status) {
        case "En progreso":
            style = "bg-sky-500/10 text-sky-400 border-sky-500/20";
            break;
        case "Revisión":
            style = "bg-amber-500/10 text-amber-400 border-amber-500/20";
            break;
        case "Completado":
            style = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
            break;
        case "Planificado":
            style = "bg-violet-500/10 text-violet-400 border-violet-500/20";
            break;
        default:
            style = "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";
    }

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${style}`}
        >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
            {status}
        </span>
    );
}

function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Ahora";
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} horas`;
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return `Hace ${Math.floor(diffDays / 30)} meses`;
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<ProjectWithClient[]>([]);
    const [summary, setSummary] = useState<SummaryData>({
        projects: 0,
        credentials: 0,
        pendingInvoices: 0,
        pendingAmount: 0,
    });
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [projRes, credRes, invRes, meRes] = await Promise.all([
                    fetch("/api/projects?limit=5"),
                    fetch("/api/credentials"),
                    fetch("/api/invoices"),
                    fetch("/api/me"),
                ]);

                const projData = asArray<ProjectWithClient>(await projRes.json());
                const credData = asArray<unknown>(await credRes.json());
                const invData = asArray<{ status: string; amount: number }>(await invRes.json());
                const meData = meRes.ok ? await meRes.json() : null;

                const pending = invData.filter((i) => i.status === "Pendiente");

                setProjects(projData);
                setMe(meData);
                setSummary({
                    projects: projData.length,
                    credentials: credData.length,
                    pendingInvoices: pending.length,
                    pendingAmount: pending.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0),
                });
            } catch (err) {
                console.error("Failed to fetch dashboard data", err);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="mx-auto max-w-5xl px-8 py-10 space-y-14">
                <div className="space-y-2">
                    <div className="h-8 w-72 rounded bg-neutral-800 animate-pulse" />
                    <div className="h-5 w-96 rounded bg-neutral-800 animate-pulse" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-24 rounded-lg bg-neutral-900 animate-pulse border border-white/10" />
                    ))}
                </div>
            </div>
        );
    }

    const summaryItems = [
        {
            label: "Proyectos Activos",
            value: String(summary.projects),
            subtitle: "En la agencia",
            icon: FolderKanban,
        },
        {
            label: "Credenciales",
            value: String(summary.credentials),
            subtitle: "En bóveda segura",
            icon: ShieldCheck,
        },
        {
            label: "Facturas Pendientes",
            value: String(summary.pendingInvoices),
            subtitle: `$${summary.pendingAmount.toLocaleString()} total`,
            icon: Coins,
        },
    ];

    return (
        <div className="mx-auto max-w-5xl px-8 py-10 space-y-14">
            {/* Header */}
            <section className="space-y-2">
                <h1 className="text-[28px] font-bold tracking-tight text-neutral-100">
                    Bienvenido, {me?.displayName || "PuroCoder"}
                </h1>
                <p className="text-[15px] text-neutral-400 leading-relaxed max-w-2xl">
                    {me?.nationality || me?.age
                        ? `${me.nationality || "Perfil interno"}${me.age ? ` / ${me.age} anos` : ""}. Tu centro de control personalizado para proyectos, notas y credenciales.`
                        : "Tu centro de control personalizado para proyectos, notas y credenciales."}
                </p>
            </section>

            {/* Summary Cards */}
            <section>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {summaryItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div
                                key={item.label}
                                className="flex items-center gap-4 rounded-lg border border-white/10 bg-neutral-900 px-5 py-4 hover:bg-neutral-900/80 transition-colors"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-neutral-950">
                                    <Icon size={18} strokeWidth={1.5} className="text-neutral-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-100">
                                        {item.value}
                                    </p>
                                    <p className="text-[13px] font-medium text-neutral-100">
                                        {item.label}
                                    </p>
                                    <p className="text-[12px] text-neutral-500 mt-0.5">
                                        {item.subtitle}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Recent Projects */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h2 className="text-[17px] font-semibold text-neutral-100">
                            Proyectos Recientes
                        </h2>
                        <p className="text-[13px] text-neutral-500">
                            Última actividad en los proyectos de la agencia.
                        </p>
                    </div>
                    <a
                        href="/proyectos"
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-colors"
                    >
                        <span>Ver todos</span>
                        <ArrowRight size={14} strokeWidth={1.5} />
                    </a>
                </div>

                <div className="rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                    {projects.map((project, index) => (
                        <div
                            key={project.id}
                            className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors ${index !== projects.length - 1 ? "border-b border-white/5" : ""
                                }`}
                        >
                            <GripVertical
                                size={14}
                                strokeWidth={1.5}
                                className="shrink-0 text-neutral-700"
                            />

                            <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <a href={`/proyectos/${project.id}`} className="text-[14px] font-medium text-neutral-200 truncate hover:text-neutral-100 hover:underline transition-colors">
                                        {project.name}
                                    </a>
                                    <p className="text-[12px] text-neutral-500 mt-0.5">
                                        {project.client.name}
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 shrink-0">
                                    <StatusBadge status={project.status} />
                                    <span className="flex items-center gap-1.5 text-[12px] text-neutral-500 w-28 justify-end">
                                        <Clock size={11} strokeWidth={1.5} />
                                        {formatRelativeTime(project.updatedAt)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {projects.length === 0 && (
                        <div className="px-5 py-10 text-center text-[13px] text-neutral-500">
                            No hay proyectos aún. Crea tu primer proyecto en la sección Proyectos.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
