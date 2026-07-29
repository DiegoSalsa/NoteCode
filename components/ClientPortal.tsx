"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, CalendarDays, CheckCircle2, Clock3, Download, FileText, FolderKanban,
  Headphones, Home, MessageSquare, Plus, ReceiptText, X, XCircle,
} from "lucide-react";

type PortalData = {
  portal: { label: string; lastUsedAt: string | null };
  client: { name: string; company: string | null };
  projects: Array<{
    id: string; name: string; description: string | null; status: string; targetDate: string | null; updatedAt: string;
    tasks: Array<{ id: string; title: string; status: string; dueDate: string | null }>;
    requirements: Array<{ id: string; description: string; completed: boolean }>;
    documents: Array<{ id: string; name: string; category: string; size: number; updatedAt: string }>;
    approvals: Array<{ id: string; title: string; type: string; description: string | null; status: string; feedback: string | null }>;
  }>;
  invoices: Array<{ id: string; number: string; amount: number; status: string; dueDate: string; payments: Array<{ amount: number }> }>;
  tickets: Array<{ id: string; number: string; subject: string; description: string; status: string; priority: string; updatedAt: string; comments: Array<{ id: string; author: string; body: string; createdAt: string }> }>;
  quotes: Array<{ id: string; number: string; title: string; status: string; taxRate: number; discount: number; validUntil: string | null; createdAt: string; items: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }>;
};

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function quoteTotal(quote: PortalData["quotes"][number]) {
  const subtotal = quote.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  return subtotal * (1 - quote.discount / 100) * (1 + quote.taxRate / 100);
}

function statusTone(status: string) {
  if (["Aprobada", "Aprobado", "Pagado", "Hecho", "Completado", "Resuelto", "Cerrado"].includes(status)) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (["Rechazada", "Rechazado", "Vencido", "Crítica"].includes(status)) return "border-red-500/20 bg-red-500/10 text-red-300";
  if (["Pendiente", "Enviada", "En progreso", "Cambios solicitados", "Parcial"].includes(status)) return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-white/10 bg-white/5 text-neutral-300";
}

function Status({ children }: { children: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${statusTone(children)}`}>{children}</span>;
}

export default function ClientPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState("inicio");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticket, setTicket] = useState({ subject: "", description: "", priority: "Media", projectId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/portal/${token}`);
    const payload = await response.json();
    if (response.ok) {
      setData(payload);
      setError("");
    } else {
      setError(payload.error ?? "No se pudo abrir el portal.");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function action(payload: Record<string, unknown>, successMessage?: string) {
    const response = await fetch(`/api/portal/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "No se pudo completar.");
      return false;
    }
    setNotice(successMessage ?? "Actualización guardada.");
    setTimeout(() => setNotice(""), 4000);
    await load();
    return true;
  }

  async function submitTicket(event: FormEvent) {
    event.preventDefault();
    if (await action({ action: "create-ticket", ...ticket }, "Solicitud enviada. Nuestro equipo ya puede verla.")) {
      setTicket({ subject: "", description: "", priority: "Media", projectId: "" });
      setTicketOpen(false);
      setTab("soporte");
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">Preparando tu portal...</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-center"><div><XCircle className="mx-auto text-red-400" /><h1 className="mt-4 text-xl font-semibold text-white">Acceso no disponible</h1><p className="mt-2 text-sm text-neutral-500">{error}</p></div></div>;

  const approvals = data.projects.flatMap((project) => project.approvals.map((approval) => ({ ...approval, projectName: project.name })));
  const pendingApprovals = approvals.filter((item) => item.status === "Pendiente");
  const pendingQuotes = data.quotes.filter((quote) => quote.status === "Enviada");
  const openTickets = data.tickets.filter((item) => !["Resuelto", "Cerrado"].includes(item.status));
  const outstanding = data.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.payments.reduce((paid, payment) => paid + payment.amount, 0)), 0);
  const nav = [
    ["inicio", "Inicio", Home],
    ["proyectos", "Proyectos", FolderKanban],
    ["cotizaciones", `Cotizaciones${pendingQuotes.length ? ` (${pendingQuotes.length})` : ""}`, FileText],
    ["aprobaciones", `Aprobaciones${pendingApprovals.length ? ` (${pendingApprovals.length})` : ""}`, CheckCircle2],
    ["facturas", "Facturas", ReceiptText],
    ["soporte", `Soporte${openTickets.length ? ` (${openTickets.length})` : ""}`, Headphones],
  ] as const;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <img src="/brand/notecode-logo-horizontal-white.svg" alt="NoteCode" className="h-7 w-auto" />
            <p className="mt-1 truncate text-xs text-neutral-500">{data.client.company || data.client.name}</p>
          </div>
          <button onClick={() => setTicketOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950"><Plus size={14} /><span className="hidden sm:inline">Nueva solicitud</span><span className="sm:hidden">Soporte</span></button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {error && <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div>}
        {notice && <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>}

        <nav className="flex gap-2 overflow-x-auto pb-2">
          {nav.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === id ? "bg-white text-neutral-950" : "border border-white/10 bg-neutral-900 text-neutral-400 hover:text-white"}`}><Icon size={14} />{label}</button>)}
        </nav>

        {tab === "inicio" && (
          <div className="mt-6 space-y-6">
            <section>
              <p className="text-sm text-neutral-500">Bienvenido, {data.client.name}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Todo lo importante, en un solo lugar</h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-400">Revisa avances, responde cotizaciones y aprobaciones, descarga archivos o conversa con soporte.</p>
            </section>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Proyectos activos" value={data.projects.filter((project) => project.status !== "Completado").length} detail={`${data.projects.length} en total`} onClick={() => setTab("proyectos")} />
              <SummaryCard label="Decisiones pendientes" value={pendingQuotes.length + pendingApprovals.length} detail={`${pendingQuotes.length} cotizaciones · ${pendingApprovals.length} aprobaciones`} tone="warning" onClick={() => setTab(pendingQuotes.length ? "cotizaciones" : "aprobaciones")} />
              <SummaryCard label="Saldo pendiente" value={money.format(outstanding)} detail={`${data.invoices.length} facturas`} onClick={() => setTab("facturas")} />
              <SummaryCard label="Solicitudes abiertas" value={openTickets.length} detail="Seguimiento con nuestro equipo" onClick={() => setTab("soporte")} />
            </div>
            {(pendingQuotes.length > 0 || pendingApprovals.length > 0) && <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5"><h2 className="text-sm font-semibold text-amber-200">Necesitamos tu respuesta</h2><div className="mt-3 space-y-2">{pendingQuotes.slice(0, 2).map((quote) => <button key={quote.id} onClick={() => setTab("cotizaciones")} className="flex w-full items-center justify-between rounded-lg bg-neutral-950 px-3 py-3 text-left text-sm"><span><span className="block font-medium">{quote.title}</span><span className="mt-0.5 block text-xs text-neutral-500">{quote.number} · {money.format(quoteTotal(quote))}</span></span><ArrowRight size={14} className="text-neutral-500" /></button>)}{pendingApprovals.slice(0, 2).map((approval) => <button key={approval.id} onClick={() => setTab("aprobaciones")} className="flex w-full items-center justify-between rounded-lg bg-neutral-950 px-3 py-3 text-left text-sm"><span><span className="block font-medium">{approval.title}</span><span className="mt-0.5 block text-xs text-neutral-500">{approval.projectName}</span></span><ArrowRight size={14} className="text-neutral-500" /></button>)}</div></section>}
          </div>
        )}

        {tab === "proyectos" && <div className="mt-5 grid gap-4 lg:grid-cols-2">{data.projects.length ? data.projects.map((project) => <ProjectCard key={project.id} project={project} token={token} />) : <Empty text="Todavía no hay proyectos publicados." />}</div>}

        {tab === "cotizaciones" && <div className="mt-5 space-y-3">{data.quotes.length ? data.quotes.map((quote) => {
          const total = quoteTotal(quote);
          return <article key={quote.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-neutral-500">{quote.number}</p><Status>{quote.status}</Status></div><h3 className="mt-2 text-lg font-semibold">{quote.title}</h3>{quote.validUntil && <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500"><CalendarDays size={12} /> Válida hasta {new Date(quote.validUntil).toLocaleDateString("es-CL")}</p>}<div className="mt-4 space-y-2 border-t border-white/5 pt-4">{quote.items.map((line) => <div key={line.id} className="flex justify-between gap-5 text-xs text-neutral-400"><span>{line.description} × {line.quantity}</span><span className="shrink-0">{money.format(line.quantity * line.unitPrice)}</span></div>)}</div><p className="mt-4 text-xl font-semibold">{money.format(total)}</p></div><div className="flex flex-wrap items-center gap-2"><a href={`/portal/${token}/cotizaciones/${quote.id}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"><Download size={13} /> Ver / imprimir</a>{quote.status === "Enviada" && <><button onClick={() => { const feedback = prompt("Cuéntanos el motivo o los cambios que necesitas"); void action({ action: "decide-quote", quoteId: quote.id, status: "Rechazada", feedback }, "Respuesta enviada."); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300">Solicitar cambios</button><button onClick={() => void action({ action: "decide-quote", quoteId: quote.id, status: "Aprobada" }, "Cotización aprobada. ¡Gracias!") } className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950">Aprobar</button></>}</div></div></article>;
        }) : <Empty text="No hay cotizaciones disponibles." />}</div>}

        {tab === "aprobaciones" && <div className="mt-5 space-y-3">{approvals.length ? approvals.map((approval) => <article key={approval.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs text-neutral-500">{approval.projectName} · {approval.type}</p><h3 className="mt-1 font-semibold">{approval.title}</h3><p className="mt-2 text-sm text-neutral-400">{approval.description}</p>{approval.feedback && <p className="mt-3 rounded-lg bg-neutral-950 p-3 text-xs text-neutral-400">Comentario: {approval.feedback}</p>}</div>{approval.status === "Pendiente" ? <div className="flex flex-wrap gap-2"><button onClick={() => void action({ action: "decide-approval", approvalId: approval.id, status: "Cambios solicitados", feedback: prompt("¿Qué cambios necesitas?") ?? "" }, "Solicitud de cambios enviada.")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300">Solicitar cambios</button><button onClick={() => void action({ action: "decide-approval", approvalId: approval.id, status: "Aprobado" }, "Entregable aprobado.")} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950">Aprobar</button></div> : <Status>{approval.status}</Status>}</div></article>) : <Empty text="No hay aprobaciones publicadas." />}</div>}

        {tab === "facturas" && <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">{data.invoices.length ? data.invoices.map((invoice, index) => { const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0); const progress = invoice.amount ? Math.min(100, Math.round(paid / invoice.amount * 100)) : 0; return <div key={invoice.id} className={`p-4 sm:p-5 ${index ? "border-t border-white/5" : ""}`}><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{invoice.number}</p><Status>{invoice.status}</Status></div><p className="mt-1 text-xs text-neutral-500">Vence {new Date(invoice.dueDate).toLocaleDateString("es-CL")}</p></div><div className="text-right"><p className="font-semibold">{money.format(invoice.amount)}</p><p className="mt-1 text-xs text-neutral-500">abonado {money.format(paid)}</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-emerald-400" style={{ width: `${progress}%` }} /></div></div>}) : <Empty text="No hay facturas disponibles." />}</div>}

        {tab === "soporte" && <div className="mt-5 space-y-3"><button onClick={() => setTicketOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950"><Plus size={14} /> Nueva solicitud</button>{data.tickets.length ? data.tickets.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-neutral-500">{item.number} · {item.priority}</p><h3 className="mt-1 font-semibold">{item.subject}</h3><p className="mt-2 text-sm text-neutral-400">{item.description}</p></div><Status>{item.status}</Status></div>{item.comments.length > 0 && <div className="mt-4 space-y-2 border-t border-white/10 pt-4">{item.comments.map((comment) => <div key={comment.id} className="rounded-lg bg-neutral-950 p-3"><p className="text-[11px] font-medium text-neutral-500">{comment.author} · {new Date(comment.createdAt).toLocaleDateString("es-CL")}</p><p className="mt-1 text-sm text-neutral-300">{comment.body}</p></div>)}</div>}{!["Resuelto", "Cerrado"].includes(item.status) && <button onClick={() => { const comment = prompt("Escribe tu respuesta"); if (comment) void action({ action: "comment-ticket", ticketId: item.id, comment }, "Respuesta enviada."); }} className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-white"><MessageSquare size={13} /> Responder</button>}</article>) : <Empty text="No hay solicitudes de soporte." />}</div>}
      </main>

      {ticketOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"><form onSubmit={submitTicket} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-neutral-500">Soporte</p><h2 className="text-lg font-semibold">Nueva solicitud</h2></div><button type="button" onClick={() => setTicketOpen(false)} className="rounded-md p-2 text-neutral-500 hover:bg-white/5"><X size={16} /></button></div><div className="mt-4 space-y-3"><select value={ticket.projectId} onChange={(event) => setTicket({ ...ticket, projectId: event.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"><option value="">Sin proyecto específico</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input required value={ticket.subject} onChange={(event) => setTicket({ ...ticket, subject: event.target.value })} placeholder="Asunto" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" /><textarea required rows={5} value={ticket.description} onChange={(event) => setTicket({ ...ticket, description: event.target.value })} placeholder="Describe lo que necesitas y, si aplica, cómo reproducirlo" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" /><select value={ticket.priority} onChange={(event) => setTicket({ ...ticket, priority: event.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTicketOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">Enviar solicitud</button></div></form></div>}
    </div>
  );
}

function SummaryCard({ label, value, detail, tone, onClick }: { label: string; value: string | number; detail: string; tone?: "warning"; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-xl border border-white/10 bg-neutral-900 p-5 text-left transition-colors hover:border-white/20"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p><p className={`mt-3 text-2xl font-semibold ${tone === "warning" ? "text-amber-300" : "text-white"}`}>{value}</p><p className="mt-1 text-xs text-neutral-500">{detail}</p></button>;
}

function ProjectCard({ project, token }: { project: PortalData["projects"][number]; token: string }) {
  const completed = project.tasks.filter((task) => task.status === "Hecho").length;
  const progress = project.tasks.length ? Math.round(completed / project.tasks.length * 100) : 0;
  const pendingRequirements = project.requirements.filter((item) => !item.completed).length;
  return (
    <article className="rounded-xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-lg font-semibold">{project.name}</p><p className="mt-1 line-clamp-2 text-sm text-neutral-500">{project.description || "Proyecto en seguimiento"}</p></div>
        <Status>{project.status}</Status>
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-xs text-neutral-500"><span>Avance de tareas</span><span>{completed}/{project.tasks.length} · {progress}%</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-emerald-400" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center"><SmallMetric label="Pendientes" value={project.tasks.length - completed} /><SmallMetric label="Requisitos" value={pendingRequirements} /><SmallMetric label="Archivos" value={project.documents.length} /></div>
      {project.tasks.length > 0 && <div className="mt-4 space-y-2 border-t border-white/5 pt-4">{project.tasks.filter((task) => task.status !== "Hecho").slice(0, 3).map((task) => <div key={task.id} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-neutral-400">{task.title}</span><Status>{task.status}</Status></div>)}</div>}
      {project.documents.length > 0 && <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Archivos compartidos</p><div className="mt-2 flex flex-wrap gap-2">{project.documents.map((document) => <a key={document.id} href={`/api/portal/${token}/documents/${document.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:text-white"><FileText size={12} /><span className="truncate">{document.name}</span></a>)}</div></div>}
      {project.targetDate && <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><Clock3 size={13} /> Objetivo: {new Date(project.targetDate).toLocaleDateString("es-CL")}</p>}
    </article>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-neutral-950 p-3"><p className="text-lg font-semibold">{value}</p><p className="text-[9px] uppercase tracking-wide text-neutral-600">{label}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="col-span-full rounded-xl border border-dashed border-white/10 p-10 text-center"><FileText className="mx-auto text-neutral-700" /><p className="mt-3 text-sm text-neutral-500">{text}</p></div>;
}
