import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { allocatePlan, quoteTotals, type PaymentPlan } from "./money";
import {
  canTransition,
  quoteFields,
  quotePatch,
  paymentPlanSchema,
} from "./validation";
import {
  audit,
  assertPortalActor,
  lock,
  requireCommercial,
  transaction,
  type Actor,
  type Tx,
} from "./transaction";

export const quoteInclude = {
  client: { select: { id: true, name: true, company: true, email: true } },
  items: { orderBy: { sortOrder: "asc" as const } },
  decisions: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.QuoteInclude;
export type LoadedQuote = Prisma.QuoteGetPayload<{
  include: typeof quoteInclude;
}>;
export function proposalSnapshot(quote: LoadedQuote) {
  const snapshot = {
    id: quote.id,
    number: quote.number,
    version: quote.version,
    title: quote.title,
    currency: quote.currency,
    calculationVersion: quote.calculationVersion,
    taxRate: quote.taxRate,
    discount: quote.discount,
    scope: quote.scope,
    terms: quote.terms,
    validUntil: quote.validUntil?.toISOString() ?? null,
    client: quote.client,
    paymentPlan: quote.paymentPlan,
    items: quote.items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    totals: quoteTotals(
      quote.items,
      quote.discount,
      quote.taxRate,
      quote.currency,
      quote.calculationVersion,
    ),
  };
  return snapshot;
}
export function quoteHash(quote: LoadedQuote) {
  return (
    quote.contentHash ??
    createHash("sha256")
      .update(JSON.stringify(proposalSnapshot(quote)))
      .digest("hex")
  );
}
export function publicQuote(quote: LoadedQuote) {
  const snapshot = quote.publishedSnapshot
    ? (quote.publishedSnapshot as unknown as ReturnType<
        typeof proposalSnapshot
      >)
    : proposalSnapshot(quote);
  return {
    ...snapshot,
    status:
      quote.status === "Enviada" &&
      quote.validUntil &&
      quote.validUntil < new Date()
        ? "Vencida"
        : quote.status,
    createdAt: quote.createdAt.toISOString(),
    contentHash: quoteHash(quote),
    decisions: quote.decisions.map((d) => ({
      status: d.status,
      feedback: d.feedback,
      createdAt: d.createdAt.toISOString(),
      origin: d.origin,
    })),
  };
}

async function load(tx: Tx, id: string) {
  const quote = await tx.quote.findUnique({
    where: { id, deletedAt: null },
    include: quoteInclude,
  });
  requireCommercial(quote, "Propuesta no encontrada.", 404);
  return quote;
}
async function lockedQuote(tx: Tx, id: string) {
  const initial = await load(tx, id);
  if (initial.projectId) await lock(tx, "projects", initial.projectId);
  if (initial.opportunityId)
    await lock(tx, "opportunities", initial.opportunityId);
  await lock(tx, "quotes", initial.parentQuoteId ?? initial.id);
  return load(tx, id);
}
async function validateLinks(
  tx: Tx,
  clientId: string,
  projectId?: string | null,
  opportunityId?: string | null,
) {
  requireCommercial(
    await tx.client.findFirst({ where: { id: clientId, deletedAt: null } }),
    "Cliente no encontrado.",
    400,
  );
  if (projectId)
    requireCommercial(
      await tx.project.findFirst({
        where: {
          id: projectId,
          clientId,
          deletedAt: null,
          visibility: "COMPANY",
        },
      }),
      "El proyecto no pertenece al cliente o no es comercial.",
      400,
    );
  if (opportunityId) {
    const opportunity = await tx.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null },
    });
    requireCommercial(
      opportunity && opportunity.clientId === clientId,
      "La oportunidad no pertenece al cliente.",
      400,
    );
    requireCommercial(
      !projectId ||
        !opportunity.convertedProjectId ||
        opportunity.convertedProjectId === projectId,
      "La oportunidad ya tiene otro proyecto.",
    );
  }
}

export async function proposalPrefill(input: {
  projectId?: string;
  opportunityId?: string;
}) {
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, visibility: "COMPANY", deletedAt: null },
      include: {
        currentAgreement: { include: { quote: { include: quoteInclude } } },
      },
    });
    requireCommercial(
      project?.clientId,
      "Se necesita un proyecto de empresa con cliente.",
      400,
    );
    const accepted = project.currentAgreement?.quote;
    return {
      projectId: project.id,
      clientId: project.clientId,
      title: project.name,
      currency: accepted?.currency ?? project.currency,
      scope: accepted?.scope ?? project.scope ?? project.description ?? "",
      taxRate: accepted?.taxRate ?? Number(project.saleTaxRate ?? 19),
      discount: accepted?.discount ?? 0,
      terms: accepted?.terms ?? project.commercialTerms ?? "",
      paymentPlan: accepted?.paymentPlan ?? { kind: "SINGLE" },
      items: accepted?.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })) ?? [
        {
          description: project.name,
          quantity: 1,
          unitPrice: Number(project.saleNetAmount ?? 0),
        },
      ],
      requiresPriceReview: !accepted && project.saleNetAmount === null,
      historicalAmount: project.agreedAmount,
    };
  }
  requireCommercial(
    input.opportunityId,
    "Selecciona proyecto u oportunidad.",
    400,
  );
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, deletedAt: null },
  });
  requireCommercial(opportunity, "Oportunidad no encontrada.", 404);
  return {
    opportunityId: opportunity.id,
    projectId: opportunity.convertedProjectId,
    clientId: opportunity.clientId ?? "",
    title: opportunity.name,
    currency: "CLP",
    scope: "",
    taxRate: 19,
    discount: 0,
    terms: "",
    paymentPlan: { kind: "SINGLE" },
    items: [
      {
        description: opportunity.name,
        quantity: 1,
        unitPrice: opportunity.value,
      },
    ],
    requiresPriceReview: true,
    historicalAmount: opportunity.value,
  };
}

export async function createQuote(raw: Record<string, unknown>, actor: Actor) {
  return transaction(async (tx) => {
    let clientId =
      typeof raw.clientId === "string" && raw.clientId ? raw.clientId : null;
    let projectId =
      typeof raw.projectId === "string" && raw.projectId ? raw.projectId : null;
    const opportunityId =
      typeof raw.opportunityId === "string" && raw.opportunityId
        ? raw.opportunityId
        : null;
    if (opportunityId) {
      await lock(tx, "opportunities", opportunityId);
      const opportunity = await tx.opportunity.findFirst({
        where: { id: opportunityId, deletedAt: null },
      });
      requireCommercial(opportunity, "Oportunidad no encontrada.", 404);
      if (opportunity.convertedProjectId) {
        requireCommercial(
          !projectId || projectId === opportunity.convertedProjectId,
          "La oportunidad ya tiene otro proyecto.",
        );
        projectId = opportunity.convertedProjectId;
      }
      if (!opportunity.clientId) {
        const client = clientId
          ? await tx.client.findFirst({
              where: { id: clientId, deletedAt: null },
            })
          : await tx.client.create({
              data: {
                name:
                  opportunity.contactName ||
                  opportunity.company ||
                  opportunity.name,
                company: opportunity.company,
                email: opportunity.email,
                phone: opportunity.phone,
              },
            });
        requireCommercial(client, "Cliente no encontrado.", 400);
        await tx.opportunity.update({
          where: { id: opportunityId },
          data: { clientId: client.id },
        });
        clientId = client.id;
      } else {
        requireCommercial(
          !clientId || clientId === opportunity.clientId,
          "Cliente incompatible con la oportunidad.",
          400,
        );
        clientId = opportunity.clientId;
      }
    }
    const data = quoteFields.parse({
      ...raw,
      currency: raw.currency ?? "CLP",
      taxRate: raw.taxRate ?? 19,
      discount: raw.discount ?? 0,
      paymentPlan: raw.paymentPlan ?? { kind: "SINGLE" },
      clientId,
      projectId,
      opportunityId,
    });
    requireCommercial(
      raw.status === undefined || raw.status === "Borrador",
      "Crea el borrador antes de publicarlo.",
      400,
    );
    await validateLinks(tx, data.clientId, data.projectId, data.opportunityId);
    const totals = quoteTotals(
      data.items,
      data.discount,
      data.taxRate,
      data.currency,
    );
    requireCommercial(
      totals.total > 0,
      "El precio propuesto debe ser positivo.",
      400,
    );
    allocatePlan(totals.net, totals.tax, data.currency, data.paymentPlan);
    const { items, ...fields } = data;
    const quote = await tx.quote.create({
      data: {
        ...fields,
        validUntil: fields.validUntil
          ? new Date(fields.validUntil)
          : fields.validUntil,
        calculationVersion: 1,
        number: `COT-${new Date().getFullYear()}-${randomUUID().slice(0, 12).toUpperCase()}`,
        items: {
          create: items.map((line, sortOrder) => ({ ...line, sortOrder })),
        },
      },
      include: quoteInclude,
    });
    await audit(tx, actor, "CREATE", "Quote", quote.id);
    return quote;
  });
}

export async function editQuote(
  id: string,
  raw: Record<string, unknown>,
  actor: Actor,
) {
  const data = quotePatch.parse(raw);
  return transaction(async (tx) => {
    const quote = await lockedQuote(tx, id);
    requireCommercial(
      quote.status === "Borrador",
      "La propuesta publicada es inmutable. Crea una revisión.",
    );
    requireCommercial(
      data.editVersion === quote.editVersion,
      "El borrador cambió en otra sesión. Recarga antes de guardar.",
    );
    requireCommercial(
      data.opportunityId === undefined ||
        data.opportunityId === quote.opportunityId,
      "No se puede cambiar el origen de la propuesta.",
    );
    await validateLinks(
      tx,
      data.clientId ?? quote.clientId,
      data.projectId === undefined ? quote.projectId : data.projectId,
      quote.opportunityId,
    );
    const totals = quoteTotals(
      data.items ?? quote.items,
      data.discount ?? quote.discount,
      data.taxRate ?? quote.taxRate,
      data.currency ?? quote.currency,
      1,
    );
    requireCommercial(
      totals.total > 0,
      "El precio propuesto debe ser positivo.",
      400,
    );
    allocatePlan(
      totals.net,
      totals.tax,
      data.currency ?? quote.currency,
      paymentPlanSchema.parse(data.paymentPlan ?? quote.paymentPlan),
    );
    const { items, editVersion: _version, ...fields } = data;
    if (items) await tx.quoteItem.deleteMany({ where: { quoteId: id } });
    const updated = await tx.quote.update({
      where: { id },
      data: {
        ...fields,
        validUntil: fields.validUntil
          ? new Date(fields.validUntil)
          : fields.validUntil,
        calculationVersion: 1,
        editVersion: { increment: 1 },
        items: items
          ? { create: items.map((line, sortOrder) => ({ ...line, sortOrder })) }
          : undefined,
      },
      include: quoteInclude,
    });
    await audit(tx, actor, "EDIT_DRAFT", "Quote", id);
    return updated;
  });
}

export async function reviseQuote(id: string, actor: Actor) {
  return transaction(async (tx) => {
    const quote = await lockedQuote(tx, id);
    const rootId = quote.parentQuoteId ?? quote.id;
    const family = await tx.quote.findMany({
      where: { OR: [{ id: rootId }, { parentQuoteId: rootId }] },
      orderBy: { version: "desc" },
    });
    const draft = family.find((q) => q.status === "Borrador" && !q.deletedAt);
    if (draft) return load(tx, draft.id);
    const revision = await tx.quote.create({
      data: {
        number: `COT-${new Date().getFullYear()}-${randomUUID().slice(0, 12).toUpperCase()}`,
        parentQuoteId: rootId,
        version: family[0].version + 1,
        clientId: quote.clientId,
        projectId: quote.projectId,
        opportunityId: quote.opportunityId,
        title: quote.title,
        scope: quote.scope,
        currency: quote.currency,
        taxRate: quote.taxRate,
        discount: quote.discount,
        terms: quote.terms,
        notes: quote.notes,
        paymentPlan: quote.paymentPlan as Prisma.InputJsonValue,
        calculationVersion: quote.calculationVersion,
        // A revision needs a new validity date; never silently reuse an expired deadline.
        items: {
          create: quote.items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            sortOrder: i.sortOrder,
          })),
        },
      },
      include: quoteInclude,
    });
    await audit(tx, actor, "REVISE", "Quote", revision.id, { sourceId: id });
    return revision;
  });
}

export async function transitionQuote(
  id: string,
  status: string,
  expectedHash: string | undefined,
  feedback: string | undefined,
  actor: Actor,
  expectedEditVersion?: number,
) {
  return transaction(async (tx) => {
    let quote = await lockedQuote(tx, id);
    if (actor.origin === "PORTAL") {
      await assertPortalActor(tx, actor);
      requireCommercial(
        quote.clientId === actor.clientId &&
          (!actor.projectId || quote.projectId === actor.projectId),
        "Propuesta no encontrada.",
        404,
      );
      if (quote.projectId)
        requireCommercial(
          await tx.project.findFirst({
            where: {
              id: quote.projectId,
              clientId: actor.clientId,
              visibility: "COMPANY",
              deletedAt: null,
            },
          }),
          "Proyecto no disponible.",
          404,
        );
      requireCommercial(
        ["Aprobada", "Rechazada", "Cambios solicitados"].includes(status),
        "Decisión inválida.",
        400,
      );
    }
    requireCommercial(
      canTransition(quote.status, status),
      `No se permite pasar de ${quote.status} a ${status}.`,
    );
    if (["Aprobada", "Rechazada", "Cambios solicitados"].includes(status))
      requireCommercial(
        expectedHash && expectedHash === quoteHash(quote),
        "La propuesta cambió. Vuelve a visualizarla antes de responder.",
      );
    if (quote.status === status) return quote; // Idempotent response, no repeated effects.
    if (status === "Enviada") {
      requireCommercial(
        expectedEditVersion === quote.editVersion,
        "El borrador cambió. Recarga antes de publicar.",
      );
      requireCommercial(
        !quote.validUntil || quote.validUntil >= new Date(),
        "La propuesta ya venció.",
      );
      const rootId = quote.parentQuoteId ?? quote.id;
      const newer = await tx.quote.count({
        where: {
          parentQuoteId: rootId,
          version: { gt: quote.version },
          sentAt: { not: null },
        },
      });
      requireCommercial(!newer, "Hay una revisión posterior publicada.");
      const snapshot = proposalSnapshot(quote);
      const contentHash = createHash("sha256")
        .update(JSON.stringify(snapshot))
        .digest("hex");
      await tx.quote.updateMany({
        where: {
          id: { not: id },
          OR: [{ id: rootId }, { parentQuoteId: rootId }],
          status: { in: ["Borrador", "Enviada", "Cambios solicitados"] },
        },
        data: { status: "Reemplazada" },
      });
      quote = await tx.quote.update({
        where: { id },
        data: {
          status,
          sentAt: new Date(),
          contentHash,
          publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
        include: quoteInclude,
      });
    } else {
      if (["Aprobada", "Rechazada", "Cambios solicitados"].includes(status)) {
        requireCommercial(
          !quote.validUntil || quote.validUntil >= new Date(),
          "La propuesta venció.",
        );
        const rootId = quote.parentQuoteId ?? quote.id;
        const newer = await tx.quote.count({
          where: {
            parentQuoteId: rootId,
            version: { gt: quote.version },
            sentAt: { not: null },
          },
        });
        requireCommercial(!newer, "Hay una revisión posterior publicada.");
        const snapshot = proposalSnapshot(quote);
        quote = await tx.quote.update({
          where: { id },
          data: {
            contentHash: quoteHash(quote),
            publishedSnapshot:
              quote.publishedSnapshot ??
              (snapshot as unknown as Prisma.InputJsonValue),
          },
          include: quoteInclude,
        });
        await tx.quoteDecision.create({
          data: {
            quoteId: id,
            status,
            contentHash: quoteHash(quote),
            actor: actor.name,
            origin: actor.origin,
            portalTokenId: actor.portalTokenId,
            feedback: feedback?.trim().slice(0, 10_000) || null,
          },
        });
      }
      if (status === "Aprobada") await acceptAgreement(tx, quote);
      quote = await tx.quote.update({
        where: { id },
        data: {
          status,
          approvedAt: status === "Aprobada" ? new Date() : undefined,
          rejectedAt: status === "Rechazada" ? new Date() : undefined,
        },
        include: quoteInclude,
      });
    }
    await audit(tx, actor, status, "Quote", id, {
      contentHash: quoteHash(quote),
    });
    if (["Aprobada", "Rechazada", "Cambios solicitados"].includes(status))
      await tx.notification.create({
        data: {
          type: "quote",
          title: `${status}: ${quote.number}`,
          message: `${actor.name} respondió la revisión ${quote.version}.`,
          href: quote.projectId
            ? `/proyectos/${quote.projectId}`
            : "/erp?tab=cotizaciones",
        },
      });
    return quote;
  });
}

async function acceptAgreement(tx: Tx, quote: LoadedQuote) {
  // Old proposals can record the client's decision, but cannot invent a new tax agreement.
  // A reviewed revision using calculationVersion=1 establishes a billable agreement.
  if (quote.calculationVersion === 0) return;
  if (quote.projectId) {
    const current = await tx.project.findUnique({
      where: { id: quote.projectId },
      include: { currentAgreement: { include: { quote: true } } },
    });
    requireCommercial(
      current &&
        current.clientId === quote.clientId &&
        !current.deletedAt &&
        current.visibility === "COMPANY",
      "Proyecto no disponible.",
    );
    requireCommercial(
      !current.currentAgreement ||
        !current.currentAgreement.quote.sentAt ||
        (quote.sentAt && current.currentAgreement.quote.sentAt <= quote.sentAt),
      "Una propuesta posterior ya define el acuerdo del proyecto.",
    );
    const currencies = await tx.invoice.findMany({
      where: {
        projectId: quote.projectId,
        deletedAt: null,
        status: { not: "Cancelado" },
      },
      select: { currency: true },
    });
    requireCommercial(
      currencies.every((i) => i.currency === quote.currency),
      "No se puede cambiar moneda con cobros existentes.",
    );
  }
  const totals = quoteTotals(
    quote.items,
    quote.discount,
    quote.taxRate,
    quote.currency,
    quote.calculationVersion,
  );
  const agreement = await tx.commercialAgreement.create({
    data: {
      quoteId: quote.id,
      clientId: quote.clientId,
      projectId: quote.projectId,
      currency: quote.currency,
      netAmount: totals.net,
      taxAmount: totals.tax,
      totalAmount: totals.total,
      taxRate: quote.taxRate,
      terms: quote.terms,
      scope: quote.scope,
      contentHash: quoteHash(quote),
    },
  });
  if (quote.projectId) {
    await tx.billingMilestone.updateMany({
      where: {
        agreement: { projectId: quote.projectId },
        invoice: null,
        status: "Planned",
      },
      data: { status: "Superseded" },
    });
    await tx.project.update({
      where: { id: quote.projectId },
      data: {
        currentAgreementId: agreement.id,
        agreedAmount: totals.total,
        currency: quote.currency,
      },
    });
  }
  const priorInvoices = quote.projectId
    ? await tx.invoice.count({
        where: {
          projectId: quote.projectId,
          deletedAt: null,
          status: { not: "Cancelado" },
        },
      })
    : 0;
  // Historical or already-billed projects need an explicit reconciliation, never an automatic second charge.
  if (!priorInvoices && quote.calculationVersion === 1) {
    const milestones = allocatePlan(
      totals.net,
      totals.tax,
      quote.currency,
      paymentPlanSchema.parse(quote.paymentPlan) as PaymentPlan,
    );
    await tx.billingMilestone.createMany({
      data: milestones.map((m) => ({ ...m, agreementId: agreement.id })),
    });
  }
  if (quote.opportunityId)
    await tx.opportunity.update({
      where: { id: quote.opportunityId },
      data: { stage: "Ganado", probability: 100 },
    });
}

export async function convertQuote(
  id: string,
  targetProjectId: string | undefined,
  actor: Actor,
) {
  return transaction(async (tx) => {
    const quote = await lockedQuote(tx, id);
    requireCommercial(
      quote.status === "Aprobada",
      "Primero debe aceptarse la versión publicada.",
    );
    const agreement = await tx.commercialAgreement.findUnique({
      where: { quoteId: id },
    });
    requireCommercial(
      agreement,
      "La propuesta histórica necesita una revisión aceptada para crear un nuevo acuerdo.",
    );
    const opportunity = quote.opportunityId
      ? await tx.opportunity.findUnique({ where: { id: quote.opportunityId } })
      : null;
    const root = await tx.quote.findUnique({
      where: { id: quote.parentQuoteId ?? id },
    });
    const existingId =
      quote.projectId ?? opportunity?.convertedProjectId ?? root?.projectId;
    requireCommercial(
      !existingId || !targetProjectId || existingId === targetProjectId,
      "La propuesta ya tiene proyecto.",
    );
    const projectId = existingId ?? targetProjectId;
    if (projectId) {
      await lock(tx, "projects", projectId);
      await validateLinks(tx, quote.clientId, projectId, quote.opportunityId);
      const previousInvoices = await tx.invoice.findMany({
        where: { projectId, deletedAt: null, status: { not: "Cancelado" } },
        select: { currency: true },
      });
      requireCommercial(
        previousInvoices.every((i) => i.currency === agreement.currency),
        "El proyecto tiene documentos en otra moneda.",
      );
      if (!quote.projectId && previousInvoices.length)
        await tx.billingMilestone.deleteMany({
          where: { agreementId: agreement.id, invoice: null },
        });
    }
    const project = projectId
      ? await tx.project.findUniqueOrThrow({ where: { id: projectId } })
      : await tx.project.create({
          data: {
            name: quote.title,
            description: quote.scope,
            scope: quote.scope,
            clientId: quote.clientId,
            status: "Planificado",
            currency: quote.currency,
            agreedAmount: Number(agreement.totalAmount),
            commercialTerms: agreement.terms,
          },
        });
    requireCommercial(
      !project.currentAgreementId ||
        project.currentAgreementId === agreement.id,
      "El proyecto ya tiene otro acuerdo vigente. Prepara una revisión vinculada al proyecto.",
    );
    await tx.quote.updateMany({
      where: {
        OR: [
          { id: quote.parentQuoteId ?? id },
          { parentQuoteId: quote.parentQuoteId ?? id },
        ],
      },
      data: { projectId: project.id },
    });
    await tx.commercialAgreement.update({
      where: { id: agreement.id },
      data: { projectId: project.id },
    });
    await tx.project.update({
      where: { id: project.id },
      data: {
        currentAgreementId: agreement.id,
        agreedAmount: Number(agreement.totalAmount),
        currency: agreement.currency,
      },
    });
    if (quote.opportunityId)
      await tx.opportunity.update({
        where: { id: quote.opportunityId },
        data: { convertedProjectId: project.id },
      });
    await audit(tx, actor, "CONVERT", "Quote", id, { projectId: project.id });
    return { quote: await load(tx, id), project };
  });
}

export async function archiveQuote(id: string, actor: Actor) {
  return transaction(async (tx) => {
    const quote = await lockedQuote(tx, id);
    requireCommercial(
      quote.status === "Borrador",
      "El historial publicado se conserva; no se puede eliminar.",
    );
    const result = await tx.quote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await audit(tx, actor, "ARCHIVE", "Quote", id);
    return result;
  });
}
