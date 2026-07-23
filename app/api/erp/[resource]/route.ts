import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { notify, recordAudit } from "@/lib/audit";
import { encryptString } from "@/lib/crypto";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function date(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function required(body: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((field) => !text(body[field]));
  return missing.length ? `Faltan campos requeridos: ${missing.join(", ")}` : null;
}

async function nextNumber(prefix: string, count: number) {
  return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

function quoteTotals(items: Array<{ quantity: number; unitPrice: number }>, discount: number, taxRate: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = subtotal * Math.max(0, discount) / 100;
  const net = subtotal - discountAmount;
  const tax = net * Math.max(0, taxRate) / 100;
  return { subtotal, discountAmount, net, tax, total: net + tax };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { resource } = await params;
  const financialResources = ["expenses", "payments", "suppliers", "purchase-orders", "payroll", "accounts", "journal"];
  if (financialResources.includes(resource) && !canManageFinance(user)) return NextResponse.json({ error: "No tienes permiso para ver esta sección." }, { status: 403 });
  if (["audit", "users", "trash"].includes(resource) && user.role !== "ADMIN") return NextResponse.json({ error: "Solo administración puede ver esta sección." }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  try {
    switch (resource) {
      case "overview": {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [
          opportunities,
          activeProjects,
          openTickets,
          overdueInvoices,
          pipeline,
          invoices,
          payments,
          expenses,
          hours,
          team,
          pendingApprovals,
        ] = await Promise.all([
          prisma.opportunity.count({ where: { deletedAt: null, stage: { notIn: ["Ganado", "Perdido"] } } }),
          prisma.project.count({ where: { deletedAt: null, status: { not: "Completado" } } }),
          prisma.supportTicket.count({ where: { deletedAt: null, status: { notIn: ["Resuelto", "Cerrado"] } } }),
          prisma.invoice.count({ where: { deletedAt: null, status: { in: ["Pendiente", "Vencido"] }, dueDate: { lt: now } } }),
          prisma.opportunity.aggregate({
            where: { deletedAt: null, stage: { notIn: ["Ganado", "Perdido"] } },
            _sum: { value: true },
          }),
          prisma.invoice.aggregate({
            where: { deletedAt: null, issuedAt: { gte: monthStart }, status: { not: "Cancelado" } },
            _sum: { amount: true },
          }),
          prisma.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true } }),
          prisma.expense.aggregate({ where: { deletedAt: null, date: { gte: monthStart } }, _sum: { amount: true } }),
          prisma.timeEntry.aggregate({ where: { date: { gte: monthStart } }, _sum: { hours: true } }),
          prisma.teamMember.findMany({
            where: { active: true, deletedAt: null },
            select: { id: true, name: true, weeklyCapacity: true, hourlyCost: true },
          }),
          prisma.clientApproval.count({ where: { status: "Pendiente" } }),
        ]);
        return NextResponse.json({
          opportunities,
          activeProjects,
          openTickets,
          overdueInvoices,
          pendingApprovals,
          pipelineValue: pipeline._sum.value ?? 0,
          invoicedThisMonth: invoices._sum.amount ?? 0,
          collectedThisMonth: payments._sum.amount ?? 0,
          expensesThisMonth: expenses._sum.amount ?? 0,
          hoursThisMonth: hours._sum.hours ?? 0,
          activeTeam: team.length,
          grossCashFlow: (payments._sum.amount ?? 0) - (expenses._sum.amount ?? 0),
        });
      }
      case "options": {
        const [clients, projects, team, suppliers, invoices, opportunities, accounts, payrollPeriods] = await Promise.all([
          prisma.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, company: true } }),
          prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, clientId: true } }),
          prisma.teamMember.findMany({ where: { deletedAt: null, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
          prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
          prisma.invoice.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, client: true, amount: true, status: true } }),
          prisma.opportunity.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
          prisma.account.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, name: true, code: true } }),
          prisma.payrollPeriod.findMany({ where: { deletedAt: null }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
        ]);
        return NextResponse.json({ clients, projects, team, suppliers, invoices, opportunities, accounts, payrollPeriods });
      }
      case "clients":
        return NextResponse.json(await prisma.client.findMany({
          where: { deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}) },
          orderBy: { updatedAt: "desc" },
          include: { contacts: { where: { deletedAt: null } }, _count: { select: { projects: true, opportunities: true, invoices: true, tickets: true } } },
        }));
      case "opportunities":
        return NextResponse.json(await prisma.opportunity.findMany({
          where: { deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}) },
          orderBy: [{ expectedClose: "asc" }, { updatedAt: "desc" }],
          include: { client: { select: { id: true, name: true } }, activities: { orderBy: { createdAt: "desc" }, take: 5 }, _count: { select: { quotes: true } } },
        }));
      case "contacts":
        return NextResponse.json(await prisma.contact.findMany({
          where: { deletedAt: null },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
          include: { client: { select: { id: true, name: true } } },
        }));
      case "quotes": {
        const quotes = await prisma.quote.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { client: { select: { id: true, name: true } }, opportunity: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, items: { orderBy: { sortOrder: "asc" } } },
        });
        return NextResponse.json(quotes.map((quote) => ({ ...quote, totals: quoteTotals(quote.items, quote.discount, quote.taxRate) })));
      }
      case "team":
        return NextResponse.json(await prisma.teamMember.findMany({
          where: { deletedAt: null },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          include: {
            assignments: { include: { project: { select: { id: true, name: true } } } },
            timeEntries: { where: { date: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { hours: true } },
            absences: { where: { endDate: { gte: new Date() } }, orderBy: { startDate: "asc" }, take: 3 },
          },
        }));
      case "time-entries":
        return NextResponse.json(await prisma.timeEntry.findMany({
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 200,
          include: { project: { select: { id: true, name: true } }, teamMember: { select: { id: true, name: true, hourlyCost: true, billableRate: true } } },
        }));
      case "assignments":
        return NextResponse.json(await prisma.projectAssignment.findMany({
          orderBy: { updatedAt: "desc" },
          include: { project: { select: { id: true, name: true } }, teamMember: { select: { id: true, name: true } } },
        }));
      case "absences":
        return NextResponse.json(await prisma.teamAbsence.findMany({
          orderBy: { startDate: "desc" },
          include: { teamMember: { select: { id: true, name: true } } },
        }));
      case "suppliers":
        return NextResponse.json(await prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { expenses: true } } } }));
      case "expenses":
        return NextResponse.json(await prisma.expense.findMany({
          where: { deletedAt: null },
          orderBy: { date: "desc" },
          take: 200,
          include: { supplier: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
        }));
      case "payments":
        return NextResponse.json(await prisma.payment.findMany({
          orderBy: { paidAt: "desc" },
          take: 200,
          include: { invoice: { select: { id: true, number: true, client: true, amount: true, status: true } } },
        }));
      case "contracts":
        return NextResponse.json(await prisma.supportContract.findMany({
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, _count: { select: { tickets: true } } },
        }));
      case "tickets":
        return NextResponse.json(await prisma.supportTicket.findMany({
          where: { deletedAt: null },
          orderBy: [{ status: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
          include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, contract: { select: { id: true, name: true } }, comments: { orderBy: { createdAt: "desc" }, take: 5 } },
        }));
      case "approvals":
        return NextResponse.json(await prisma.clientApproval.findMany({
          orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
          include: { project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } },
        }));
      case "notifications":
        return NextResponse.json(await prisma.notification.findMany({
          where: { OR: [{ userId: null }, { userId: user.id }] },
          orderBy: { createdAt: "desc" },
          take: 100,
        }));
      case "automations":
        return NextResponse.json(await prisma.automationRule.findMany({ orderBy: { createdAt: "desc" } }));
      case "users":
        return NextResponse.json(await prisma.userProfile.findMany({
          orderBy: { displayName: "asc" },
          select: { id: true, userId: true, displayName: true, email: true, role: true, active: true, createdAt: true },
        }));
      case "purchase-orders": {
        const orders = await prisma.purchaseOrder.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { supplier: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, items: true },
        });
        return NextResponse.json(orders.map((order) => ({ ...order, total: order.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * (1 + order.taxRate / 100) })));
      }
      case "assets":
        return NextResponse.json(await prisma.asset.findMany({
          where: { deletedAt: null },
          orderBy: [{ status: "asc" }, { name: "asc" }],
          include: { assignedTo: { select: { id: true, name: true } } },
        }));
      case "payroll":
        return NextResponse.json(await prisma.payrollPeriod.findMany({
          where: { deletedAt: null },
          orderBy: { startDate: "desc" },
          include: { entries: { include: { teamMember: { select: { id: true, name: true, role: true } } }, orderBy: { teamMember: { name: "asc" } } } },
        }));
      case "accounts":
        return NextResponse.json(await prisma.account.findMany({ orderBy: { code: "asc" } }));
      case "journal": {
        const entries = await prisma.journalEntry.findMany({
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
          take: 200,
        });
        return NextResponse.json(entries.map((entry) => ({ ...entry, debit: entry.lines.reduce((sum, line) => sum + line.debit, 0), credit: entry.lines.reduce((sum, line) => sum + line.credit, 0) })));
      }
      case "trash": {
        const [clients, projects, invoices, documents, notes, credentials, opportunities, quotes, members, suppliers, expenseRows, contracts, tickets, orders, assets, payroll] = await Promise.all([
          prisma.client.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.project.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.invoice.findMany({ where: { deletedAt: { not: null } }, select: { id: true, number: true, client: true, deletedAt: true } }),
          prisma.document.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.note.findMany({ where: { deletedAt: { not: null } }, select: { id: true, title: true, deletedAt: true } }),
          prisma.credential.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.opportunity.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.quote.findMany({ where: { deletedAt: { not: null } }, select: { id: true, number: true, title: true, deletedAt: true } }),
          prisma.teamMember.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.supplier.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.expense.findMany({ where: { deletedAt: { not: null } }, select: { id: true, description: true, deletedAt: true } }),
          prisma.supportContract.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.supportTicket.findMany({ where: { deletedAt: { not: null } }, select: { id: true, number: true, subject: true, deletedAt: true } }),
          prisma.purchaseOrder.findMany({ where: { deletedAt: { not: null } }, select: { id: true, number: true, deletedAt: true } }),
          prisma.asset.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
          prisma.payrollPeriod.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
        ]);
        const tagged = (type: string, rows: Array<Record<string, unknown>>) => rows.map((row) => ({ ...row, deletedAt: row.deletedAt, originalId: row.id, id: `${type}:${row.id}`, entityType: type, displayName: row.name ?? row.title ?? row.number ?? row.subject ?? row.description }));
        return NextResponse.json([
          ...tagged("Client", clients), ...tagged("Project", projects), ...tagged("Invoice", invoices),
          ...tagged("Document", documents), ...tagged("Note", notes), ...tagged("Credential", credentials),
          ...tagged("Opportunity", opportunities), ...tagged("Quote", quotes), ...tagged("TeamMember", members),
          ...tagged("Supplier", suppliers), ...tagged("Expense", expenseRows), ...tagged("SupportContract", contracts),
          ...tagged("SupportTicket", tickets), ...tagged("PurchaseOrder", orders), ...tagged("Asset", assets),
          ...tagged("PayrollPeriod", payroll),
        ].sort((a, b) => new Date(String(b.deletedAt)).getTime() - new Date(String(a.deletedAt)).getTime()));
      }
      case "audit":
        return NextResponse.json(await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
      default:
        return NextResponse.json({ error: "Recurso desconocido" }, { status: 404 });
    }
  } catch (error) {
    console.error(`[erp:${resource}:get]`, error);
    return NextResponse.json({ error: "No se pudieron cargar los datos." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { resource } = await params;
  const financialResources = ["expenses", "payments", "suppliers", "purchase-orders", "payroll", "accounts", "journal"];
  if (financialResources.includes(resource) && !canManageFinance(user)) return NextResponse.json({ error: "No tienes permiso para modificar esta sección." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;

  try {
    let item: { id: string };
    switch (resource) {
      case "clients": {
        const error = required(body, ["name"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.client.create({ data: {
          name: text(body.name), company: text(body.company) || null, email: text(body.email) || null,
          phone: text(body.phone) || null, taxId: text(body.taxId) || null, address: text(body.address) || null,
          website: text(body.website) || null, status: text(body.status) || "Activo", notes: text(body.notes) || null,
        } });
        break;
      }
      case "contacts": {
        const error = required(body, ["clientId", "name"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.contact.create({ data: {
          clientId: text(body.clientId), name: text(body.name), email: text(body.email) || null,
          phone: text(body.phone) || null, position: text(body.position) || null,
          isPrimary: Boolean(body.isPrimary), notes: text(body.notes) || null,
        } });
        break;
      }
      case "opportunities": {
        const error = required(body, ["name"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.opportunity.create({ data: {
          clientId: text(body.clientId) || null, name: text(body.name), company: text(body.company) || null,
          contactName: text(body.contactName) || null, email: text(body.email) || null, phone: text(body.phone) || null,
          stage: text(body.stage) || "Nuevo", source: text(body.source) || "Directo", value: number(body.value),
          probability: Math.min(100, Math.max(0, number(body.probability, 10))), expectedClose: date(body.expectedClose),
          owner: text(body.owner) || null, nextAction: text(body.nextAction) || null, notes: text(body.notes) || null,
        } });
        break;
      }
      case "activities": {
        const error = required(body, ["opportunityId", "subject"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.crmActivity.create({ data: {
          opportunityId: text(body.opportunityId), type: text(body.type) || "Nota", subject: text(body.subject),
          details: text(body.details) || null, dueAt: date(body.dueAt), createdBy: user.id,
        } });
        break;
      }
      case "quotes": {
        const error = required(body, ["clientId", "title"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
        if (!items.length) return NextResponse.json({ error: "La cotización necesita al menos un ítem." }, { status: 400 });
        const numberValue = text(body.number) || await nextNumber("COT", await prisma.quote.count());
        item = await prisma.quote.create({
          data: {
            number: numberValue, clientId: text(body.clientId), opportunityId: text(body.opportunityId) || null,
            title: text(body.title), status: text(body.status) || "Borrador", currency: text(body.currency) || "CLP",
            taxRate: number(body.taxRate, 19), discount: number(body.discount), validUntil: date(body.validUntil),
            terms: text(body.terms) || null, notes: text(body.notes) || null,
            items: { create: items.map((line, index) => ({
              description: text(line.description), quantity: Math.max(0.01, number(line.quantity, 1)),
              unitPrice: Math.max(0, number(line.unitPrice)), sortOrder: index,
            })) },
          },
        });
        break;
      }
      case "team": {
        const error = required(body, ["name"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.teamMember.create({ data: {
          name: text(body.name), email: text(body.email) || null, role: text(body.role) || "Desarrollador",
          skills: Array.isArray(body.skills) ? body.skills.map(String) : text(body.skills).split(",").map((value) => value.trim()).filter(Boolean),
          weeklyCapacity: number(body.weeklyCapacity, 40), hourlyCost: number(body.hourlyCost),
          billableRate: number(body.billableRate), monthlySalary: number(body.monthlySalary), active: body.active !== false,
        } });
        break;
      }
      case "assignments": {
        const error = required(body, ["projectId", "teamMemberId"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.projectAssignment.upsert({
          where: { projectId_teamMemberId: { projectId: text(body.projectId), teamMemberId: text(body.teamMemberId) } },
          update: { role: text(body.role) || "Miembro", allocation: number(body.allocation, 100), startDate: date(body.startDate), endDate: date(body.endDate) },
          create: { projectId: text(body.projectId), teamMemberId: text(body.teamMemberId), role: text(body.role) || "Miembro", allocation: number(body.allocation, 100), startDate: date(body.startDate), endDate: date(body.endDate) },
        });
        break;
      }
      case "absences": {
        const error = required(body, ["teamMemberId", "startDate", "endDate"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.teamAbsence.create({ data: {
          teamMemberId: text(body.teamMemberId), type: text(body.type) || "Vacaciones",
          startDate: date(body.startDate)!, endDate: date(body.endDate)!, notes: text(body.notes) || null,
        } });
        break;
      }
      case "time-entries": {
        const error = required(body, ["projectId", "teamMemberId", "description", "date"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.timeEntry.create({ data: {
          projectId: text(body.projectId), teamMemberId: text(body.teamMemberId), taskId: text(body.taskId) || null,
          description: text(body.description), date: date(body.date)!, hours: Math.max(0.01, number(body.hours)),
          billable: body.billable !== false, approved: Boolean(body.approved),
        } });
        break;
      }
      case "suppliers": {
        const error = required(body, ["name"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.supplier.create({ data: {
          name: text(body.name), taxId: text(body.taxId) || null, email: text(body.email) || null,
          phone: text(body.phone) || null, category: text(body.category) || "Servicios", notes: text(body.notes) || null,
        } });
        break;
      }
      case "expenses": {
        const error = required(body, ["description", "date"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.expense.create({ data: {
          supplierId: text(body.supplierId) || null, projectId: text(body.projectId) || null,
          description: text(body.description), category: text(body.category) || "General", amount: number(body.amount),
          taxAmount: number(body.taxAmount), currency: text(body.currency) || "CLP", date: date(body.date)!,
          status: text(body.status) || "Pagado", receiptUrl: text(body.receiptUrl) || null,
          recurring: Boolean(body.recurring), notes: text(body.notes) || null,
        } });
        break;
      }
      case "payments": {
        const error = required(body, ["invoiceId", "paidAt"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.payment.create({ data: {
          invoiceId: text(body.invoiceId), amount: number(body.amount), currency: text(body.currency) || "CLP",
          method: text(body.method) || "Transferencia", reference: text(body.reference) || null,
          paidAt: date(body.paidAt)!, notes: text(body.notes) || null,
        } });
        const invoice = await prisma.invoice.findUnique({ where: { id: text(body.invoiceId) }, include: { payments: true } });
        if (invoice) {
          const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: paid >= invoice.amount ? { status: "Pagado", paidAt: date(body.paidAt) } : { status: "Parcial", paidAt: null },
          });
        }
        break;
      }
      case "contracts": {
        const error = required(body, ["clientId", "name", "startDate"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.supportContract.create({ data: {
          clientId: text(body.clientId), projectId: text(body.projectId) || null, name: text(body.name),
          status: text(body.status) || "Activo", billingCycle: text(body.billingCycle) || "Mensual",
          monthlyAmount: number(body.monthlyAmount), includedHours: number(body.includedHours),
          responseHours: number(body.responseHours, 24), resolutionHours: number(body.resolutionHours, 72),
          startDate: date(body.startDate)!, endDate: date(body.endDate), autoRenew: body.autoRenew !== false,
          nextBillingAt: date(body.startDate),
          notes: text(body.notes) || null,
        } });
        break;
      }
      case "tickets": {
        const error = required(body, ["clientId", "subject", "description"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        const contract = text(body.contractId) ? await prisma.supportContract.findUnique({ where: { id: text(body.contractId) } }) : null;
        const createdAt = new Date();
        item = await prisma.supportTicket.create({ data: {
          number: text(body.number) || await nextNumber("TKT", await prisma.supportTicket.count()),
          clientId: text(body.clientId), projectId: text(body.projectId) || null, contractId: text(body.contractId) || null,
          subject: text(body.subject), description: text(body.description), status: text(body.status) || "Abierto",
          priority: text(body.priority) || "Media", category: text(body.category) || "Soporte",
          assignee: text(body.assignee) || null, requester: text(body.requester) || null,
          responseDue: new Date(createdAt.getTime() + (contract?.responseHours ?? 24) * 3600000),
          resolutionDue: new Date(createdAt.getTime() + (contract?.resolutionHours ?? 72) * 3600000),
        } });
        await notify({ type: "ticket", title: `Nuevo ticket ${"number" in item ? String(item.number) : ""}`, message: text(body.subject), href: "/erp?tab=soporte", severity: text(body.priority) === "Crítica" ? "critical" : "info" });
        break;
      }
      case "ticket-comments": {
        const error = required(body, ["ticketId", "body"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.ticketComment.create({ data: {
          ticketId: text(body.ticketId), author: text(body.author) || user.name, body: text(body.body), isPublic: body.isPublic !== false,
        } });
        await prisma.supportTicket.updateMany({ where: { id: text(body.ticketId), firstResponseAt: null }, data: { firstResponseAt: new Date(), status: "En progreso" } });
        break;
      }
      case "approvals": {
        const error = required(body, ["projectId", "title"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.clientApproval.create({ data: {
          projectId: text(body.projectId), type: text(body.type) || "Entregable", title: text(body.title),
          description: text(body.description) || null,
        } });
        break;
      }
      case "portal-tokens": {
        const error = required(body, ["clientId"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        const rawToken = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const created = await prisma.clientPortalToken.create({ data: {
          clientId: text(body.clientId), tokenHash, label: text(body.label) || "Portal principal",
          expiresAt: date(body.expiresAt),
        } });
        await recordAudit({ action: "CREATE", entityType: "ClientPortalToken", entityId: created.id, summary: "Acceso de portal creado" });
        return NextResponse.json({ ...created, token: rawToken, portalUrl: `/portal/${rawToken}` }, { status: 201 });
      }
      case "automations": {
        const error = required(body, ["name", "trigger", "action"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.automationRule.create({ data: {
          name: text(body.name), trigger: text(body.trigger), action: text(body.action),
          config: body.config && typeof body.config === "object" ? body.config : {}, active: body.active !== false,
        } });
        break;
      }
      case "purchase-orders": {
        const error = required(body, ["supplierId"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        const lines = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
        if (!lines.length) return NextResponse.json({ error: "La orden necesita al menos un ítem." }, { status: 400 });
        item = await prisma.purchaseOrder.create({ data: {
          number: text(body.number) || await nextNumber("OC", await prisma.purchaseOrder.count()),
          supplierId: text(body.supplierId), projectId: text(body.projectId) || null,
          status: text(body.status) || "Borrador", currency: text(body.currency) || "CLP",
          taxRate: number(body.taxRate, 19), expectedAt: date(body.expectedAt), notes: text(body.notes) || null,
          items: { create: lines.map((line) => ({
            description: text(line.description), quantity: Math.max(.01, number(line.quantity, 1)), unitPrice: Math.max(0, number(line.unitPrice)),
          })) },
        } });
        break;
      }
      case "assets": {
        const error = required(body, ["name"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.asset.create({ data: {
          name: text(body.name), type: text(body.type) || "Hardware", category: text(body.category) || "General",
          serialNumber: text(body.serialNumber) || null, secretData: text(body.licenseKey) ? encryptString(text(body.licenseKey)) : null,
          vendor: text(body.vendor) || null, assignedToId: text(body.assignedToId) || null,
          purchaseDate: date(body.purchaseDate), purchaseCost: number(body.purchaseCost),
          renewalDate: date(body.renewalDate), monthlyCost: number(body.monthlyCost),
          status: text(body.status) || "Disponible", location: text(body.location) || null, notes: text(body.notes) || null,
        } });
        break;
      }
      case "payroll": {
        const error = required(body, ["name", "startDate", "endDate"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        const members = await prisma.teamMember.findMany({ where: { active: true, deletedAt: null } });
        item = await prisma.payrollPeriod.create({ data: {
          name: text(body.name), startDate: date(body.startDate)!, endDate: date(body.endDate)!,
          paymentDate: date(body.paymentDate), status: text(body.status) || "Borrador",
          entries: { create: members.map((member) => ({ teamMemberId: member.id, baseSalary: member.monthlySalary, netPay: member.monthlySalary })) },
        } });
        break;
      }
      case "accounts": {
        const error = required(body, ["code", "name", "type"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        item = await prisma.account.create({ data: { code: text(body.code), name: text(body.name), type: text(body.type), parentId: text(body.parentId) || null } });
        break;
      }
      case "journal": {
        const error = required(body, ["date", "description"]);
        if (error) return NextResponse.json({ error }, { status: 400 });
        const lines = Array.isArray(body.lines) ? body.lines as Array<Record<string, unknown>> : [];
        const debit = lines.reduce((sum, line) => sum + number(line.debit), 0);
        const credit = lines.reduce((sum, line) => sum + number(line.credit), 0);
        if (lines.length < 2 || Math.abs(debit - credit) > .001) return NextResponse.json({ error: "El asiento debe tener al menos dos líneas y estar balanceado." }, { status: 400 });
        item = await prisma.journalEntry.create({ data: {
          number: text(body.number) || await nextNumber("ASI", await prisma.journalEntry.count()),
          date: date(body.date)!, description: text(body.description), reference: text(body.reference) || null,
          createdBy: user.id, status: text(body.status) || "Borrador",
          lines: { create: lines.map((line) => ({ accountId: text(line.accountId), description: text(line.description) || null, debit: number(line.debit), credit: number(line.credit) })) },
        } });
        break;
      }
      default:
        return NextResponse.json({ error: "Recurso desconocido" }, { status: 404 });
    }

    await recordAudit({ action: "CREATE", entityType: resource, entityId: item.id, summary: `Creación en ${resource}` });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error(`[erp:${resource}:post]`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 500 });
  }
}
