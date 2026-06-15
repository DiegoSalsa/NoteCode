"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, X, ArrowUpRight, ArrowDownRight, DollarSign } from "lucide-react";

type Invoice = {
    id: string;
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
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Invoice | null>(null);
    const [form, setForm] = useState({ number: "", client: "", amount: "", status: "Pendiente", dueDate: "" });
    const [saving, setSaving] = useState(false);

    const fetchInvoices = useCallback(async () => {
        const res = await fetch("/api/invoices");
        const data = await res.json();
        setInvoices(data);
    }, []);

    useEffect(() => {
        fetchInvoices().finally(() => setLoading(false));
    }, [fetchInvoices]);

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

    const filtered = invoices.filter((i) =>
        i.number.toLowerCase().includes(search.toLowerCase()) ||
        i.client.toLowerCase().includes(search.toLowerCase())
    );

    const totalAmount = invoices.reduce((sum, i) => sum + i.amount, 0);
    const pendingAmount = invoices.filter((i) => i.status === "Pendiente").reduce((sum, i) => sum + i.amount, 0);
    const paidAmount = invoices.filter((i) => i.status === "Pagado").reduce((sum, i) => sum + i.amount, 0);

    if (loading) {
        return (
            <div className="mx-auto max-w-5xl px-8 py-10">
                <div className="h-8 w-48 rounded bg-neutral-800 animate-pulse mb-6" />
                <div className="grid grid-cols-3 gap-3 mb-8">
                    {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-neutral-900 animate-pulse border border-white/10" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl px-8 py-10 space-y-8">
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[28px] font-bold tracking-tight text-neutral-100">Finanzas</h1>
                        <p className="text-[13px] text-neutral-500 mt-1">{invoices.length} facturas registradas</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white transition-colors"
                    >
                        <Plus size={15} strokeWidth={2} />
                        Nueva Factura
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    </div>
                </div>

                {/* Search */}
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
            </section>

            <div className="rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                {filtered.map((inv, i) => (
                    <div
                        key={inv.id}
                        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors group ${i !== filtered.length - 1 ? "border-b border-white/5" : ""
                            }`}
                    >
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex items-center gap-4">
                                <div>
                                    <h3 className="text-[14px] font-medium text-neutral-200">{inv.number}</h3>
                                    <p className="text-[12px] text-neutral-500 mt-0.5">{inv.client}</p>
                                </div>
                                <span className="text-[12px] text-neutral-600">
                                    Vence: {new Date(inv.dueDate).toLocaleDateString("es-MX")}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <span className="text-[14px] font-semibold tabular-nums text-neutral-200">
                                    ${inv.amount.toLocaleString()}
                                </span>
                                <StatusBadge status={inv.status} />
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
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
                            <div className="grid grid-cols-2 gap-3">
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