"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  quoteTotals,
  formatMoney,
  type PaymentPlan,
} from "@/lib/commercial/money";

export type ProposalForm = {
  projectId?: string | null;
  opportunityId?: string | null;
  clientId: string;
  title: string;
  scope?: string | null;
  currency: string;
  taxRate: number;
  discount: number;
  terms?: string | null;
  notes?: string | null;
  validUntil?: string | null;
  paymentPlan?: PaymentPlan;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  requiresPriceReview?: boolean;
  historicalAmount?: number;
  editVersion?: number;
};
const inputClass =
  "w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white";
export default function QuoteEditor({
  initial,
  quoteId,
  onSaved,
  onClose,
}: {
  initial: ProposalForm;
  quoteId?: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ProposalForm>({
    ...initial,
    validUntil: initial.validUntil?.slice(0, 10) ?? "",
    paymentPlan: initial.paymentPlan ?? { kind: "SINGLE" },
  });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [options, setOptions] = useState<{
    clients: Array<{ id: string; name: string }>;
    projects: Array<{ id: string; name: string }>;
    opportunities: Array<{ id: string; name: string }>;
  }>({ clients: [], projects: [], opportunities: [] });
  useEffect(() => {
    if (!quoteId && !initial.projectId && !initial.opportunityId)
      void fetch("/api/erp/options")
        .then((r) => r.json())
        .then(setOptions)
        .catch(() => setError("No se pudieron cargar clientes y orígenes."));
  }, [quoteId, initial.projectId, initial.opportunityId]);
  async function source(kind: "projectId" | "opportunityId", id: string) {
    if (!id) return;
    try {
      const r = await fetch(`/api/commercial/prefill?${kind}=${id}`);
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setForm({
        ...v,
        paymentPlan: v.paymentPlan ?? { kind: "SINGLE" },
        validUntil: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo precargar.");
    }
  }
  let totals: ReturnType<typeof quoteTotals> | null = null;
  try {
    totals = quoteTotals(
      form.items,
      form.discount,
      form.taxRate,
      form.currency,
    );
  } catch {
    /* Validation shown on submit. */
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        quoteId ? `/api/erp/quotes/${quoteId}` : "/api/erp/quotes",
        {
          method: quoteId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: form.clientId,
            projectId: form.projectId || null,
            opportunityId: form.opportunityId || null,
            title: form.title,
            scope: form.scope || null,
            currency: form.currency,
            taxRate: Number(form.taxRate),
            discount: Number(form.discount),
            terms: form.terms || null,
            notes: form.notes || null,
            validUntil: form.validUntil || null,
            paymentPlan: form.paymentPlan,
            items: form.items,
            ...(quoteId ? { editVersion: form.editVersion } : {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  function line(index: number, patch: Partial<ProposalForm["items"][number]>) {
    setForm({
      ...form,
      items: form.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={quoteId ? "Editar propuesta" : "Preparar propuesta"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
    >
      <form
        onSubmit={save}
        className="max-h-[94vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 text-neutral-300"
      >
        <div className="flex justify-between gap-4">
          <h2 className="font-semibold text-white">
            {quoteId ? "Editar borrador" : "Preparar propuesta"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar propuesta">
            Cerrar
          </button>
        </div>
        {form.requiresPriceReview && (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            Revisa el precio neto y el IVA antes de guardar.{" "}
            {form.historicalAmount
              ? `Importe previo o estimado: ${formatMoney(form.historicalAmount, form.currency)}. Su tratamiento tributario no se modifica.`
              : ""}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        {!quoteId && !initial.projectId && !initial.opportunityId && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Proyecto existente
              <select
                className={inputClass}
                value={form.projectId ?? ""}
                onChange={(e) => void source("projectId", e.target.value)}
              >
                <option value="">Sin proyecto</option>
                {options.projects.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Oportunidad
              <select
                className={inputClass}
                value={form.opportunityId ?? ""}
                onChange={(e) => void source("opportunityId", e.target.value)}
              >
                <option value="">Sin oportunidad</option>
                {options.opportunities.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {!form.projectId && !form.opportunityId && (
          <label className="block text-xs">
            Cliente
            <select
              className={inputClass}
              required
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">Selecciona un cliente</option>
              {options.clients.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs">
          Título
          <input
            className={inputClass}
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          Alcance
          <textarea
            aria-label="Alcance"
            className={inputClass}
            rows={3}
            value={form.scope ?? ""}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Válida hasta
            <input
              type="date"
              className={inputClass}
              value={form.validUntil ?? ""}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Moneda
            <select
              className={inputClass}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option>CLP</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </label>
        </div>
        <div className="space-y-2">
          {form.items.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg bg-neutral-950 p-3 sm:grid-cols-[1fr_90px_140px_auto]"
            >
              <input
                aria-label={`Concepto ${index + 1}`}
                required
                className={inputClass}
                value={item.description}
                onChange={(e) => line(index, { description: e.target.value })}
              />
              <input
                aria-label={`Cantidad ${index + 1}`}
                type="number"
                step="0.0001"
                min="0.0001"
                required
                className={inputClass}
                value={item.quantity}
                onChange={(e) =>
                  line(index, { quantity: Number(e.target.value) })
                }
              />
              <input
                aria-label={`Precio neto ${index + 1}`}
                type="number"
                step={form.currency === "CLP" ? "1" : "0.01"}
                min="0"
                required
                className={inputClass}
                value={item.unitPrice}
                onChange={(e) =>
                  line(index, { unitPrice: Number(e.target.value) })
                }
              />
              <button
                type="button"
                disabled={form.items.length === 1}
                onClick={() =>
                  setForm({
                    ...form,
                    items: form.items.filter((_, i) => i !== index),
                  })
                }
                className="text-xs text-red-300 disabled:opacity-30"
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-sky-300"
            onClick={() =>
              setForm({
                ...form,
                items: [
                  ...form.items,
                  { description: "", quantity: 1, unitPrice: 0 },
                ],
              })
            }
          >
            Agregar concepto
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Descuento (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.0001"
              className={inputClass}
              value={form.discount}
              onChange={(e) =>
                setForm({ ...form, discount: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs">
            IVA (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.0001"
              className={inputClass}
              value={form.taxRate}
              onChange={(e) =>
                setForm({ ...form, taxRate: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="block text-xs">
          Condiciones
          <textarea
            className={inputClass}
            value={form.terms ?? ""}
            onChange={(e) => setForm({ ...form, terms: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          Plan de cobros
          <select
            aria-label="Plan de cobros"
            className={inputClass}
            value={form.paymentPlan?.kind}
            onChange={(e) =>
              setForm({
                ...form,
                paymentPlan:
                  e.target.value === "SINGLE"
                    ? { kind: "SINGLE" }
                    : e.target.value === "DEPOSIT_BALANCE"
                      ? { kind: "DEPOSIT_BALANCE", depositPercent: 50 }
                      : {
                          kind: "MILESTONES",
                          entries: [
                            { title: "Primer hito", percent: 50 },
                            { title: "Entrega", percent: 50 },
                          ],
                        },
              })
            }
          >
            <option value="SINGLE">Pago único</option>
            <option value="DEPOSIT_BALANCE">Anticipo y saldo</option>
            <option value="MILESTONES">Hitos de pago</option>
          </select>
        </label>
        {form.paymentPlan?.kind === "DEPOSIT_BALANCE" && (
          <label className="block text-xs">
            Anticipo (%)
            <input
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              className={inputClass}
              value={form.paymentPlan.depositPercent}
              onChange={(e) =>
                setForm({
                  ...form,
                  paymentPlan: {
                    kind: "DEPOSIT_BALANCE",
                    depositPercent: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        )}
        {form.paymentPlan?.kind === "MILESTONES" && (
          <div className="space-y-2">
            {form.paymentPlan.entries.map((entry, index) => (
              <div className="grid gap-2 sm:grid-cols-3" key={index}>
                <input
                  aria-label={`Nombre del hito ${index + 1}`}
                  required
                  className={inputClass}
                  value={entry.title}
                  onChange={(e) => {
                    if (form.paymentPlan?.kind === "MILESTONES")
                      setForm({
                        ...form,
                        paymentPlan: {
                          ...form.paymentPlan,
                          entries: form.paymentPlan.entries.map((v, i) =>
                            i === index ? { ...v, title: e.target.value } : v,
                          ),
                        },
                      });
                  }}
                />
                <input
                  aria-label={`Porcentaje del hito ${index + 1}`}
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  className={inputClass}
                  value={entry.percent}
                  onChange={(e) => {
                    if (form.paymentPlan?.kind === "MILESTONES")
                      setForm({
                        ...form,
                        paymentPlan: {
                          ...form.paymentPlan,
                          entries: form.paymentPlan.entries.map((v, i) =>
                            i === index
                              ? { ...v, percent: Number(e.target.value) }
                              : v,
                          ),
                        },
                      });
                  }}
                />
                <input
                  aria-label={`Fecha del hito ${index + 1}`}
                  type="date"
                  className={inputClass}
                  value={entry.dueDate ?? ""}
                  onChange={(e) => {
                    if (form.paymentPlan?.kind === "MILESTONES")
                      setForm({
                        ...form,
                        paymentPlan: {
                          ...form.paymentPlan,
                          entries: form.paymentPlan.entries.map((v, i) =>
                            i === index ? { ...v, dueDate: e.target.value } : v,
                          ),
                        },
                      });
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-sky-300"
              onClick={() => {
                if (form.paymentPlan?.kind === "MILESTONES")
                  setForm({
                    ...form,
                    paymentPlan: {
                      ...form.paymentPlan,
                      entries: [
                        ...form.paymentPlan.entries,
                        { title: "", percent: 0 },
                      ],
                    },
                  });
              }}
            >
              Añadir hito
            </button>
          </div>
        )}
        <label className="block text-xs">
          Notas internas
          <textarea
            className={inputClass}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        {totals && (
          <p className="text-sm">
            Neto {formatMoney(totals.net, form.currency)} · IVA{" "}
            {formatMoney(totals.tax, form.currency)} ·{" "}
            <strong>Total {formatMoney(totals.total, form.currency)}</strong>
          </p>
        )}
        <p className="text-xs text-neutral-500">
          Los cobros se preparan al aceptar y se emiten por separado. Los
          contratos periódicos se administran en Contratos.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            disabled={saving || !totals}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar borrador"}
          </button>
        </div>
      </form>
    </div>
  );
}
