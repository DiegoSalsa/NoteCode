import { decideApproval } from "@/lib/commercial/approvals";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { transitionQuote, publicQuote } from "@/lib/commercial/quotes";
import { resolvePortal, portalData } from "@/lib/commercial/portal";
import { commercialFailure } from "@/lib/commercial/http";
import { invalidateCache } from "@/lib/server-cache";

function scopedProject(access: { projectId: string | null }) {
  return access.projectId ? { projectId: access.projectId } : {};
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const access = await resolvePortal(rawToken);
  if (!access) return NextResponse.json({ error: "Acceso inválido o vencido." }, { status: 404 });

  const previewRequested = new URL(request.url).searchParams.get("preview") === "1";
  const isPreview = previewRequested && Boolean(await getCurrentUser());
  await prisma.$transaction([
    prisma.portalAccessLog.create({
      data: {
        tokenId: access.id,
        isPreview,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: request.headers.get("user-agent"),
      },
    }),
    ...(isPreview
      ? []
      : [prisma.clientPortalToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } })]),
  ]);

  return NextResponse.json({ ...(await portalData(access)), portal: { label: access.label, lastUsedAt: access.lastUsedAt, isPreview, projectId: access.projectId } }, { headers: { "Cache-Control": "private, no-store" } });
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
      await decideApproval(String(body.approvalId), String(body.status), typeof body.feedback === "string" ? body.feedback : undefined, { name: access.client.name, origin: "PORTAL", portalTokenId: access.id, clientId: access.clientId, projectId: access.projectId });
      return NextResponse.json({ success: true });
    }

    if (action === "create-ticket") {
      const subject = String(body.subject ?? "").trim();
      const description = String(body.description ?? "").trim();
      if (!subject || !description) {
        return NextResponse.json({ error: "Asunto y descripción son obligatorios." }, { status: 400 });
      }
      const requestedProjectId = String(body.projectId ?? "").trim();
      if (access.projectId && requestedProjectId && requestedProjectId !== access.projectId) {
        return NextResponse.json({ error: "El proyecto no pertenece a este acceso." }, { status: 400 });
      }
      const effectiveProjectId = requestedProjectId || access.projectId;
      const project = effectiveProjectId
        ? await prisma.project.findFirst({
          where: { id: effectiveProjectId, clientId: access.clientId, visibility: "COMPANY", deletedAt: null },
          select: { id: true },
        })
        : null;
      if (effectiveProjectId && !project) {
        return NextResponse.json({ error: "El proyecto no pertenece a este portal." }, { status: 400 });
      }
      const count = await prisma.supportTicket.count();
      const ticket = await prisma.supportTicket.create({
        data: {
          number: `TKT-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
          clientId: access.clientId,
          projectId: project?.id ?? null,
          subject,
          description,
          requester: access.client.name,
          priority: String(body.priority ?? "Media"),
          responseDue: new Date(Date.now() + 24 * 3600000),
          resolutionDue: new Date(Date.now() + 72 * 3600000),
        },
      });
      await notify({
        type: "ticket",
        title: `Nuevo ticket ${ticket.number}`,
        message: ticket.subject,
        href: "/erp?tab=soporte",
        severity: ticket.priority === "Crítica" ? "critical" : "info",
      });
      invalidateCache("erp:");
      invalidateCache("project:");
      return NextResponse.json(ticket, { status: 201 });
    }

    if (action === "decide-quote") {
      const quote = await transitionQuote(String(body.quoteId), String(body.status), typeof body.contentHash === "string" ? body.contentHash : undefined, typeof body.feedback === "string" ? body.feedback : undefined, { name: access.client.name, origin: "PORTAL", portalTokenId: access.id, clientId: access.clientId, projectId: access.projectId });
      return NextResponse.json(publicQuote(quote));
    }

    if (action === "comment-ticket") {
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id: String(body.ticketId),
          clientId: access.clientId,
          deletedAt: null,
          OR: [{ projectId: null }, { project: { clientId: access.clientId, visibility: "COMPANY", deletedAt: null } }],
          ...scopedProject(access),
        },
      });
      if (!ticket) return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
      const commentBody = String(body.comment ?? "").trim();
      if (!commentBody) return NextResponse.json({ error: "La respuesta no puede estar vacía." }, { status: 400 });
      const comment = await prisma.ticketComment.create({
        data: { ticketId: ticket.id, author: access.client.name, body: commentBody, isPublic: true },
      });
      await notify({
        type: "ticket-comment",
        title: `Respuesta en ${ticket.number}`,
        message: `${access.client.name} agregó un comentario.`,
        href: "/erp?tab=soporte",
      });
      invalidateCache("erp:");
      invalidateCache("project:");
      return NextResponse.json(comment, { status: 201 });
    }

    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (error) {
    console.error("[portal:post]", error);
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
  }
}
