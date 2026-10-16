"use client";
import { useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/commercial/money";
export default function PaymentForm({
  invoice,
  onSaved,
  onClose,
}: {
  invoice: {
    id: string;
    number: string;
    outstanding: number;
    currency?: string;
  };
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [amount, setAmount] = useState(String(invoice.outstanding)),
    [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10)),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/erp/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: Number(amount),
          currency: invoice.currency ?? "CLP",
          paidAt,
          requestKey: key,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo registrar.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Registrar pago"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
    >
      <form
        onSubmit={save}
        className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-neutral-900 p-5"
      >
        <h2 className="font-semibold">Registrar pago · {invoice.number}</h2>
        <p className="text-sm text-neutral-400">
          Saldo: {formatMoney(invoice.outstanding, invoice.currency)}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <label className="block text-xs">
          Importe del pago
          <input
            aria-label="Importe del pago"
            type="number"
            required
            min={invoice.currency === "CLP" ? 1 : 0.01}
            max={invoice.outstanding}
            step={invoice.currency === "CLP" ? 1 : 0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          Fecha de pago
          <input
            type="date"
            required
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50"
          >
            {saving ? "Registrando…" : "Guardar pago"}
          </button>
        </div>
      </form>
    </div>
  );
}
