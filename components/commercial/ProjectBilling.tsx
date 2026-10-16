"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, invoicePaidAmount } from "@/lib/commercial/money";
import {
  originLabels,
  type billingByOrigin,
} from "@/lib/commercial/invoice-origin";
import PaymentForm from "./PaymentForm";
type Summary = {
  economics: {
    budgetCost: number;
    budgetHours: number;
    totalCost: number;
    hours: number;
    margin: number | null;
  };
  agreement: {
    id: string;
    totalAmount: string;
    currency: string;
    quote: { number: string; version: number };
    milestones: Array<{
      id: string;
      title: string;
      amount: string;
      status: string;
      dueDate: string | null;
      invoice: { id: string; number: string; status: string } | null;
    }>;
  } | null;
  billingByOrigin: ReturnType<typeof billingByOrigin>;
  invoices: Array<{
    origin: keyof typeof originLabels;
    id: string;
    number: string;
    amount: number;
    currency: string;
    status: string;
    payments: Array<{ amount: number }>;
  }>;
  totals: {
    invoiced: number;
    collected: number;
    outstanding: number;
    unbilled: number | null;
  };
  requiresReconciliation: boolean;
};
const button =
  "rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 disabled:opacity-40";
export default function ProjectBilling({
  projectId,
  refreshKey,
  onChanged,
}: {
  projectId: string;
  refreshKey: number;
  onChanged: () => Promise<void>;
}) {
  const [summary, setSummary] = useState<Summary | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<{
    id: string;
    number: string;
    currency: string;
    outstanding: number;
  } | null>(null);
  useEffect(() => {
    void fetch(`/api/projects/${projectId}/commercial`)
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setSummary(v);
      })
      .catch((e) => setError(e.message));
  }, [projectId, refreshKey]);
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/projects/${projectId}/commercial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  const currency = summary?.agreement?.currency ?? "CLP";
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-semibold text-white">Plan de cobros</h2>
        <Link
          href={`/finanzas?projectId=${projectId}`}
          className="text-xs text-sky-300"
        >
          Finanzas del proyecto →
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Documentos internos de cobro. La emisión tributaria del SII se gestiona
        por separado.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {summary?.economics && (
        <div className="mt-4 rounded-lg border border-white/5 bg-neutral-950 p-3 text-xs text-neutral-400">
          <p>
            Presupuesto interno: {formatMoney(summary.economics.budgetCost)} ·{" "}
            {summary.economics.budgetHours} h
          </p>
          <p className="mt-1">
            Costo registrado: {formatMoney(summary.economics.totalCost)} ·{" "}
            {summary.economics.hours} h · Margen sobre neto:{" "}
            {summary.economics.margin === null
              ? "Sin neto confirmado"
              : formatMoney(summary.economics.margin, currency)}
          </p>
          <p className="mt-1 text-neutral-600">
            Información interna. El costo de horas usa la tarifa actual del
            equipo.
          </p>
        </div>
      )}
      {summary?.agreement ? (
        <>
          <p className="mt-3 text-sm">
            Acuerdo {summary.agreement.quote.number} v
            {summary.agreement.quote.version} ·{" "}
            {formatMoney(Number(summary.agreement.totalAmount), currency)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ["Facturado desarrollo", summary.totals.invoiced],
              ["Cobrado desarrollo", summary.totals.collected],
              ["Pendiente de pago", summary.totals.outstanding],
              ["Por facturar", summary.totals.unbilled ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-neutral-950 p-3">
                <p className="text-neutral-500">{label}</p>
                <p className="mt-1 font-semibold">
                  {formatMoney(Number(value), currency)}
                </p>
              </div>
            ))}
          </div>
          {summary.requiresReconciliation && (
            <div className="mt-4 space-y-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
              <p>
                Concilia la facturación previa antes de planificar el saldo. Los
                documentos sin neto explícito requieren revisión manual.
              </p>
              <button
                disabled={busy}
                className={button}
                onClick={() =>
                  void action({
                    action: "plan",
                    paymentPlan: { kind: "SINGLE" },
                  })
                }
              >
                Preparar saldo conciliado
              </button>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {summary.agreement.milestones.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-950 p-3"
              >
                <div>
                  <p className="text-sm">
                    {m.title} · {formatMoney(Number(m.amount), currency)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {m.invoice
                      ? `${m.invoice.number} · ${m.invoice.status}`
                      : m.dueDate
                        ? `Vence ${new Date(m.dueDate).toLocaleDateString("es-CL")}`
                        : "Emisión a solicitud"}
                  </p>
                </div>
                {!m.invoice && m.status === "Planned" && (
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() =>
                      void action({ action: "issue", milestoneId: m.id })
                    }
                  >
                    Emitir cobro interno
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">
          La aceptación establece el acuerdo y sus hitos. Los documentos
          históricos se conservan.
        </p>
      )}
      <div className="mt-4 space-y-2 text-xs text-neutral-400">
        <p>
          Los contratos recurrentes se contabilizan por separado. El origen por
          conciliar reserva presupuesto de desarrollo hasta su revisión formal.
        </p>
        {Object.entries(summary?.billingByOrigin ?? {}).map(
          ([code, buckets]) => (
            <p key={code}>
              Contratos recurrentes: facturado{" "}
              {formatMoney(buckets.CONTRACT.invoiced, code)} · cobrado{" "}
              {formatMoney(buckets.CONTRACT.collected, code)} · pendiente{" "}
              {formatMoney(buckets.CONTRACT.outstanding, code)}.
              {buckets.UNATTRIBUTED.invoiced > 0 && (
                <>
                  {" "}
                  Origen por conciliar:{" "}
                  {formatMoney(buckets.UNATTRIBUTED.invoiced, code)}.
                </>
              )}
            </p>
          ),
        )}
      </div>
      <div className="mt-4 space-y-2">
        {summary?.invoices.map((i) => (
          <div
            key={i.id}
            className="flex flex-wrap justify-between gap-2 border-t border-white/5 py-3 text-xs"
          >
            <span>
              {i.number} · {i.status} · {originLabels[i.origin]}
            </span>
            <span>
              {formatMoney(i.amount, i.currency)} · abonado{" "}
              {formatMoney(invoicePaidAmount(i), i.currency)}
            </span>
            {i.status !== "Pagado" && (
              <button
                className={button}
                onClick={() =>
                  setPaymentInvoice({
                    ...i,
                    outstanding: Math.max(0, i.amount - invoicePaidAmount(i)),
                  })
                }
              >
                Registrar pago
              </button>
            )}
          </div>
        ))}
      </div>
      {paymentInvoice && (
        <PaymentForm
          invoice={paymentInvoice}
          onSaved={onChanged}
          onClose={() => setPaymentInvoice(null)}
        />
      )}
    </section>
  );
}
