"use client";
import Link from "next/link";
import { useState } from "react";
import QuoteEditor, {
  type ProposalForm,
} from "@/components/commercial/QuoteEditor";
import ProjectBilling from "@/components/commercial/ProjectBilling";
import ProjectPortal from "@/components/commercial/ProjectPortal";
import { quoteTotals, formatMoney } from "@/lib/commercial/money";

export type ProjectQuote = ProposalForm & {
  id: string;
  number: string;
  status: string;
  version: number;
  calculationVersion: number;
  editVersion: number;
  contentHash: string;
  createdAt: string;
  decisions?: Array<{
    status: string;
    feedback: string | null;
    createdAt: string;
    origin: string;
  }>;
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
export const commercialButton =
  "rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:text-white disabled:opacity-40";
export async function commercialRequest(
  url: string,
  body?: Record<string, unknown>,
  method = "POST",
) {
  const response = await fetch(
    url,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar.");
  return payload;
}
export default function ProjectCommercial({
  projectId,
  clientId,
  projectName,
  quotes,
  onChanged,
}: {
  projectId: string;
  clientId: string;
  projectName: string;
  quotes: ProjectQuote[];
  invoices: ProjectInvoice[];
  onChanged: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<{
    initial: ProposalForm;
    id?: string;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refreshKey, setRefreshKey] = useState(0);
  async function refresh() {
    await onChanged();
    setRefreshKey((k) => k + 1);
  }
  async function run(quote: ProjectQuote, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await commercialRequest(
        `/api/erp/quotes/${quote.id}`,
        {
          ...payload,
          ...(payload.status
            ? { contentHash: quote.contentHash, editVersion: quote.editVersion }
            : {}),
        },
        "PATCH",
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo completar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    setError("");
    try {
      const draft = quotes.find(q => q.status === "Borrador");
      if (draft) { setEditor({ id: draft.id, initial: { ...draft, clientId, projectId } }); return; }
      if (quotes[0]) {
        const revision = await commercialRequest(`/api/erp/quotes/${quotes[0].id}`, { action: "revision" }, "PATCH");
        setEditor({ id: revision.id, initial: revision }); await refresh(); return;
      }
      setEditor({
        initial: await commercialRequest(
          `/api/commercial/prefill?projectId=${projectId}`,
        ),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar.");
    }
  }
  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <div>
            <h2 className="font-semibold text-white">Propuesta y acuerdo</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Precio, alcance y condiciones de {projectName}. Cada publicación
              conserva su versión.
            </p>
          </div>
          <button
            disabled={busy}
            className={commercialButton}
            onClick={() => void prepare()}
          >
            {quotes.some(q => q.status === "Borrador") ? "Continuar borrador" : quotes.length ? "Preparar revisión" : "Generar propuesta"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {quotes.map((quote) => {
            const totals = quoteTotals(
              quote.items,
              quote.discount,
              quote.taxRate,
              quote.currency,
              quote.calculationVersion,
            );
            return (
              <article
                key={quote.id}
                className="rounded-lg border border-white/10 bg-neutral-950 p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {quote.number} · v{quote.version}
                    </h3>
                    <p className="text-sm">{quote.title}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {quote.status} · Neto{" "}
                      {formatMoney(totals.net, quote.currency)} · IVA{" "}
                      {formatMoney(totals.tax, quote.currency)} · Total{" "}
                      {formatMoney(totals.total, quote.currency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className={commercialButton}
                      href={`/cotizaciones/${quote.id}`}
                    >
                      Ver / imprimir
                    </Link>
                    {quote.status === "Borrador" ? (
                      <>
                        <button
                          className={commercialButton}
                          onClick={() =>
                            setEditor({
                              initial: { ...quote, projectId, clientId },
                              id: quote.id,
                            })
                          }
                        >
                          Editar borrador
                        </button>
                        <button
                          disabled={busy}
                          className={commercialButton}
                          onClick={() => void run(quote, { status: "Enviada" })}
                        >
                          Publicar en portal
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy}
                        className={commercialButton}
                        onClick={() => void run(quote, { action: "revision" })}
                      >
                        Nueva revisión
                      </button>
                    )}
                    {quote.status === "Enviada" && (
                      <button
                        disabled={busy}
                        className={commercialButton}
                        onClick={() => void run(quote, { status: "Aprobada" })}
                      >
                        Registrar aceptación
                      </button>
                    )}
                  </div>
                </div>
                {quote.decisions?.map((d, i) => (
                  <p
                    key={i}
                    className="mt-3 border-t border-white/5 pt-2 text-xs text-neutral-400"
                  >
                    {d.status} ·{" "}
                    {d.origin === "PORTAL"
                      ? "Portal del cliente"
                      : "Registro interno"}{" "}
                    · {new Date(d.createdAt).toLocaleString("es-CL")}
                    {d.feedback ? ` — ${d.feedback}` : ""}
                  </p>
                ))}
              </article>
            );
          })}
          {!quotes.length && (
            <p className="py-4 text-sm text-neutral-500">
              Genera la propuesta con el precio y el alcance ya registrados.
            </p>
          )}
        </div>
      </section>
      <ProjectBilling
        projectId={projectId}
        refreshKey={refreshKey}
        onChanged={refresh}
      />
      <ProjectPortal projectId={projectId} />
      {editor && (
        <QuoteEditor
          initial={editor.initial}
          quoteId={editor.id}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
