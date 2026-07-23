import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/audit";

async function resolvePortal(rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const token = await prisma.clientPortalToken.findUnique({
    where: { tokenHash },
    include: { client: true },
  });

  if (!token || token.revokedAt || (token.expiresAt && token.expiresAt < new Date()) || token.client.deletedAt) return null;
  await prisma.clientPortalToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  return token;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const access = await resolvePortal(rawToken);
  if (!access) return NextResponse.json({ error: "Acceso inválido o vencido." }, { status: 404 });

  const [projects, invoices, tickets, quotes] = await Promise.all([
    prisma.project.findMany({
      where: { clientId: access.clientId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, description: true, status: true, startDate: true, targetDate: true, updatedAt: true,
        tasks: { select: { id: true, title: true, status: true, dueDate: true }, orderBy: { updatedAt: "desc" } },
        requirements: { select: { id: true, description: true, completed: true }, orderBy: { updatedAt: "desc" } },
        documents: { where: { deletedAt: null }, select: { id: true, name: true, category: true, size: true, updatedAt: true } },
        approvals: { orderBy: { requestedAt: "desc" } },
      },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null, OR: [{ clientId: access.clientId }, { project: { clientId: access.clientId } }] },
      orderBy: { issuedAt: "desc" },
      include: { payments: { orderBy: { paidAt: "desc" } } },
    }),
    prisma.supportTicket.findMany({
      where: { clientId: access.clientId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { comments: { where: { isPublic: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.quote.findMany({
      where: { clientId: access.clientId, deletedAt: null, status: { not: "Borrador" } },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  return NextResponse.json({
    client: { id: access.client.id, name: access.client.name, company: access.client.company },
    projects,
    invoices,
    tickets,
    quotes,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const access = await resolvePortal(rawToken);
  if (!access) return NextResponse.json({ error: "Acceso inválido o vencido." }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");

  try {
    if (action === "decide-approval") {
      const status = String(body.status ?? "");
      if (!["Aprobado", "Rechazado", "Cambios solicitados"].includes(status)) {
        return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });
      }
      const approval = await prisma.clientApproval.findFirst({
        where: { id: String(body.approvalId), project: { clientId: access.clientId } },
      });
      if (!approval) return NextResponse.json({ error: "Aprobación no encontrada." }, { status: 404 });
      await prisma.clientApproval.update({
        where: { id: approval.id },
        data: { status, feedback: String(body.feedback ?? "").trim() || null, decidedAt: new Date(), decidedBy: access.client.name },
      });
      await notify({ type: "approval", title: `${status}: ${approval.title}`, message: `${access.client.name} respondió una aprobación.`, href: "/erp?tab=aprobaciones", severity: status === "Aprobado" ? "success" : "warning" });
      return NextResponse.json({ success: true });
    }

    if (action === "create-ticket") {
      const subject = String(body.subject ?? "").trim();
      const description = String(body.description ?? "").trim();
      if (!subject || !description) return NextResponse.json({ error: "Asunto y descripción son obligatorios." }, { status: 400 });
      const count = await prisma.supportTicket.count();
      const ticket = await prisma.supportTicket.create({
        data: {
          number: `TKT-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
          clientId: access.clientId,
          projectId: String(body.projectId ?? "") || null,
          subject,
          description,
          requester: access.client.name,
          priority: String(body.priority ?? "Media"),
          responseDue: new Date(Date.now() + 24 * 3600000),
          resolutionDue: new Date(Date.now() + 72 * 3600000),
        },
      });
      await notify({ type: "ticket", title: `Nuevo ticket ${ticket.number}`, message: ticket.subject, href: "/erp?tab=soporte", severity: ticket.priority === "Crítica" ? "critical" : "info" });
      return NextResponse.json(ticket, { status: 201 });
    }

    if (action === "decide-quote") {
      const quote = await prisma.quote.findFirst({ where: { id: String(body.quoteId), clientId: access.clientId, deletedAt: null } });
      if (!quote) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
      const status = String(body.status) === "Aprobada" ? "Aprobada" : "Rechazada";
      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status,
          approvedAt: status === "Aprobada" ? new Date() : null,
          rejectedAt: status === "Rechazada" ? new Date() : null,
          notes: String(body.feedback ?? "").trim() ? `${quote.notes ?? ""}\nFeedback cliente: ${String(body.feedback).trim()}`.trim() : quote.notes,
        },
      });
      await notify({ type: "quote", title: `${status}: ${quote.number}`, message: `${access.client.name} respondió la cotización ${quote.title}.`, href: "/erp?tab=cotizaciones", severity: status === "Aprobada" ? "success" : "warning" });
      return NextResponse.json({ success: true });
    }

    if (action === "comment-ticket") {
      const ticket = await prisma.supportTicket.findFirst({ where: { id: String(body.ticketId), clientId: access.clientId, deletedAt: null } });
      if (!ticket) return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
      const comment = await prisma.ticketComment.create({
        data: { ticketId: ticket.id, author: access.client.name, body: String(body.comment ?? "").trim(), isPublic: true },
      });
      await notify({ type: "ticket-comment", title: `Respuesta en ${ticket.number}`, message: `${access.client.name} agregó un comentario.`, href: "/erp?tab=soporte" });
      return NextResponse.json(comment, { status: 201 });
    }

    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (error) {
    console.error("[portal:post]", error);
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
  }
}
