import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notify, recordAudit } from "@/lib/audit";

async function alreadyNotified(type: string, href: string) {
  const since = new Date(Date.now() - 20 * 3600000);
  return prisma.notification.findFirst({ where: { type, href, createdAt: { gte: since } }, select: { id: true } });
}

async function executeAutomations() {
  const now = new Date();
  const inSevenDays = new Date(Date.now() + 7 * 86400000);
  const inactiveSince = new Date(Date.now() - 14 * 86400000);
  const [rules, invoices, tasks, projects, contracts, tickets, quotes, billingContracts] = await Promise.all([
    prisma.automationRule.findMany({ where: { active: true } }),
    prisma.invoice.findMany({ where: { deletedAt: null, status: { in: ["Pendiente", "Parcial"] }, dueDate: { lt: now } }, take: 50 }),
    prisma.projectTask.findMany({ where: { status: { not: "Hecho" }, dueDate: { lt: now } }, include: { project: { select: { name: true } } }, take: 50 }),
    prisma.project.findMany({ where: { deletedAt: null, status: { not: "Completado" }, updatedAt: { lt: inactiveSince } }, take: 50 }),
    prisma.supportContract.findMany({ where: { deletedAt: null, status: "Activo", endDate: { gte: now, lte: inSevenDays } }, take: 50 }),
    prisma.supportTicket.findMany({ where: { deletedAt: null, status: { notIn: ["Resuelto", "Cerrado"] }, resolutionDue: { lt: now } }, take: 50 }),
    prisma.quote.findMany({ where: { deletedAt: null, status: { in: ["Borrador", "Enviada"] }, validUntil: { gte: now, lte: inSevenDays } }, take: 50 }),
    prisma.supportContract.findMany({ where: { deletedAt: null, status: "Activo", monthlyAmount: { gt: 0 }, nextBillingAt: { lte: now } }, include: { client: true }, take: 50 }),
  ]);

  const configuredTriggers = new Set(rules.map((rule) => rule.trigger));
  const useAll = rules.length === 0;
  let created = 0;

  async function create(type: string, title: string, message: string, href: string, severity = "warning") {
    if (await alreadyNotified(type, href)) return;
    await notify({ type, title, message, href, severity });
    created += 1;
  }

  if (useAll || configuredTriggers.has("Factura vencida")) for (const invoice of invoices) await create("invoice-overdue", `Factura vencida: ${invoice.number}`, `${invoice.client} debe ${new Intl.NumberFormat("es-CL").format(invoice.amount)} CLP.`, "/finanzas", "critical");
  if (useAll || configuredTriggers.has("Tarea vencida")) for (const task of tasks) await create("task-overdue", `Tarea vencida: ${task.title}`, `Proyecto ${task.project.name}.`, `/proyectos/${task.projectId}`);
  if (useAll || configuredTriggers.has("Proyecto inactivo")) for (const project of projects) await create("project-stale", `Proyecto sin actividad: ${project.name}`, "No registra cambios durante los últimos 14 días.", `/proyectos/${project.id}`);
  if (useAll || configuredTriggers.has("Contrato por vencer")) for (const contract of contracts) await create("contract-expiring", `Contrato por vencer: ${contract.name}`, "Revisar renovación y condiciones.", "/erp?tab=contratos");
  if (useAll || configuredTriggers.has("SLA próximo")) for (const ticket of tickets) await create("sla-breached", `SLA vencido: ${ticket.number}`, ticket.subject, "/erp?tab=soporte", "critical");
  if (useAll || configuredTriggers.has("Cotización por vencer")) for (const quote of quotes) await create("quote-expiring", `Cotización por vencer: ${quote.number}`, quote.title, "/erp?tab=cotizaciones");

  for (const contract of billingContracts) {
    const stamp = now.toISOString().slice(0, 7).replace("-", "");
    const invoiceNumber = `REC-${stamp}-${contract.id.slice(0, 6).toUpperCase()}`;
    await prisma.invoice.upsert({
      where: { number: invoiceNumber },
      update: {},
      create: {
        projectId: contract.projectId,
        clientId: contract.clientId,
        number: invoiceNumber,
        client: contract.client.name,
        amount: contract.monthlyAmount,
        netAmount: contract.monthlyAmount / 1.19,
        status: "Pendiente",
        dueDate: new Date(now.getTime() + 15 * 86400000),
        notes: `Facturación recurrente: ${contract.name}`,
      },
    });
    const next = new Date(contract.nextBillingAt ?? now);
    const months = contract.billingCycle === "Anual" ? 12 : contract.billingCycle === "Semestral" ? 6 : contract.billingCycle === "Trimestral" ? 3 : 1;
    next.setMonth(next.getMonth() + months);
    await prisma.supportContract.update({ where: { id: contract.id }, data: { lastBilledAt: now, nextBillingAt: next } });
    await create("recurring-invoice", `Factura recurrente: ${invoiceNumber}`, contract.name, "/finanzas", "success");
  }

  if (rules.length) await prisma.automationRule.updateMany({ where: { active: true }, data: { lastRunAt: now } });
  await recordAudit({ action: "RUN", entityType: "Automation", entityId: "all", summary: `${created} notificaciones creadas` });
  return NextResponse.json({ success: true, created, checked: invoices.length + tasks.length + projects.length + contracts.length + tickets.length + quotes.length + billingContracts.length });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return executeAutomations();
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return executeAutomations();
}
