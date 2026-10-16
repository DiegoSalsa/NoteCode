import { decideApproval } from "@/lib/commercial/approvals";
import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManage, canManageFinance, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { encryptString } from "@/lib/crypto";
import { invalidateCache } from "@/lib/server-cache";
import { assertProjectBelongsToClient } from "@/lib/commercial";
import { quoteCommand } from "@/lib/commercial/commands";
import { archiveQuote, convertQuote } from "@/lib/commercial/quotes";
import { commercialFailure } from "@/lib/commercial/http";
import { CommercialError } from "@/lib/commercial/transaction";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { resource, id } = await params;
  const financialResources = ["expenses", "payments", "suppliers", "purchase-orders", "payroll", "payroll-entries", "accounts", "journal"];
  if (financialResources.includes(resource) && !canManageFinance(user)) return NextResponse.json({ error: "No tienes permiso para modificar esta sección." }, { status: 403 });
  if (resource === "portal-tokens" && !canManage(user)) return NextResponse.json({ error: "No tienes permiso para administrar portales." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const action = text(body.action);

  try {
    let item: { id: string };
    if (resource === "trash") {
      if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo administración puede restaurar la papelera." }, { status: 403 });
      const [entityType, originalId] = decodeURIComponent(id).split(":");
      if (!entityType || !originalId) return NextResponse.json({ error: "Elemento de papelera inválido." }, { status: 400 });
      switch (entityType) {
        case "Client": item = await prisma.client.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Project": item = await prisma.project.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Invoice": item = await prisma.invoice.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Document": item = await prisma.document.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Note": item = await prisma.note.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Credential": item = await prisma.credential.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Opportunity": item = await prisma.opportunity.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Quote": item = await prisma.quote.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "TeamMember": item = await prisma.teamMember.update({ where: { id: originalId }, data: { deletedAt: null, active: true } }); break;
        case "Supplier": item = await prisma.supplier.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Expense": item = await prisma.expense.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "SupportContract": item = await prisma.supportContract.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "SupportTicket": item = await prisma.supportTicket.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "PurchaseOrder": item = await prisma.purchaseOrder.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "Asset": item = await prisma.asset.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        case "PayrollPeriod": item = await prisma.payrollPeriod.update({ where: { id: originalId }, data: { deletedAt: null } }); break;
        default: return NextResponse.json({ error: "Tipo de elemento desconocido." }, { status: 400 });
      }
      await recordAudit({ action: "RESTORE", entityType, entityId: originalId, summary: "Restaurado desde la papelera" });
      invalidateCache("erp:");
      return NextResponse.json(item);
    }
    switch (resource) {
      case "portal-tokens": {
        const portal = await prisma.clientPortalToken.findUnique({ where: { id } });
        if (!portal) return NextResponse.json({ error: "Acceso no encontrado." }, { status: 404 });
        if (action === "rotate") {
          const rawToken = randomBytes(32).toString("base64url");
          item = await prisma.clientPortalToken.update({
            where: { id },
            data: {
              tokenHash: createHash("sha256").update(rawToken).digest("hex"),
              tokenCiphertext: encryptString(rawToken),
              revokedAt: null,
              expiresAt: body.expiresAt === undefined ? portal.expiresAt : date(body.expiresAt),
              label: body.label === undefined ? portal.label : text(body.label) || "Portal principal",
            },
          });
          await recordAudit({ action: "ROTATE", entityType: "ClientPortalToken", entityId: id, summary: "Enlace del portal regenerado" });
          invalidateCache("erp:");
          return NextResponse.json({ ...item, token: rawToken, portalUrl: `/portal/${rawToken}` });
        }
        item = await prisma.clientPortalToken.update({
          where: { id },
          data: {
            label: body.label === undefined ? undefined : text(body.label) || "Portal principal",
            expiresAt: body.expiresAt === undefined ? undefined : date(body.expiresAt),
            projectId: body.projectId === undefined
              ? undefined
              : (await assertProjectBelongsToClient(text(body.projectId) || null, portal.clientId))?.id ?? null,
            revokedAt: action === "revoke" ? new Date() : action === "restore" ? null : undefined,
          },
        });
        break;
      }
      case "clients":
        item = await prisma.client.update({ where: { id }, data: {
          name: body.name === undefined ? undefined : text(body.name),
          company: body.company === undefined ? undefined : text(body.company) || null,
          email: body.email === undefined ? undefined : text(body.email) || null,
          phone: body.phone === undefined ? undefined : text(body.phone) || null,
          taxId: body.taxId === undefined ? undefined : text(body.taxId) || null,
          address: body.address === undefined ? undefined : text(body.address) || null,
          website: body.website === undefined ? undefined : text(body.website) || null,
          status: body.status === undefined ? undefined : text(body.status),
          notes: body.notes === undefined ? undefined : text(body.notes) || null,
        } });
        break;
      case "opportunities": {
        if (action === "convert") {
          if (!canManage(user)) return NextResponse.json({ error: "Sin permisos comerciales." }, { status: 403 });
          const accepted = await prisma.quote.findFirst({ where: { opportunityId: id, status: "Aprobada", deletedAt: null }, orderBy: { approvedAt: "desc" } });
          if (!accepted) throw new CommercialError("Prepara y acepta una propuesta antes de convertir la oportunidad.");
          return NextResponse.json(await convertQuote(accepted.id, undefined, { name: user.name, userId: user.id, origin: "INTERNAL" }));
        }
        item = await prisma.opportunity.update({ where: { id }, data: {
          clientId: body.clientId === undefined ? undefined : text(body.clientId) || null,
          name: body.name === undefined ? undefined : text(body.name),
          company: body.company === undefined ? undefined : text(body.company) || null,
          contactName: body.contactName === undefined ? undefined : text(body.contactName) || null,
          email: body.email === undefined ? undefined : text(body.email) || null,
          phone: body.phone === undefined ? undefined : text(body.phone) || null,
          stage: body.stage === undefined ? undefined : text(body.stage),
          source: body.source === undefined ? undefined : text(body.source),
          value: body.value === undefined ? undefined : number(body.value),
          probability: body.probability === undefined ? undefined : number(body.probability),
          expectedClose: body.expectedClose === undefined ? undefined : date(body.expectedClose),
          owner: body.owner === undefined ? undefined : text(body.owner) || null,
          nextAction: body.nextAction === undefined ? undefined : text(body.nextAction) || null,
          lostReason: body.lostReason === undefined ? undefined : text(body.lostReason) || null,
          notes: body.notes === undefined ? undefined : text(body.notes) || null,
        } });
        break;
      }
      case "activities":
        item = await prisma.crmActivity.update({ where: { id }, data: {
          completedAt: body.completed === true ? new Date() : body.completed === false ? null : undefined,
          subject: body.subject === undefined ? undefined : text(body.subject),
          details: body.details === undefined ? undefined : text(body.details) || null,
          dueAt: body.dueAt === undefined ? undefined : date(body.dueAt),
        } });
        break;
      case "quotes": {
        if (!canManage(user)) return NextResponse.json({ error: "Sin permisos comerciales." }, { status: 403 });
        return NextResponse.json(await quoteCommand(id, body, { name: user.name, userId: user.id, origin: "INTERNAL" }));
      }
      case "team":
        item = await prisma.teamMember.update({ where: { id }, data: {
          name: body.name === undefined ? undefined : text(body.name),
          email: body.email === undefined ? undefined : text(body.email) || null,
          role: body.role === undefined ? undefined : text(body.role),
          weeklyCapacity: body.weeklyCapacity === undefined ? undefined : number(body.weeklyCapacity),
          hourlyCost: body.hourlyCost === undefined ? undefined : number(body.hourlyCost),
          billableRate: body.billableRate === undefined ? undefined : number(body.billableRate),
          monthlySalary: body.monthlySalary === undefined ? undefined : number(body.monthlySalary),
          active: body.active === undefined ? undefined : Boolean(body.active),
        } });
        break;
      case "time-entries":
        item = await prisma.timeEntry.update({ where: { id }, data: {
          description: body.description === undefined ? undefined : text(body.description),
          date: body.date === undefined ? undefined : date(body.date) ?? undefined,
          hours: body.hours === undefined ? undefined : number(body.hours),
          billable: body.billable === undefined ? undefined : Boolean(body.billable),
          approved: body.approved === undefined ? undefined : Boolean(body.approved),
        } });
        break;
      case "expenses":
        item = await prisma.expense.update({ where: { id }, data: {
          status: body.status === undefined ? undefined : text(body.status),
          description: body.description === undefined ? undefined : text(body.description),
          amount: body.amount === undefined ? undefined : number(body.amount),
          date: body.date === undefined ? undefined : date(body.date) ?? undefined,
          notes: body.notes === undefined ? undefined : text(body.notes) || null,
        } });
        break;
      case "contracts":
        item = await prisma.supportContract.update({ where: { id }, data: {
          status: body.status === undefined ? undefined : text(body.status),
          monthlyAmount: body.monthlyAmount === undefined ? undefined : number(body.monthlyAmount),
          includedHours: body.includedHours === undefined ? undefined : number(body.includedHours),
          responseHours: body.responseHours === undefined ? undefined : number(body.responseHours),
          resolutionHours: body.resolutionHours === undefined ? undefined : number(body.resolutionHours),
          endDate: body.endDate === undefined ? undefined : date(body.endDate),
          autoRenew: body.autoRenew === undefined ? undefined : Boolean(body.autoRenew),
        } });
        break;
      case "tickets": {
        const status = body.status === undefined ? undefined : text(body.status);
        item = await prisma.supportTicket.update({ where: { id }, data: {
          status,
          priority: body.priority === undefined ? undefined : text(body.priority),
          assignee: body.assignee === undefined ? undefined : text(body.assignee) || null,
          resolvedAt: status === "Resuelto" ? new Date() : undefined,
          closedAt: status === "Cerrado" ? new Date() : undefined,
        } });
        break;
      }
      case "approvals": {
        if (!canManage(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
        return NextResponse.json(await decideApproval(id, text(body.status), text(body.feedback), { name: user.name, userId: user.id, origin: "INTERNAL" }));
      }
      case "notifications":
        item = await prisma.notification.update({ where: { id }, data: { readAt: body.read === false ? null : new Date() } });
        break;
      case "automations":
        item = await prisma.automationRule.update({ where: { id }, data: {
          active: body.active === undefined ? undefined : Boolean(body.active),
          name: body.name === undefined ? undefined : text(body.name),
          config: body.config && typeof body.config === "object" ? body.config : undefined,
        } });
        break;
      case "users":
        if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo administración puede cambiar roles." }, { status: 403 });
        item = await prisma.userProfile.update({ where: { id }, data: {
          role: body.role === undefined ? undefined : text(body.role),
          active: body.active === undefined ? undefined : Boolean(body.active),
        } });
        break;
      case "purchase-orders": {
        const status = body.status === undefined ? undefined : text(body.status);
        item = await prisma.purchaseOrder.update({ where: { id }, data: {
          status,
          approvedBy: status === "Aprobada" ? user.name : undefined,
          approvedAt: status === "Aprobada" ? new Date() : undefined,
          receivedAt: status === "Recibida" ? new Date() : undefined,
        } });
        if (status === "Recibida") {
          const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true, supplier: true } });
          if (order) {
            const amount = order.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * (1 + order.taxRate / 100);
            const existing = await prisma.expense.findFirst({ where: { notes: { contains: order.number } } });
            if (!existing) await prisma.expense.create({ data: { supplierId: order.supplierId, projectId: order.projectId, description: `Orden de compra ${order.number}`, category: "Compras", amount, taxAmount: amount - amount / (1 + order.taxRate / 100), date: new Date(), status: "Pendiente", notes: `Generado desde ${order.number}` } });
          }
        }
        break;
      }
      case "assets":
        item = await prisma.asset.update({ where: { id }, data: {
          status: body.status === undefined ? undefined : text(body.status),
          assignedToId: body.assignedToId === undefined ? undefined : text(body.assignedToId) || null,
          renewalDate: body.renewalDate === undefined ? undefined : date(body.renewalDate),
          location: body.location === undefined ? undefined : text(body.location) || null,
          notes: body.notes === undefined ? undefined : text(body.notes) || null,
        } });
        break;
      case "payroll": {
        const status = text(body.status);
        item = await prisma.payrollPeriod.update({ where: { id }, data: { status, paymentDate: status === "Pagada" ? new Date() : undefined } });
        if (status === "Pagada") await prisma.payrollEntry.updateMany({ where: { periodId: id }, data: { status: "Pagado", paidAt: new Date() } });
        break;
      }
      case "payroll-entries": {
        const baseSalary = body.baseSalary === undefined ? undefined : number(body.baseSalary);
        const bonuses = body.bonuses === undefined ? undefined : number(body.bonuses);
        const deductions = body.deductions === undefined ? undefined : number(body.deductions);
        const employerCost = body.employerCost === undefined ? undefined : number(body.employerCost);
        const current = await prisma.payrollEntry.findUnique({ where: { id } });
        if (!current) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
        item = await prisma.payrollEntry.update({ where: { id }, data: {
          baseSalary, bonuses, deductions, employerCost,
          netPay: (baseSalary ?? current.baseSalary) + (bonuses ?? current.bonuses) - (deductions ?? current.deductions),
          notes: body.notes === undefined ? undefined : text(body.notes) || null,
        } });
        break;
      }
      case "accounts":
        item = await prisma.account.update({ where: { id }, data: {
          name: body.name === undefined ? undefined : text(body.name),
          type: body.type === undefined ? undefined : text(body.type),
          active: body.active === undefined ? undefined : Boolean(body.active),
        } });
        break;
      case "journal": {
        const status = text(body.status);
        if (status === "Contabilizado") {
          const entry = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
          const debit = entry?.lines.reduce((sum, line) => sum + line.debit, 0) ?? 0;
          const credit = entry?.lines.reduce((sum, line) => sum + line.credit, 0) ?? 0;
          if (!entry || Math.abs(debit - credit) > .001) return NextResponse.json({ error: "El asiento no está balanceado." }, { status: 400 });
        }
        item = await prisma.journalEntry.update({ where: { id }, data: { status, postedAt: status === "Contabilizado" ? new Date() : null } });
        break;
      }
      default:
        return NextResponse.json({ error: "Recurso desconocido" }, { status: 404 });
    }

    await recordAudit({ action: "UPDATE", entityType: resource, entityId: item.id, summary: `Actualización en ${resource}` });
    invalidateCache("erp:");
    invalidateCache("project:");
    return NextResponse.json(item);
  } catch (error) {
    console.error(`[erp:${resource}:${id}:patch]`, error);
    return commercialFailure(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { resource, id } = await params;
  const financialResources = ["expenses", "payments", "suppliers", "purchase-orders", "payroll", "accounts", "journal"];
  if (financialResources.includes(resource) ? !canManageFinance(user) : !canManage(user)) {
    return NextResponse.json({ error: "No tienes permiso para eliminar este registro." }, { status: 403 });
  }
  try {
    switch (resource) {
      case "clients": await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "contacts": await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "opportunities": await prisma.opportunity.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "quotes": await archiveQuote(id, { name: user.name, userId: user.id, origin: "INTERNAL" }); break;
      case "team": await prisma.teamMember.update({ where: { id }, data: { deletedAt: new Date(), active: false } }); break;
      case "time-entries": await prisma.timeEntry.delete({ where: { id } }); break;
      case "assignments": await prisma.projectAssignment.delete({ where: { id } }); break;
      case "absences": await prisma.teamAbsence.delete({ where: { id } }); break;
      case "suppliers": await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "expenses": await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "payments": throw new CommercialError("Los pagos son evidencia financiera y no se eliminan. Se requiere una corrección contable formal.");
      case "contracts": await prisma.supportContract.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "tickets": await prisma.supportTicket.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "approvals": throw new CommercialError("Las aprobaciones se conservan como historial; crea una nueva solicitud para revisar el entregable.");
      case "automations": await prisma.automationRule.delete({ where: { id } }); break;
      case "purchase-orders": await prisma.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "assets": await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "payroll": await prisma.payrollPeriod.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "accounts": await prisma.account.update({ where: { id }, data: { active: false } }); break;
      case "journal": await prisma.journalEntry.delete({ where: { id } }); break;
      default: return NextResponse.json({ error: "Recurso desconocido" }, { status: 404 });
    }

    await recordAudit({ action: "DELETE", entityType: resource, entityId: id, summary: `Enviado a papelera desde ${resource}` });
    invalidateCache("erp:");
    invalidateCache("project:");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[erp:${resource}:${id}:delete]`, error);
    return commercialFailure(error);
  }
}
