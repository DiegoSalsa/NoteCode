"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, CalendarClock, CheckCircle2, CircleDollarSign, Landmark, Loader2, Play, RefreshCw, Sparkles } from "lucide-react";

type TodayData = {
  generatedAt: string;
  timezone: string;
  summary: {
    activeProjects: number;
    tasks: number;
    overdueTasks: number;
    pendingInvoices: number;
    pendingAmount: number;
    unreadAlerts: number;
    pendingApprovals: number;
  };
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; projectId: string; project: { name: string } }>;
  invoices: Array<{ id: string; number: string; client: string; amount: number; status: string; dueDate: string | null }>;
  notifications: Array<{ id: string; title: string; message: string; severity: string; href: string | null; createdAt: string }>;
  actions: Array<{ id: string; title: string; description: string | null; status: string; riskLevel: string; requiresApproval: boolean }>;
  routines: Array<{ id: string; name: string; description: string | null; active: boolean; schedule: string; nextRunAt: string | null; lastRunAt: string | null }>;
  f29: {
    period: string;
    estimatedTotal: number;
    vatPayable: number;
    ppmAmount: number;
    dueDateChile: string;
    confidence: string;
    gaps: string[];
  } | null;
};

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function civilDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "America/Santiago" });
}

export default function TodayWorkspace({ displayName }: { displayName: string }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/gilberto/today${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo preparar tu día.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo preparar tu día.");
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => { if (!data) void load(); }, [data, load]);

  async function runAutomations() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/automations/run", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron ejecutar las rutinas.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron ejecutar las rutinas.");
    } finally {
      setRunning(false);
    }
  }

  async function decideAction(id: string, decision: "approve" | "reject") {
    setError("");
    try {
      const response = await fetch(`/api/gilberto/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar la acción.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar la acción.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300"><Sparkles size={14} /> Centro diario</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Hola, {displayName.split(" ")[0]}. Esto importa hoy.</h1>
          <p className="mt-1 text-sm text-neutral-400">Gilberto reúne trabajo, cobros, impuestos y alertas sin que tengas que recorrer cada módulo.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
          <button type="button" onClick={() => void runAutomations()} disabled={running} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-50">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Ejecutar rutinas
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {loading && !data ? <div className="h-64 animate-pulse rounded-xl border border-white/10 bg-neutral-900" /> : data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Tareas a la vista" value={String(data.summary.tasks)} detail={`${data.summary.overdueTasks} vencidas`} alert={data.summary.overdueTasks > 0} />
            <Metric label="Cobros pendientes" value={clp.format(data.summary.pendingAmount)} detail={`${data.summary.pendingInvoices} facturas`} alert={data.summary.pendingInvoices > 0} />
            <Metric label="F29 estimado" value={data.f29 ? clp.format(data.f29.estimatedTotal) : "Sin acceso"} detail={data.f29 ? `Vence ${data.f29.dueDateChile}` : ""} alert={Boolean(data.f29?.gaps.length)} />
            <Metric label="Alertas sin leer" value={String(data.summary.unreadAlerts)} detail={`${data.summary.pendingApprovals} aprobaciones pendientes`} alert={data.summary.pendingApprovals > 0} />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-white/10 bg-neutral-900">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Prioridades</h2>
                  <p className="mt-1 text-xs text-neutral-500">Ordenadas por vencimiento y urgencia.</p>
                </div>
                <Link href="/proyectos" className="text-xs text-neutral-400 hover:text-white">Ver proyectos</Link>
              </div>
              <div className="divide-y divide-white/5">
                {data.tasks.slice(0, 6).map((task) => (
                  <Link key={task.id} href={`/proyectos/${task.projectId}`} className="flex items-start gap-3 px-5 py-4 hover:bg-white/[0.025]">
                    {task.dueDate && new Date(task.dueDate) < new Date() ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-neutral-600" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-200">{task.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{task.project.name} · {task.priority} · {civilDate(task.dueDate)}</p>
                    </div>
                    <ArrowRight size={14} className="mt-1 text-neutral-600" />
                  </Link>
                ))}
                {!data.tasks.length && <p className="px-5 py-8 text-center text-sm text-neutral-500">No hay tareas urgentes. Buen momento para avanzar trabajo importante.</p>}
              </div>
            </div>

            <div className="space-y-5">
              {data.f29 && (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-200"><Landmark size={14} /> F29 {data.f29.period}</p>
                      <p className="mt-3 text-3xl font-semibold text-white">{clp.format(data.f29.estimatedTotal)}</p>
                      <p className="mt-1 text-xs text-neutral-400">IVA {clp.format(data.f29.vatPayable)} · PPM {clp.format(data.f29.ppmAmount)}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-neutral-300">Confianza {data.f29.confidence.toLowerCase()}</span>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-neutral-400">{data.f29.gaps.length ? `${data.f29.gaps.length} brechas pendientes antes de declarar.` : "Fuentes principales conciliadas."}</p>
                  <Link href={`/impuestos?period=${data.f29.period}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white hover:underline">Abrir conciliación <ArrowRight size={14} /></Link>
                </div>
              )}

              <Link href="/gilberto" className="block rounded-xl border border-white/10 bg-neutral-900 p-5 hover:bg-neutral-800/70">
                <p className="flex items-center gap-2 text-sm font-semibold text-white"><Bot size={16} /> Hablar con Gilberto</p>
                <p className="mt-2 text-sm leading-5 text-neutral-400">La conversación y tus preferencias ahora quedan disponibles entre dispositivos.</p>
                <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-neutral-200">Abrir asistente <ArrowRight size={13} /></span>
              </Link>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Panel title="Cobros" icon={<CircleDollarSign size={16} />} empty="No hay cobros pendientes.">
              {data.invoices.slice(0, 5).map((invoice) => (
                <Link href="/finanzas" key={invoice.id} className="flex items-center justify-between gap-4 border-t border-white/5 px-5 py-3.5 first:border-t-0 hover:bg-white/[0.025]">
                  <div className="min-w-0"><p className="truncate text-sm text-neutral-200">{invoice.number} · {invoice.client}</p><p className="mt-1 text-xs text-neutral-500">{invoice.status} · vence {civilDate(invoice.dueDate)}</p></div>
                  <p className="shrink-0 text-sm font-medium text-white">{clp.format(invoice.amount)}</p>
                </Link>
              ))}
            </Panel>
            <Panel title="Rutinas autónomas" icon={<CalendarClock size={16} />} empty="No hay rutinas configuradas.">
              {data.routines.map((routine) => (
                <div key={routine.id} className="flex items-center justify-between gap-4 border-t border-white/5 px-5 py-3.5 first:border-t-0">
                  <div className="min-w-0"><p className="truncate text-sm text-neutral-200">{routine.name}</p><p className="mt-1 text-xs text-neutral-500">{routine.schedule} · próxima {civilDate(routine.nextRunAt)}</p></div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${routine.active ? "bg-emerald-400" : "bg-neutral-600"}`} />
                </div>
              ))}
            </Panel>
          </section>

          {data.actions.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-sm font-semibold text-white">Acciones de Gilberto</h2>
                <p className="mt-1 text-xs text-neutral-500">Las acciones sensibles quedan en una cola visible y auditada.</p>
              </div>
              <div className="divide-y divide-white/5">
                {data.actions.map((action) => (
                  <div key={action.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-neutral-200">{action.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{action.description || action.status} · riesgo {action.riskLevel}</p>
                    </div>
                    {action.status === "pending" ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void decideAction(action.id, "reject")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5">Rechazar</button>
                        <button type="button" onClick={() => void decideAction(action.id, "approve")} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950 hover:bg-neutral-200">Aprobar</button>
                      </div>
                    ) : <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-neutral-400">{action.status}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className={`rounded-xl border p-5 ${alert ? "border-amber-500/20 bg-amber-500/[0.07]" : "border-white/10 bg-neutral-900"}`}><p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-neutral-500">{detail}</p></div>;
}

function Panel({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900"><div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 text-sm font-semibold text-white">{icon}{title}</div>{hasChildren ? children : <p className="px-5 py-8 text-center text-sm text-neutral-500">{empty}</p>}</div>;
}
