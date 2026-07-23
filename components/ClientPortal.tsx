"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileText, FolderKanban, Headphones, MessageSquare, Plus, ReceiptText, XCircle } from "lucide-react";

type PortalData = {
  client: { name: string; company: string | null };
  projects: Array<{
    id: string; name: string; description: string | null; status: string; targetDate: string | null;
    tasks: Array<{ id: string; title: string; status: string; dueDate: string | null }>;
    requirements: Array<{ id: string; description: string; completed: boolean }>;
    documents: Array<{ id: string; name: string; category: string; size: number }>;
    approvals: Array<{ id: string; title: string; type: string; description: string | null; status: string; feedback: string | null }>;
  }>;
  invoices: Array<{ id: string; number: string; amount: number; status: string; dueDate: string; payments: Array<{ amount: number }> }>;
  tickets: Array<{ id: string; number: string; subject: string; description: string; status: string; priority: string; comments: Array<{ id: string; author: string; body: string; createdAt: string }> }>;
  quotes: Array<{ id: string; number: string; title: string; status: string; taxRate: number; discount: number; validUntil: string | null; items: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }>;
};

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default function ClientPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState("proyectos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticket, setTicket] = useState({ subject: "", description: "", priority: "Media", projectId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/portal/${token}`);
    const payload = await response.json();
    if (response.ok) setData(payload); else setError(payload.error ?? "No se pudo abrir el portal.");
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function action(payload: Record<string, unknown>) {
    const response = await fetch(`/api/portal/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "No se pudo completar."); return false; }
    await load();
    return true;
  }

  async function submitTicket(event: FormEvent) {
    event.preventDefault();
    if (await action({ action: "create-ticket", ...ticket })) {
      setTicket({ subject: "", description: "", priority: "Media", projectId: "" });
      setTicketOpen(false);
      setTab("soporte");
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">Cargando portal...</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-center"><div><XCircle className="mx-auto text-red-400" /><h1 className="mt-4 text-xl font-semibold text-white">Acceso no disponible</h1><p className="mt-2 text-sm text-neutral-500">{error}</p></div></div>;

  const approvals = data.projects.flatMap((project) => project.approvals.map((approval) => ({ ...approval, projectName: project.name })));
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 bg-neutral-900/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div><img src="/brand/notecode-logo-horizontal-white.svg" alt="NoteCode" className="h-7 w-auto" /><p className="mt-2 text-xs text-neutral-500">Portal de {data.client.company || data.client.name}</p></div>
          <button onClick={() => setTicketOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950"><Plus size={14} /> Solicitar soporte</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        {error && <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[["proyectos", "Proyectos", FolderKanban], ["cotizaciones", "Cotizaciones", FileText], ["aprobaciones", `Aprobaciones (${approvals.filter((item) => item.status === "Pendiente").length})`, CheckCircle2], ["facturas", "Facturas", ReceiptText], ["soporte", "Soporte", Headphones]].map(([id, label, Icon]) => {
            const IconComponent = Icon as typeof FolderKanban;
            return <button key={String(id)} onClick={() => setTab(String(id))} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === id ? "bg-white text-neutral-950" : "border border-white/10 bg-neutral-900 text-neutral-400"}`}><IconComponent size={14} />{String(label)}</button>;
          })}
        </div>
        {tab === "proyectos" && <div className="mt-5 grid gap-4 lg:grid-cols-2">{data.projects.map((project) => {
          const completed = project.tasks.filter((task) => task.status === "Hecho").length;
          const progress = project.tasks.length ? Math.round(completed / project.tasks.length * 100) : 0;
          return <article key={project.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{project.name}</p><p className="mt-1 text-sm text-neutral-500">{project.description}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-neutral-300">{project.status}</span></div><div className="mt-5"><div className="flex justify-between text-xs text-neutral-500"><span>Avance de tareas</span><span>{progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-emerald-400" style={{ width: `${progress}%` }} /></div></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><SmallMetric label="Tareas" value={project.tasks.length} /><SmallMetric label="Requisitos" value={project.requirements.length} /><SmallMetric label="Archivos" value={project.documents.length} /></div>{project.documents.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{project.documents.map((document) => <a key={document.id} href={`/api/portal/${token}/documents/${document.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:text-white"><FileText size={12} />{document.name}</a>)}</div>}{project.targetDate && <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><Clock3 size={13} /> Objetivo: {new Date(project.targetDate).toLocaleDateString("es-CL")}</p>}</article>;
        })}</div>}
        {tab === "cotizaciones" && <div className="mt-5 space-y-3">{data.quotes.length ? data.quotes.map((quote) => {
          const subtotal = quote.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
          const total = subtotal * (1 - quote.discount / 100) * (1 + quote.taxRate / 100);
          return <article key={quote.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs text-neutral-500">{quote.number}</p><h3 className="mt-1 text-lg font-semibold">{quote.title}</h3><div className="mt-4 space-y-1">{quote.items.map((line) => <div key={line.id} className="flex justify-between gap-6 text-xs text-neutral-400"><span>{line.description} × {line.quantity}</span><span>{money.format(line.quantity * line.unitPrice)}</span></div>)}</div><p className="mt-4 text-lg font-semibold">{money.format(total)}</p></div><div className="flex items-center gap-2">{quote.status === "Enviada" ? <><button onClick={() => { const feedback = prompt("Motivo o comentarios"); void action({ action: "decide-quote", quoteId: quote.id, status: "Rechazada", feedback }); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300">Rechazar</button><button onClick={() => action({ action: "decide-quote", quoteId: quote.id, status: "Aprobada" })} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950">Aprobar</button></> : <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-neutral-300">{quote.status}</span>}</div></div></article>;
        }) : <Empty text="No hay cotizaciones disponibles." />}</div>}
        {tab === "aprobaciones" && <div className="mt-5 space-y-3">{approvals.length ? approvals.map((approval) => <article key={approval.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs text-neutral-500">{approval.projectName} · {approval.type}</p><h3 className="mt-1 font-semibold">{approval.title}</h3><p className="mt-2 text-sm text-neutral-400">{approval.description}</p></div>{approval.status === "Pendiente" ? <div className="flex gap-2"><button onClick={() => action({ action: "decide-approval", approvalId: approval.id, status: "Cambios solicitados", feedback: prompt("¿Qué cambios necesitas?") ?? "" })} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300">Solicitar cambios</button><button onClick={() => action({ action: "decide-approval", approvalId: approval.id, status: "Aprobado" })} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950">Aprobar</button></div> : <span className="text-xs text-neutral-400">{approval.status}</span>}</div></article>) : <Empty text="No hay aprobaciones pendientes." />}</div>}
        {tab === "facturas" && <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">{data.invoices.length ? data.invoices.map((invoice, index) => { const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0); return <div key={invoice.id} className={`flex items-center justify-between gap-4 p-4 ${index ? "border-t border-white/5" : ""}`}><div><p className="text-sm font-medium">{invoice.number}</p><p className="mt-1 text-xs text-neutral-500">Vence {new Date(invoice.dueDate).toLocaleDateString("es-CL")} · abonado {money.format(paid)}</p></div><div className="text-right"><p className="font-semibold">{money.format(invoice.amount)}</p><p className="mt-1 text-xs text-neutral-500">{invoice.status}</p></div></div>}) : <Empty text="No hay facturas disponibles." />}</div>}
        {tab === "soporte" && <div className="mt-5 space-y-3">{data.tickets.length ? data.tickets.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-neutral-500">{item.number} · {item.priority}</p><h3 className="mt-1 font-semibold">{item.subject}</h3><p className="mt-2 text-sm text-neutral-400">{item.description}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-neutral-300">{item.status}</span></div>{item.comments.length > 0 && <div className="mt-4 space-y-2 border-t border-white/10 pt-4">{item.comments.map((comment) => <div key={comment.id} className="rounded-lg bg-neutral-950 p-3"><p className="text-[11px] font-medium text-neutral-500">{comment.author}</p><p className="mt-1 text-sm text-neutral-300">{comment.body}</p></div>)}</div>}<button onClick={() => { const comment = prompt("Escribe tu respuesta"); if (comment) void action({ action: "comment-ticket", ticketId: item.id, comment }); }} className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-white"><MessageSquare size={13} /> Responder</button></article>) : <Empty text="No hay solicitudes de soporte." />}</div>}
      </main>
      {ticketOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"><form onSubmit={submitTicket} className="w-full max-w-lg rounded-xl border border-white/10 bg-neutral-900 p-5"><h2 className="text-lg font-semibold">Nueva solicitud</h2><div className="mt-4 space-y-3"><select value={ticket.projectId} onChange={(event) => setTicket({ ...ticket, projectId: event.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"><option value="">Sin proyecto específico</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input required value={ticket.subject} onChange={(event) => setTicket({ ...ticket, subject: event.target.value })} placeholder="Asunto" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" /><textarea required rows={5} value={ticket.description} onChange={(event) => setTicket({ ...ticket, description: event.target.value })} placeholder="Describe lo que necesitas" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" /><select value={ticket.priority} onChange={(event) => setTicket({ ...ticket, priority: event.target.value })} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTicketOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">Enviar solicitud</button></div></form></div>}
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-neutral-950 p-3"><p className="text-lg font-semibold">{value}</p><p className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center"><FileText className="mx-auto text-neutral-700" /><p className="mt-3 text-sm text-neutral-500">{text}</p></div>;
}
