"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Calculator, ChevronLeft, ChevronRight, Landmark, RefreshCw, Save } from "lucide-react";

type TaxProfile = {
  rut: string;
  legalName: string | null;
  companyType: string | null;
  taxRegime: string | null;
  taxCategory: string | null;
  segment: string | null;
  vatTaxpayer: boolean;
  ppmRate: number;
  ppmRateConfirmed: boolean;
  f29DueDay: number;
  businessStartDate: string | null;
  activityDescription: string | null;
  address: string | null;
  commune: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

type F29Payload = {
  period: string;
  salesNet: number;
  debitVat: number;
  purchasesNet: number;
  purchaseVat: number;
  creditVat: number;
  previousCarryForward: number;
  vatPayable: number;
  nextCarryForward: number;
  ppmBase: number;
  ppmRate: number;
  ppmAmount: number;
  withholdings: number;
  otherTaxes: number;
  estimatedTotal: number;
  confidence: "Baja" | "Media" | "Alta";
  gaps: string[];
  dueDate: string;
  profile: TaxProfile | null;
  sources: { mode: string; taxDocuments: number; invoices: number; expenses: number };
  officialF29: {
    status: string;
    total: number;
    debitVat: number;
    ppmBase: number;
    ppmRate: number;
    ppmAmount: number;
    filedAt: string | null;
    paymentReference: string | null;
    variance: number;
  } | null;
  disclaimer: string;
};

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function varianceLabel(variance: number) {
  if (variance === 0) return "Los registros coinciden con el total oficial";
  if (variance < 0) return `Faltan ${clp.format(Math.abs(variance))} en los registros`;
  return `Los registros superan el total oficial por ${clp.format(variance)}`;
}

function previousMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function movePeriod(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function ChileTaxWorkspace({ initialPeriod }: { initialPeriod?: string }) {
  const [period, setPeriod] = useState(() => initialPeriod ?? previousMonth());
  const [data, setData] = useState<F29Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({ rut: "", legalName: "", taxRegime: "", ppmRate: "0", f29DueDay: "20" });

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tax/f29?period=${encodeURIComponent(period)}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo calcular el F29.");
      setData(payload);
      if (payload.profile) {
        setProfile({
          rut: payload.profile.rut,
          legalName: payload.profile.legalName ?? "",
          taxRegime: payload.profile.taxRegime ?? "",
          ppmRate: String(payload.profile.ppmRate),
          f29DueDay: String(payload.profile.f29DueDay),
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo calcular el F29.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/tax/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          ppmRate: Number(profile.ppmRate),
          f29DueDay: Number(profile.f29DueDay),
          vatTaxpayer: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el perfil tributario.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el perfil tributario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            <Landmark size={14} /> Cumplimiento Chile
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Impuestos y F29</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            Proyección mensual trazable, preparada para conciliar con el RCV y la propuesta del SII.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriod((current) => movePeriod(current, -1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            aria-label="Periodo anterior"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="month"
            aria-label="Periodo tributario"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-white/25"
          />
          <button
            type="button"
            onClick={() => setPeriod((current) => movePeriod(current, 1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            aria-label="Periodo siguiente"
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            aria-label="Recalcular F29"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading && !data ? (
        <div className="h-48 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="F29 estimado" value={clp.format(data.estimatedTotal)} detail={`Vence ${new Date(data.dueDate).toLocaleDateString("es-CL")}`} primary />
            <Metric label="IVA por pagar" value={clp.format(data.vatPayable)} detail={`Débito ${clp.format(data.debitVat)} · crédito ${clp.format(data.creditVat)}`} />
            <Metric label="PPM estimado" value={clp.format(data.ppmAmount)} detail={`${data.ppmRate}% sobre ${clp.format(data.ppmBase)}`} />
            <Metric label="Retenciones y otros" value={clp.format(data.withholdings + data.otherTaxes)} detail={`Remanente próximo ${clp.format(data.nextCarryForward)}`} />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Calculator size={16} /> Base del cálculo</h2>
                  <p className="mt-1 text-xs text-neutral-500">Fuente actual: {data.sources.mode}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  data.confidence === "Alta" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                    : data.confidence === "Media" ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
                      : "border-red-500/25 bg-red-500/10 text-red-200"
                }`}>Confianza {data.confidence.toLowerCase()}</span>
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <Detail label="Ventas netas" value={clp.format(data.salesNet)} />
                <Detail label="Compras netas" value={clp.format(data.purchasesNet)} />
                <Detail label="IVA débito" value={clp.format(data.debitVat)} />
                <Detail label="IVA crédito utilizable" value={clp.format(data.creditVat)} />
                <Detail label="Remanente anterior" value={clp.format(data.previousCarryForward)} />
                <Detail label="Documentos usados" value={`${data.sources.taxDocuments || data.sources.invoices + data.sources.expenses}`} />
              </dl>
              <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-neutral-500">{data.disclaimer}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                {data.gaps.length ? <AlertTriangle size={16} className="text-amber-300" /> : <BadgeCheck size={16} className="text-emerald-300" />}
                Preparación del período
              </h2>
              {data.gaps.length ? (
                <ul className="mt-4 space-y-3">
                  {data.gaps.map((gap) => <li key={gap} className="flex gap-2 text-sm leading-5 text-neutral-300"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />{gap}</li>)}
                </ul>
              ) : <p className="mt-4 text-sm text-emerald-200">El período cuenta con las fuentes principales conciliadas.</p>}
              {data.officialF29 && (
                <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-200">
                    <BadgeCheck size={14} /> F29 oficial {data.officialF29.status.toLowerCase()}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{clp.format(data.officialF29.total)}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    IVA {clp.format(data.officialF29.debitVat)} · PPM {clp.format(data.officialF29.ppmAmount)} ({data.officialF29.ppmRate}%)
                  </p>
                  <p className="mt-2 text-xs text-neutral-400">
                    {varianceLabel(data.officialF29.variance)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {data.profile?.legalName && (
            <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    <BadgeCheck size={14} /> Identidad verificada con documento SII
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">{data.profile.legalName}</h2>
                  <p className="mt-1 text-sm text-neutral-400">{data.profile.rut} · {data.profile.companyType || "Empresa"}</p>
                </div>
                <div className="text-sm text-neutral-400 sm:text-right">
                  <p>{data.profile.address}{data.profile.commune ? `, ${data.profile.commune}` : ""}</p>
                  <p className="mt-1">{data.profile.contactEmail}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
                <Detail label="Categoría tributaria" value={data.profile.taxCategory || "Por confirmar"} />
                <Detail label="Segmento SII" value={data.profile.segment || "Por confirmar"} />
                <Detail label="Inicio de actividades" value={data.profile.businessStartDate ? new Date(data.profile.businessStartDate).toLocaleDateString("es-CL") : "Por confirmar"} />
              </div>
              {data.profile.activityDescription && <p className="mt-3 text-xs leading-5 text-neutral-500">{data.profile.activityDescription}</p>}
            </section>
          )}

          <form onSubmit={saveProfile} className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Perfil tributario</h2>
              <p className="mt-1 text-xs text-neutral-500">Estos datos controlan PPM, vencimiento y validaciones del cálculo.</p>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="RUT" value={profile.rut} onChange={(rut) => setProfile((current) => ({ ...current, rut }))} placeholder="76.123.456-0" required />
              <Field label="Razón social" value={profile.legalName} onChange={(legalName) => setProfile((current) => ({ ...current, legalName }))} placeholder="Empresa SpA" required />
              <Field label="Régimen" value={profile.taxRegime} onChange={(taxRegime) => setProfile((current) => ({ ...current, taxRegime }))} placeholder="Pro Pyme General" />
              <Field label="Tasa PPM (%)" value={profile.ppmRate} onChange={(ppmRate) => setProfile((current) => ({ ...current, ppmRate }))} type="number" step="0.0001" required />
              <Field label="Día vencimiento" value={profile.f29DueDay} onChange={(f29DueDay) => setProfile((current) => ({ ...current, f29DueDay }))} type="number" min="1" max="28" required />
            </div>
            <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-50">
              <Save size={15} /> {saving ? "Guardando..." : "Guardar configuración"}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, detail, primary = false }: { label: string; value: string; detail: string; primary?: boolean }) {
  return <div className={`rounded-xl border p-5 ${primary ? "border-sky-500/25 bg-sky-500/10" : "border-white/10 bg-neutral-900"}`}><p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-neutral-500">{detail}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-neutral-950 px-3 py-3"><dt className="text-[11px] text-neutral-600">{label}</dt><dd className="mt-1 text-sm font-medium text-neutral-200">{value}</dd></div>;
}

function Field({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="text-xs font-medium text-neutral-400">{label}<input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-white/25" /></label>;
}
