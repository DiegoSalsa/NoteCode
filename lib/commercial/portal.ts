import { invoiceOrigin } from "./invoice-origin";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicQuote, quoteInclude } from "./quotes";

export async function resolvePortal(rawToken: string) {
  const access = await prisma.clientPortalToken.findUnique({
    where: { tokenHash: createHash("sha256").update(rawToken).digest("hex") },
    include: {
      client: true,
      project: {
        select: { id: true, clientId: true, visibility: true, deletedAt: true },
      },
    },
  });
  if (
    !access ||
    access.revokedAt ||
    (access.expiresAt && access.expiresAt <= new Date()) ||
    access.client.deletedAt
  )
    return null;
  if (
    access.projectId &&
    (!access.project ||
      access.project.deletedAt ||
      access.project.visibility !== "COMPANY" ||
      access.project.clientId !== access.clientId)
  )
    return null;
  return access;
}
export type PortalAccess = NonNullable<
  Awaited<ReturnType<typeof resolvePortal>>
>;
export function portalQuoteWhere(
  access: Pick<PortalAccess, "clientId" | "projectId">,
) {
  return {
    AND: [
      {
        OR: [
          { sentAt: { not: null } },
          {
            calculationVersion: 0,
            status: { in: ["Enviada", "Aprobada", "Rechazada"] },
          },
        ],
      },
    ],
    clientId: access.clientId,
    deletedAt: null,
    status: {
      in: [
        "Enviada",
        "Aprobada",
        "Cambios solicitados",
        "Rechazada",
        "Vencida",
        "Reemplazada",
      ],
    },
    ...(access.projectId ? { projectId: access.projectId } : {}),
    OR: [
      { projectId: null },
      {
        project: {
          clientId: access.clientId,
          deletedAt: null,
          visibility: "COMPANY",
        },
      },
    ],
  };
}

// Positive field selection is the security boundary. Never serialize Prisma records wholesale here.
export async function portalData(access: PortalAccess) {
  const activeProject = {
    clientId: access.clientId,
    deletedAt: null,
    visibility: "COMPANY",
    ...(access.projectId ? { id: access.projectId } : {}),
  };
  const [projects, invoices, tickets, quotes] = await Promise.all([
    prisma.project.findMany({
      where: activeProject,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        startDate: true,
        targetDate: true,
        updatedAt: true,
        tasks: {
          where: { clientVisible: true, deletedAt: null },
          select: { id: true, title: true, status: true, dueDate: true },
          orderBy: { updatedAt: "desc" },
        },
        requirements: {
          where: { clientVisible: true, deletedAt: null },
          select: { id: true, description: true, completed: true },
          orderBy: { updatedAt: "desc" },
        },
        documents: {
          where: { clientVisible: true, deletedAt: null },
          select: {
            id: true,
            name: true,
            category: true,
            size: true,
            updatedAt: true,
          },
        },
        approvals: {
          select: {
            id: true,
            title: true,
            type: true,
            description: true,
            status: true,
            feedback: true,
          },
          orderBy: { requestedAt: "desc" },
        },
        currentAgreement: {
          select: {
            id: true,
            currency: true,
            netAmount: true,
            taxAmount: true,
            totalAmount: true,
            milestones: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                title: true,
                amount: true,
                dueDate: true,
                status: true,
                invoice: { select: { id: true, number: true, status: true } },
              },
            },
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { not: "Cancelado" },
        ...(access.projectId ? { projectId: access.projectId } : {}),
        AND: [
          {
            OR: [
              { clientId: access.clientId },
              { clientId: null, project: activeProject },
            ],
          },
          { OR: [{ projectId: null }, { project: activeProject }] },
        ],
      },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        number: true,
        projectId: true,
        amount: true,
        netAmount: true,
        currency: true,
        status: true,
        dueDate: true,
        documentKind: true,
        contractId: true,
        agreementId: true,
        billingMilestoneId: true,
        externalReference: true,
        source: true,
        notes: true,
        payments: {
          select: { amount: true, currency: true, paidAt: true },
          orderBy: { paidAt: "desc" },
        },
      },
    }),
    prisma.supportTicket.findMany({
      where: {
        clientId: access.clientId,
        deletedAt: null,
        ...(access.projectId ? { projectId: access.projectId } : {}),
        OR: [{ projectId: null }, { project: activeProject }],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        status: true,
        priority: true,
        updatedAt: true,
        comments: {
          where: { isPublic: true },
          select: { id: true, author: true, body: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.quote.findMany({
      where: portalQuoteWhere(access),
      orderBy: { createdAt: "desc" },
      include: quoteInclude,
    }),
  ]);
  return {
    client: {
      id: access.client.id,
      name: access.client.name,
      company: access.client.company,
    },
    projects,
    invoices: invoices.map((i) => {
      const {
        contractId: _contract,
        agreementId: _agreement,
        billingMilestoneId: _milestone,
        externalReference: _ref,
        source: _source,
        notes: _notes,
        ...visible
      } = i;
      return { ...visible, origin: invoiceOrigin(i) };
    }),
    tickets,
    quotes: quotes.map(publicQuote),
  };
}
