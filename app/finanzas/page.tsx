"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, X, ArrowUpRight, ArrowDownRight, DollarSign } from "lucide-react";
import { fetchAndCacheJson, readCachedJson } from "@/lib/client-cache";
import { useDebounce } from "@/lib/use-debounce";

type Invoice = {
    id: string;
    projectId: string | null;
    number: string;
    client: string;
    amount: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
    createdAt: string;
    updatedAt: string;
};

const STATUSES = ["Pendiente", "Pagado", "Vencido", "Cancelado"];

type InvoicesPayload = {
    items: Invoice[];
    nextSkip: number;
    hasMore: boolean;
    total: number;
    summary: {
        totalAmount: number;
        netAmount?: number;
        vatAmount?: number;
        pendingAmount: number;
        paidAmount: number;
        overdueAmount?: number;
        canceledAmount?: number;
        collectibleAmount?: number;
        collectionRate?: number;
        overdueCount?: number;
        byStatus?: { status: string; amount: number; count: number }[];
        upcomingDue?: Pick<Invoice, "id" | "number" | "client" | "amount" | "dueDate">[];
    };
};

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value : [];
}

function StatusBadge({ status }: { status: string }) {
    let style = "";
    switch (status) {
        case "Pagado": style = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"; break;
        case "Pendiente": style = "bg-amber-500/10 text-amber-400 border-amber-500/20"; break;
        case "Vencido": style = "bg-red-500/10 text-red-400 border-red-500/20"; break;
        case "Cancelado": style = "bg-neutral-500/10 text-neutral-400 border-neutral-500/20"; break;
        default: style = "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";
    }
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${style}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
            {status}
        </span>
    );
}

export default function FinanzasPage() {
    const cached = readCachedJson<InvoicesPayload>("invoices::0:30");
    const [invoices, setInvoices] = useState<Invoice[]>(() => asArray<Invoice>(cached?.items));
    const [loading, setLoading] = useState(!cached);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextSkip, setNextSkip] = useState(cached?.nextSkip ?? invoices.length);
    const [hasMore, setHasMore] = useState(Boolean(cached?.hasMore));
    const [total, setTotal] = useState(cached?.total ?? invoices.length);
    const [summary, setSummary] = useState(cached?.summary ?? { totalAmount: 0, pendingAmount: 0, paidAmount: 0 });
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const debouncedSearch = useDebounce(search);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Invoice | null>(null);
    const [form, setForm] = useState({ number: "", client: "", amount: "", status: "Pendiente", dueDate: "" });
    const [saving, setSaving] = useState(false);

    const fetchInvoices = useCallback(async ({ append = false, skip = 0 } = {}) => {
        try {
            const params = new URLSearchParams({ q: debouncedSearch, status: statusFilter, skip: String(skip), take: "30" });
            const key = `invoices:${debouncedSearch}:${statusFilter}:${skip}:30`;
            const data = await fetchAndCacheJson<InvoicesPayload>(key, `/api/invoices?${params.toString()}`);
            const items = asArray<Invoice>(data.items);
            setError(null);
            setInvoices((current) => append ? [...current, ...items] : items);
            setNextSkip(data.nextSkip ?? skip + items.length);
            setHasMore(Boolean(data.hasMore));
            setTotal(data.total ?? items.length);
            setSummary(data.summary ?? { totalAmount: 0, pendingAmount: 0, paidAmount: 0 });
        } catch {
            setError("No se pudieron cargar las finanzas.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [debouncedSearch, statusFilter]);

    useEffect(() => {
        setLoading(true);
        fetchInvoices();
    }, [fetchInvoices]);

    async function loadMore() {
        setLoadingMore(true);
        await fetchInvoices({ append: true, skip: nextSkip });
    }

    function openCreate() {
        setEditing(null);
        setForm({ number: "", client: "", amount: "", status: "Pendiente", dueDate: "" });
        setModalOpen(true);
    }

    function openEdit(inv: Invoice) {
        setEditing(inv);
        setForm({
            number: inv.number,
            client: inv.client,
            amount: String(inv.amount),
            status: inv.status,
            dueDate: new Date(inv.dueDate).toISOString().split("T")[0],
        });
        setModalOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await fetch(`/api/invoices/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...form,
                        amount: parseFloat(form.amount),
                        paidAt: form.status === "Pagado" ? new Date().toISOString() : null,
                    }),
                });
            } else {
                await fetch("/api/invoices", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
                });
            }
            setModalOpen(false);
            await fetchInvoices();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar esta factura?")) return;
        await fetch(`/api/invoices/${id}`, { method: "DELETE" });
        await fetchInvoices();
    }

    const filtered = invoices;
    const totalAmount = summary.totalAmount;
    const netAmount = summary.netAmount ?? totalAmount / 1.19;
    const vatAmount = summary.vatAmount ?? totalAmount - netAmount;
    const pendingAmount = summary.pendingAmount;
    const paidAmount = summary.paidAmount;
    const overdueAmount = summary.overdueAmount ?? 0;
    const collectionRate = summary.collectionRate ?? 0;

    if (loading) {
        return (
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                <div className="h-8 w-48 rounded bg-neutral-800 animate-pulse mb-6" />
                <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-neutral-900 animate-pulse border border-white/10" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            <section className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">Finanzas</h1>
                        <p className="text-[13px] text-neutral-500 mt-1">{total} facturas registradas</p>
                        {error && <p className="mt-2 text-[13px] text-red-300">{error}</p>}
                    </div>
                    <button
                        onClick={openCreate}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white sm:w-auto"
                    >
                        <Plus size={15} strokeWidth={2} />
                        Nueva Factura
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border border-white/10 bg-neutral-900 px-5 py-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800">
                                <DollarSign size={14} strokeWidth={1.5} className="text-neutral-400" />
                            </div>
                            <span className="text-[12px] font-medium text-neutral-400">Total Facturado</span>
                        </div>
                        <p className="text-2xl font-semibold tabular-nums text-neutral-100">${totalAmount.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-neutral-900 px-5 py-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800">
                                <DollarSign size={14} strokeWidth={1.5} className="text-neutral-400" />
                            </div>
                            <span className="text-[12px] font-medium text-neutral-400">Neto sin IVA</span>
                        </div>
                        <p className="text-2xl font-semibold tabular-nums text-neutral-100">${Math.round(netAmount).toLocaleString()}</p>
                        <p className="mt-1 text-[11px] text-neutral-600">IVA 19%: ${Math.round(vatAmount).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-neutral-900 px-5 py-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                                <ArrowDownRight size={14} strokeWidth={1.5} className="text-amber-400" />
                            </div>
                            <span className="text-[12px] font-medium text-neutral-400">Pendiente</span>
                        </div>
                        <p className="text-2xl font-semibold tabular-nums text-neutral-100">${pendingAmount.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-neutral-900 px-5 py-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                                <ArrowUpRight size={14} strokeWidth={1.5} className="text-emerald-400" />
                            </div>
                            <span className="text-[12px] font-medium text-neutral-400">Cobrado</span>
                        </div>
                        <p className="text-2xl font-semibold tabular-nums text-neutral-100">${paidAmount.toLocaleString()}</p>
                        <p className="mt-1 text-[11px] text-neutral-600">{Math.round(collectionRate * 100)}% recuperado</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-neutral-900 px-5 py-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                                <ArrowDownRight size={14} strokeWidth={1.5} className="text-red-400" />
                            </div>
                            <span className="text-[12px] font-medium text-neutral-400">Vencido</span>
                        </div>
                        <p className="text-2xl font-semibold tabular-nums text-neutral-100">${overdueAmount.toLocaleString()}</p>
                        <p className="mt-1 text-[11px] text-neutral-600">{summary.overdueCount ?? 0} facturas</p>
                    </div>
                </div>

                {/* Search */}
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="relative">
                        <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                            type="text"
                            placeholder="Buscar facturas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-neutral-900 pl-10 pr-4 py-2.5 text-[14px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20 transition-colors"
                        />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-[14px] text-neutral-100 outline-none focus:border-white/20">
                        <option value="">Todos los estados</option>
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                    <section className="rounded-lg border border-white/10 bg-neutral-900 p-4">
                        <h2 className="mb-3 text-[14px] font-semibold text-neutral-100">Distribucion por estado</h2>
                        <div className="space-y-2">
                            {(summary.byStatus ?? []).map((item) => (
                                <div key={item.status} className="flex items-center justify-between gap-3 text-[13px]">
                                    <StatusBadge status={item.status} />
                                    <span className="text-neutral-500">{item.count} / ${item.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="rounded-lg border border-white/10 bg-neutral-900 p-4">
                        <h2 className="mb-3 text-[14px] font-semibold text-neutral-100">Proximos vencimientos</h2>
                        <div className="space-y-2">
                            {(summary.upcomingDue ?? []).map((invoice) => (
                                <div key={invoice.id} className="flex items-center justify-between gap-3 text-[13px]">
                                    <div className="min-w-0">
                                        <p className="truncate text-neutral-200">{invoice.number} / {invoice.client}</p>
                                        <p className="text-[11px] text-neutral-600">{new Date(invoice.dueDate).toLocaleDateString("es-CL")}</p>
                                    </div>
                                    <span className="shrink-0 tabular-nums text-neutral-400">${invoice.amount.toLocaleString()}</span>
                                </div>
                            ))}
                            {(summary.upcomingDue ?? []).length === 0 && <p className="text-[13px] text-neutral-600">Sin vencimientos proximos.</p>}
                        </div>
                    </section>
                </div>
            </section>

            <div className="rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                {filtered.map((inv, i) => (
                    <div
                        key={inv.id}
                        className={`group flex items-start gap-4 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:items-center sm:px-5 sm:py-3.5 ${i !== filtered.length - 1 ? "border-b border-white/5" : ""
                            }`}
                    >
                        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                                <div>
                                    <h3 className="text-[14px] font-medium text-neutral-200">{inv.number}</h3>
                                    <p className="text-[12px] text-neutral-500 mt-0.5">{inv.client}</p>
                                </div>
                                <span className="text-[12px] text-neutral-600">
                                    Vence: {new Date(inv.dueDate).toLocaleDateString("es-MX")}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                                <span className="text-[14px] font-semibold tabular-nums text-neutral-200">
                                    ${inv.amount.toLocaleString()}
                                </span>
                                <span className="text-[12px] text-neutral-600">
                                    Neto: ${Math.round(inv.amount / 1.19).toLocaleString()}
                                </span>
                                <StatusBadge status={inv.status} />
                                <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                    <button onClick={() => openEdit(inv)} className="p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5 transition-colors">
                                        <Pencil size={13} strokeWidth={1.5} />
                                    </button>
                                    <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5 transition-colors">
                                        <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
                        {search ? "No se encontraron facturas." : "No hay facturas. Registra la primera."}
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
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[17px] font-semibold text-neutral-100">
                                {editing ? "Editar Factura" : "Nueva Factura"}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-white/5">
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Número de Factura</label>
                                <input required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" placeholder="INV-2024-001" />
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Cliente</label>
                                <input required value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" placeholder="Nombre del cliente" />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Monto ($)</label>
                                    <input required type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Estado</label>
                                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors">
                                        {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[13px] font-medium text-neutral-300 mb-1.5">Fecha de Vencimiento</label>
                                <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20 transition-colors" />
                            </div>
                            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
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
