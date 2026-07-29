"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, FilePlus2, Pencil, Plus, RefreshCw, X } from "lucide-react";

type QuoteLine = { id?: string; description: string; quantity: number; unitPrice: number };
export type ProjectQuote = {
  id: string;
  number: string;
  title: string;
  status: string;
  version: number;
  currency: string;
  taxRate: number;
  discount: number;
  validUntil: string | null;
  terms: string | null;
  notes: string | null;
  items: QuoteLine[];
  createdAt: string;
};

export type ProjectInvoice = {
  id: string;
  number: string;
  amount: number;
  status: string;
  source: string;
  product: string | null;
  dueDate: string;
};

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function total(quote: Pick<ProjectQuote, "items" | "discount" | "taxRate">) {
  const subtotal = quote.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return subtotal * (1 - quote.discount / 100) * (1 + quote.taxRate / 100);
}

const emptyLine = (): QuoteLine => ({ description: "", quantity: 1, unitPrice: 0 });

export default function ProjectCommercial({
  projectId,
  clientId,
  projectName,
  quotes,
  invoices,
  onChanged,
}: {
  projectId: string;
  clientId: string;
  projectName: string;
  quotes: ProjectQuote[];
  invoices: ProjectInvoice[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectQuote | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    validUntil: "",
    taxRate: 19,
    discount: 0,
    terms: "",
    notes: "",
    items: [emptyLine()],
  });

  const previewTotal = useMemo(
    () => total({ items: form.items, discount: form.discount, taxRate: form.taxRate }),
    [form],
  );

  function openCreate() {
    setEditing(null);
    setError("");
    setForm({
      title: projectName,
      validUntil: "",
      taxRate: 19,
      discount: 0,
      terms: "",
      notes: "",
      items: [emptyLine()],
    });
    setOpen(true);
  }

  function openEdit(quote: ProjectQuote) {
    setEditing(quote);
    setError("");
    setForm({
      title: quote.title,
      validUntil: quote.validUntil?.slice(0, 10) ?? "",
      taxRate: quote.taxRate,
      discount: quote.discount,
      terms: quote.terms ?? "",
      notes: quote.notes ?? "",
      items: quote.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
    setOpen(true);
  }

  async function request(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "No se pudo guardar la cotización.");
    return payload;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        clientId,
        projectId,
        title: form.title,
        validUntil: form.validUntil || null,
        taxRate: form.taxRate,
        discount: form.discount,
        terms: form.terms,
        notes: form.notes,
        items: form.items,
      };
      await request(editing ? `/api/erp/quotes/${editing.id}` : "/api/erp/quotes", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOpen(false);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la cotización.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(quote: ProjectQuote, status: string) {
    setError("");
    try {
      await request(`/api/erp/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la cotización.");
    }
  }

  async function createRevision(quote: ProjectQuote) {
    setError("");
    try {
      await request(`/api/erp/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revision" }),
      });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la revisión.");
    }
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Cotizaciones del proyecto</h2>
            <p className="mt-1 text-xs text-neutral-500">Crea, edita y conserva cada revisión sin salir del proyecto.</p>
          </div>
          <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950">
            <FilePlus2 size={14} /> Nueva cotización
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {quotes.map((quote) => (
            <article key={quote.id} className="rounded-lg border border-white/5 bg-neutral-950 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-100">{quote.number}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">v{quote.version}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-neutral-300">{quote.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{quote.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{quote.items.length} ítems · {money.format(total(quote))}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/cotizaciones/${quote.id}`} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white"><ExternalLink size={12} /> Ver / imprimir</Link>
                  <button onClick={() => openEdit(quote)} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white"><Pencil size={12} /> Editar</button>
                  <button onClick={() => createRevision(quote)} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white"><RefreshCw size={12} /> Revisión</button>
                  {quote.status === "Borrador" && <button onClick={() => changeStatus(quote, "Enviada")} className="rounded-md bg-sky-500/15 px-2.5 py-1.5 text-xs text-sky-300">Marcar enviada</button>}
                  {quote.status === "Enviada" && <button onClick={() => changeStatus(quote, "Aprobada")} className="rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-300">Aprobar</button>}
                </div>
              </div>
            </article>
          ))}
          {quotes.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
              <p className="text-sm text-neutral-400">Este proyecto aún no tiene cotización.</p>
              <button onClick={openCreate} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky-400"><Plus size={13} /> Crear la primera</button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Facturación vinculada</h2>
            <p className="mt-1 text-xs text-neutral-500">Las facturas del proyecto se reflejan también en Finanzas.</p>
          </div>
          <Link href={`/finanzas?projectId=${projectId}`} className="text-xs text-neutral-400 hover:text-white">Abrir Finanzas →</Link>
        </div>
        <div className="mt-4 space-y-2">
          {invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-1 rounded-lg bg-neutral-950 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium text-neutral-200">{invoice.number}</p><p className="text-[11px] text-neutral-500">{invoice.source === "PROJECT" ? "Generada desde proyecto" : invoice.product || invoice.source}</p></div><div className="text-left sm:text-right"><p className="text-xs text-neutral-200">{money.format(invoice.amount)}</p><p className="text-[11px] text-neutral-500">{invoice.status}</p></div></div>)}
          {invoices.length === 0 && <p className="py-4 text-center text-xs text-neutral-500">Sin facturas vinculadas.</p>}
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div><h2 className="text-base font-semibold text-white">{editing ? `Editar ${editing.number}` : "Nueva cotización"}</h2><p className="mt-1 text-xs text-neutral-500">Quedará vinculada a {projectName}.</p></div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-neutral-500 hover:text-white"><X size={16} /></button>
            </div>
            <form onSubmit={save} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-neutral-400">Título<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-neutral-400">Válida hasta<input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
              </div>
              <div className="space-y-2">
                {form.items.map((line, index) => (
                  <div key={line.id ?? index} className="grid gap-2 rounded-lg border border-white/5 bg-neutral-950 p-3 sm:grid-cols-[minmax(0,1fr)_90px_140px_auto]">
                    <input required placeholder="Descripción" value={line.description} onChange={(event) => setForm({ ...form, items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white" />
                    <input aria-label="Cantidad" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => setForm({ ...form, items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) })} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white" />
                    <input aria-label="Precio unitario" type="number" min="0" step="1" value={line.unitPrice} onChange={(event) => setForm({ ...form, items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: Number(event.target.value) } : item) })} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white" />
                    <button type="button" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-md px-2 text-xs text-red-300 disabled:opacity-30">Quitar</button>
                  </div>
                ))}
                <button type="button" onClick={() => setForm({ ...form, items: [...form.items, emptyLine()] })} className="inline-flex items-center gap-1 text-xs text-sky-400"><Plus size={13} /> Agregar ítem</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-neutral-400">Descuento (%)<input type="number" min="0" max="100" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-neutral-400">IVA (%)<input type="number" min="0" max="100" value={form.taxRate} onChange={(event) => setForm({ ...form, taxRate: Number(event.target.value) })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
              </div>
              <label className="block space-y-1 text-xs text-neutral-400">Condiciones<textarea value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} rows={2} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
              <label className="block space-y-1 text-xs text-neutral-400">Notas internas<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
              <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-white">Total: {money.format(previewTotal)}</p>
                <div className="flex gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-neutral-300">Cancelar</button><button disabled={saving} type="submit" className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-neutral-950 disabled:opacity-50">{saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear cotización"}</button></div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
