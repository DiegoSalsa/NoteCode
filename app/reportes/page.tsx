import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Clock3, Gauge, TrendingUp } from "lucide-react";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const numeric = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!canManageFinance(user)) redirect("/dashboard");

  return (
    <Suspense fallback={<ReportsLoading />}>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500"><BarChart3 size={14} /> Inteligencia de negocio</div>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Reportes y rentabilidad</h1>
        <p className="mt-1 text-sm text-neutral-500">Preparando ventas, caja, costos, capacidad y margen.</p>
      </header>
      <div className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 rounded-xl border border-white/10 bg-neutral-900" />)}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-white/10 bg-neutral-900" />
    </div>
  );
}

async function ReportsContent() {
  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);

  const [projects, opportunities, payments, expenses, team] = await cached(
    "reports:business-intelligence",
    60_000,
    () => Promise.all([
      prisma.project.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        include: {
          client: { select: { name: true } },
          timeEntries: { include: { teamMember: { select: { hourlyCost: true, billableRate: true } } } },
          expenses: { where: { deletedAt: null } },
          invoices: { where: { deletedAt: null }, include: { payments: true } },
        },
      }),
      prisma.opportunity.groupBy({ by: ["stage"], where: { deletedAt: null }, _sum: { value: true }, _count: { id: true } }),
      prisma.payment.findMany({ where: { paidAt: { gte: since } }, select: { amount: true, paidAt: true } }),
      prisma.expense.findMany({ where: { deletedAt: null, date: { gte: since } }, select: { amount: true, date: true } }),
      prisma.teamMember.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: "asc" },
        include: { timeEntries: { where: { date: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { hours: true, billable: true } } },
      }),
    ]),
  );

  const profitability = projects.map((project) => {
    const hours = project.timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const laborCost = project.timeEntries.reduce((sum, entry) => sum + entry.hours * entry.teamMember.hourlyCost, 0);
    const expenseCost = project.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const invoiced = project.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const collected = project.invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0), 0);
    const totalCost = laborCost + expenseCost;
    const revenueBase = invoiced || project.agreedAmount;
    return { ...project, hours, laborCost, expenseCost, totalCost, invoiced, collected, margin: revenueBase - totalCost, marginRate: revenueBase > 0 ? (revenueBase - totalCost) / revenueBase : 0 };
  });

  const totals = profitability.reduce((result, project) => ({
    revenue: result.revenue + (project.invoiced || project.agreedAmount),
    collected: result.collected + project.collected,
    cost: result.cost + project.totalCost,
    hours: result.hours + project.hours,
  }), { revenue: 0, collected: 0, cost: 0, hours: 0 });

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(since.getFullYear(), since.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    return {
      key,
      label: new Intl.DateTimeFormat("es-CL", { month: "short" }).format(date),
      income: payments.filter((payment) => `${payment.paidAt.getFullYear()}-${payment.paidAt.getMonth()}` === key).reduce((sum, payment) => sum + payment.amount, 0),
      expense: expenses.filter((expense) => `${expense.date.getFullYear()}-${expense.date.getMonth()}` === key).reduce((sum, expense) => sum + expense.amount, 0),
    };
  });
  const maxFlow = Math.max(1, ...months.flatMap((month) => [month.income, month.expense]));

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <header><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500"><BarChart3 size={14} /> Inteligencia de negocio</div><h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Reportes y rentabilidad</h1><p className="mt-1 text-sm text-neutral-500">Ventas, caja, costos, capacidad y margen por proyecto.</p></header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={TrendingUp} label="Ingresos comprometidos" value={clp.format(totals.revenue)} detail={`Cobrado ${clp.format(totals.collected)}`} />
        <Metric icon={ArrowDownRight} label="Costos registrados" value={clp.format(totals.cost)} detail="Horas + gastos de proyecto" />
        <Metric icon={ArrowUpRight} label="Margen estimado" value={clp.format(totals.revenue - totals.cost)} detail={`${totals.revenue ? numeric.format((totals.revenue - totals.cost) / totals.revenue * 100) : 0}% sobre ingresos`} />
        <Metric icon={Clock3} label="Horas registradas" value={`${numeric.format(totals.hours)} h`} detail={`${team.length} personas activas`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-sm font-semibold text-white">Flujo de caja · últimos 6 meses</h2>
          <div className="mt-6 flex h-52 items-end gap-3">
            {months.map((month) => <div key={month.key} className="flex h-full flex-1 flex-col justify-end"><div className="flex flex-1 items-end justify-center gap-1"><div title={`Ingresos ${clp.format(month.income)}`} className="w-2/5 rounded-t bg-emerald-400/80" style={{ height: `${Math.max(2, month.income / maxFlow * 100)}%` }} /><div title={`Gastos ${clp.format(month.expense)}`} className="w-2/5 rounded-t bg-red-400/70" style={{ height: `${Math.max(2, month.expense / maxFlow * 100)}%` }} /></div><p className="mt-2 text-center text-[10px] uppercase text-neutral-600">{month.label}</p></div>)}
          </div>
          <div className="mt-4 flex gap-4 text-[11px] text-neutral-500"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-400" /> Cobros</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-red-400" /> Gastos</span></div>
        </section>
        <section className="rounded-xl border border-white/10 bg-neutral-900 p-5"><h2 className="text-sm font-semibold text-white">Embudo comercial</h2><div className="mt-5 space-y-3">{opportunities.map((stage) => { const max = Math.max(1, ...opportunities.map((item) => item._count.id)); return <div key={stage.stage}><div className="flex items-center justify-between text-xs"><span className="text-neutral-300">{stage.stage}</span><span className="text-neutral-500">{stage._count.id} · {clp.format(stage._sum.value ?? 0)}</span></div><div className="mt-1.5 h-1.5 rounded-full bg-neutral-800"><div className="h-full rounded-full bg-sky-400/70" style={{ width: `${stage._count.id / max * 100}%` }} /></div></div>})}{!opportunities.length && <p className="text-sm text-neutral-500">Aún no hay oportunidades.</p>}</div></section>
      </div>

      <section><div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold text-white">Rentabilidad por proyecto</h2><p className="text-sm text-neutral-500">Valores basados en horas, costos del equipo, gastos, facturas y pagos registrados.</p></div></div><div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-neutral-900"><table className="w-full min-w-[900px] text-left"><thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600"><tr><th className="px-4 py-3">Proyecto</th><th className="px-4 py-3 text-right">Horas</th><th className="px-4 py-3 text-right">Ingresos</th><th className="px-4 py-3 text-right">Costos</th><th className="px-4 py-3 text-right">Cobrado</th><th className="px-4 py-3 text-right">Margen</th></tr></thead><tbody>{profitability.map((project) => <tr key={project.id} className="border-b border-white/5 last:border-0"><td className="px-4 py-3"><p className="text-sm font-medium text-white">{project.name}</p><p className="text-xs text-neutral-600">{project.client.name} · {project.status}</p></td><td className="px-4 py-3 text-right text-sm text-neutral-300">{numeric.format(project.hours)}</td><td className="px-4 py-3 text-right text-sm text-neutral-300">{clp.format(project.invoiced || project.agreedAmount)}</td><td className="px-4 py-3 text-right text-sm text-neutral-300">{clp.format(project.totalCost)}</td><td className="px-4 py-3 text-right text-sm text-neutral-300">{clp.format(project.collected)}</td><td className={`px-4 py-3 text-right text-sm font-semibold ${project.margin >= 0 ? "text-emerald-300" : "text-red-300"}`}>{clp.format(project.margin)}<p className="text-[10px] font-normal opacity-70">{numeric.format(project.marginRate * 100)}%</p></td></tr>)}</tbody></table></div></section>

      <section><h2 className="text-lg font-semibold text-white">Capacidad semanal</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{team.map((member) => { const used = member.timeEntries.reduce((sum, entry) => sum + entry.hours, 0); const utilization = member.weeklyCapacity ? used / member.weeklyCapacity : 0; return <div key={member.id} className="rounded-xl border border-white/10 bg-neutral-900 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-white">{member.name}</p><p className="text-xs text-neutral-500">{member.role}</p></div><Gauge size={16} className={utilization > 1 ? "text-red-300" : "text-neutral-600"} /></div><div className="mt-4 flex justify-between text-xs text-neutral-500"><span>{numeric.format(used)} h usadas</span><span>{numeric.format(member.weeklyCapacity)} h disponibles</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className={`h-full rounded-full ${utilization > 1 ? "bg-red-400" : utilization > .8 ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${Math.min(100, utilization * 100)}%` }} /></div></div>})}</div></section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof TrendingUp; label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">{label}</p><Icon size={16} className="text-neutral-600" /></div><p className="mt-4 text-xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-neutral-500">{detail}</p></div>;
}
