import Link from "next/link";
import { redirect } from "next/navigation";
import {
    FolderKanban,
    ShieldCheck,
    Coins,
    ArrowRight,
    Clock,
    GripVertical,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ProjectWithClient = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    clientId: string;
    createdAt: Date;
    updatedAt: Date;
    client: { id: string; name: string };
};

type SummaryData = {
    projects: number;
    credentials: number;
    pendingInvoices: number;
    pendingAmount: number;
};

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

function formatRelativeTime(value: Date) {
    const date = new Date(value);
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

export default async function DashboardPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/");

    const [profile, projects, projectCount, credentialCount, pendingInvoiceCount, pendingInvoiceTotal] =
        await Promise.all([
            prisma.userProfile.findUnique({
                where: { userId: user.id },
                select: {
                    displayName: true,
                    age: true,
                },
            }).then((profile) =>
                profile ??
                prisma.userProfile.create({
                    data: {
                        userId: user.id,
                        email: user.email,
                        displayName: user.name,
                    },
                    select: {
                        displayName: true,
                        age: true,
                    },
                }),
            ),
            prisma.project.findMany({
                orderBy: { updatedAt: "desc" },
                take: 5,
                include: { client: { select: { id: true, name: true } } },
            }),
            prisma.project.count(),
            prisma.credential.count(),
            prisma.invoice.count({ where: { status: "Pendiente" } }),
            prisma.invoice.aggregate({
                where: { status: "Pendiente" },
                _sum: { amount: true },
            }),
        ]);

    const summary: SummaryData = {
        projects: projectCount,
        credentials: credentialCount,
        pendingInvoices: pendingInvoiceCount,
        pendingAmount: pendingInvoiceTotal._sum.amount ?? 0,
    };

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
        <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 lg:space-y-14">
            {/* Header */}
            <section className="space-y-2">
                <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">
                    Bienvenido, {profile.displayName || "PuroCoder"}
                </h1>
                <p className="text-[15px] text-neutral-400 leading-relaxed max-w-2xl">
                    {profile.age
                        ? `${profile.age} anos. Tu centro de control personalizado para proyectos, notas y credenciales.`
                        : "Tu centro de control personalizado para proyectos, notas y credenciales."}
                </p>
            </section>

            {/* Summary Cards */}
            <section>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                        <h2 className="text-[17px] font-semibold text-neutral-100">
                            Proyectos Recientes
                        </h2>
                        <p className="text-[13px] text-neutral-500">
                            Última actividad en los proyectos de la agencia.
                        </p>
                    </div>
                    <Link
                        href="/proyectos"
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-colors"
                    >
                        <span>Ver todos</span>
                        <ArrowRight size={14} strokeWidth={1.5} />
                    </Link>
                </div>

                <div className="rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                    {projects.map((project, index) => (
                        <div
                            key={project.id}
                            className={`flex items-start gap-3 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:items-center sm:gap-4 sm:px-5 sm:py-3.5 ${index !== projects.length - 1 ? "border-b border-white/5" : ""
                                }`}
                        >
                            <GripVertical
                                size={14}
                                strokeWidth={1.5}
                                className="shrink-0 text-neutral-700"
                            />

                            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                <div className="min-w-0">
                                    <Link href={`/proyectos/${project.id}`} className="text-[14px] font-medium text-neutral-200 truncate hover:text-neutral-100 hover:underline transition-colors">
                                        {project.name}
                                    </Link>
                                    <p className="text-[12px] text-neutral-500 mt-0.5">
                                        {project.client.name}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                                    <StatusBadge status={project.status} />
                                    <span className="flex items-center gap-1.5 text-[12px] text-neutral-500 sm:w-28 sm:justify-end">
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
