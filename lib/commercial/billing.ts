import { invoicePaidAmount, invoiceOutstanding } from "./money";
import { projectEconomics } from "./economics";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
} from "@/lib/validation/invoice";
import { allocatePlan, minorUnits, fromMinor, type PaymentPlan } from "./money";
import { paymentPlanSchema } from "./validation";
import {
  audit,
  lock,
  requireCommercial,
  transaction,
  type Actor,
  type Tx,
} from "./transaction";

export async function projectCommercialSummary(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null, visibility: "COMPANY" },
    include: {
      timeEntries: {
        select: { hours: true, teamMember: { select: { hourlyCost: true } } },
      },
      expenses: { where: { deletedAt: null }, select: { amount: true } },
      currentAgreement: {
        include: {
          milestones: {
            orderBy: { position: "asc" },
            include: {
              invoice: {
                select: { id: true, number: true, amount: true, status: true },
              },
            },
          },
          quote: { select: { number: true, version: true } },
        },
      },
      invoices: {
        where: { deletedAt: null, status: { not: "Cancelado" } },
        select: {
          id: true,
          number: true,
          amount: true,
          netAmount: true,
          currency: true,
          status: true,
          dueDate: true,
          payments: { select: { amount: true, paidAt: true } },
        },
      },
    },
  });
  requireCommercial(project, "Proyecto no encontrado.", 404);
  const invoiced = project.invoices.reduce((s, i) => s + i.amount, 0);
  const collected = project.invoices.reduce(
    (sum, invoice) => sum + invoicePaidAmount(invoice),
    0,
  );

  return {
    economics: projectEconomics({
      ...project,
      acceptedNet: project.currentAgreement
        ? Number(project.currentAgreement.netAmount)
        : null,
    }),
    agreement: project.currentAgreement,
    invoices: project.invoices,
    totals: {
      accepted: project.currentAgreement
        ? Number(project.currentAgreement.totalAmount)
        : null,
      acceptedNet: project.currentAgreement
        ? Number(project.currentAgreement.netAmount)
        : null,
      invoiced,
      collected,
      outstanding: project.invoices.reduce(
        (sum, invoice) => sum + invoiceOutstanding(invoice),
        0,
      ),
      unbilled: project.currentAgreement
        ? Math.max(0, Number(project.currentAgreement.totalAmount) - invoiced)
        : null,
    },
    requiresReconciliation: Boolean(
      project.currentAgreement && !project.currentAgreement.milestones.length,
    ),
  };
}

export async function setBillingPlan(
  projectId: string,
  rawPlan: unknown,
  actor: Actor,
) {
  const plan = paymentPlanSchema.parse(rawPlan);
  return transaction(async (tx) => {
    await lock(tx, "projects", projectId);
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: {
        currentAgreement: {
          include: { milestones: { include: { invoice: true } } },
        },
        invoices: { where: { deletedAt: null, status: { not: "Cancelado" } } },
      },
    });
    requireCommercial(
      project?.currentAgreement && !project.deletedAt,
      "Se necesita un acuerdo vigente.",
    );
    const agreement = project.currentAgreement;
    requireCommercial(
      agreement.milestones.length === 0,
      "El plan aprobado se conserva. Crea una revisión comercial para cambiar sus condiciones.",
    );
    requireCommercial(
      !agreement.milestones.some((m) => m.invoice),
      "El plan ya tiene documentos emitidos. Conserva sus hitos y crea una revisión comercial para cambiarlo.",
    );
    requireCommercial(
      project.invoices.every(
        (i) => i.currency === agreement.currency && i.netAmount !== null,
      ),
      "Conciliación manual necesaria: hay documentos históricos sin neto o con otra moneda.",
    );
    const billedNet = project.invoices.reduce(
        (s, i) => s + Number(i.netAmount),
        0,
      ),
      billedTotal = project.invoices.reduce((s, i) => s + i.amount, 0);
    const net = Number(agreement.netAmount) - billedNet,
      tax = Number(agreement.taxAmount) - (billedTotal - billedNet);
    requireCommercial(
      net >= 0 && tax >= 0 && net + tax > 0,
      "No hay saldo positivo conciliado para planificar.",
    );
    const milestones = allocatePlan(
      net,
      tax,
      agreement.currency,
      plan as PaymentPlan,
    );
    await tx.billingMilestone.deleteMany({
      where: { agreementId: agreement.id, invoice: null },
    });
    await tx.billingMilestone.createMany({
      data: milestones.map((m) => ({ ...m, agreementId: agreement.id })),
    });
    await audit(
      tx,
      actor,
      "PLAN_PAYMENTS",
      "CommercialAgreement",
      agreement.id,
      { billedTotal },
    );
    return agreement;
  });
}

export async function issueMilestone(
  projectId: string,
  milestoneId: string,
  actor: Actor,
) {
  return transaction(async (tx) => {
    await lock(tx, "projects", projectId);
    const milestone = await tx.billingMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        invoice: true,
        agreement: { include: { project: true, client: true } },
      },
    });
    requireCommercial(
      milestone && milestone.agreement.projectId === projectId,
      "Hito no encontrado.",
      404,
    );
    if (milestone.invoice) return milestone.invoice;
    const agreement = milestone.agreement,
      project = agreement.project;
    requireCommercial(
      project &&
        !project.deletedAt &&
        project.visibility === "COMPANY" &&
        project.currentAgreementId === agreement.id &&
        milestone.status === "Planned",
      "El hito no pertenece al acuerdo vigente.",
    );
    requireCommercial(
      project.clientId === agreement.clientId && !agreement.client.deletedAt,
      "Cliente incompatible con el acuerdo.",
    );
    const prior = await tx.invoice.aggregate({
      where: { projectId, deletedAt: null, status: { not: "Cancelado" } },
      _sum: { amount: true },
    });
    requireCommercial(
      Number(prior._sum.amount ?? 0) + Number(milestone.amount) <=
        Number(agreement.totalAmount) + 0.00001,
      "La emisión excedería el precio aceptado del proyecto.",
    );
    const invoice = await tx.invoice.create({
      data: {
        number: `COB-${randomUUID().slice(0, 12).toUpperCase()}`,
        projectId,
        clientId: agreement.clientId,
        client: agreement.client.name,
        amount: Number(milestone.amount),
        netAmount: Number(milestone.netAmount),
        taxRate: Number(agreement.taxRate),
        currency: agreement.currency,
        dueDate: milestone.dueDate ?? new Date(Date.now() + 15 * 86400000),
        source: "PROJECT",
        documentKind: "INTERNAL",
        product: `${project.name} · ${milestone.title}`,
        agreementId: agreement.id,
        billingMilestoneId: milestone.id,
        externalReference: `milestone:${milestone.id}`,
      },
    });
    await audit(tx, actor, "ISSUE_INTERNAL_RECEIVABLE", "Invoice", invoice.id, {
      milestoneId,
      agreementId: agreement.id,
    });
    return invoice;
  });
}

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  requestKey: z.string().min(8).max(200),
  amount: z.number().finite().positive().max(9_999_999_999),
  currency: z.enum(["CLP", "USD", "EUR"]).optional(),
  paidAt: z.coerce.date(),
  method: z.string().trim().min(1).max(80).default("Transferencia"),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(3000).nullable().optional(),
});
export async function recordPayment(raw: unknown, actor: Actor) {
  const data = paymentSchema.parse(raw);
  return transaction(async (tx) => {
    await lock(tx, "invoices", data.invoiceId);
    const existing = await tx.payment.findUnique({
      where: { requestKey: data.requestKey },
    });
    if (existing) {
      requireCommercial(
        existing.invoiceId === data.invoiceId &&
          existing.amount === data.amount &&
          (!data.currency || existing.currency === data.currency) &&
          existing.paidAt.getTime() === data.paidAt.getTime() &&
          existing.method === data.method &&
          existing.reference === (data.reference || null) &&
          existing.notes === (data.notes || null),
        "La clave ya se usó para un pago distinto.",
      );
      return existing;
    }
    const invoice = await tx.invoice.findUnique({
      where: { id: data.invoiceId },
      include: { payments: true },
    });
    requireCommercial(
      invoice &&
        !invoice.deletedAt &&
        !["Cancelado", "Pagado"].includes(invoice.status),
      "Documento no disponible para registrar pagos.",
    );
    requireCommercial(
      !data.currency || invoice.currency === data.currency,
      "El pago debe usar la moneda del documento.",
      400,
    );
    const amount = minorUnits(data.amount, invoice.currency);
    const paid = invoice.payments.reduce(
      (sum, p) => sum + minorUnits(p.amount, invoice.currency),
      0n,
    );
    const total = minorUnits(invoice.amount, invoice.currency);
    requireCommercial(
      paid + amount <= total,
      "El pago excede el saldo pendiente.",
      400,
    );
    const payment = await tx.payment.create({
      data: {
        ...data,
        currency: invoice.currency,
        reference: data.reference || null,
        notes: data.notes || null,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: paid + amount === total ? "Pagado" : "Parcial",
        paidAt: paid + amount === total ? data.paidAt : null,
      },
    });
    await audit(tx, actor, "RECORD_PAYMENT", "Payment", payment.id, {
      invoiceId: invoice.id,
      amount: data.amount,
    });
    return payment;
  });
}

async function invoiceLinks(
  tx: Tx,
  clientId?: string | null,
  projectId?: string | null,
) {
  const client = clientId
    ? await tx.client.findFirst({ where: { id: clientId, deletedAt: null } })
    : null;
  if (clientId) requireCommercial(client, "Cliente no encontrado.", 400);
  if (projectId) {
    const project = await tx.project.findFirst({
      where: { id: projectId, visibility: "COMPANY", deletedAt: null },
    });
    requireCommercial(
      project && project.clientId === clientId,
      "El documento debe usar el cliente del proyecto.",
      400,
    );
  }
  return client;
}

export async function createInvoice(raw: unknown, actor: Actor) {
  const body = createInvoiceSchema.parse(raw);
  requireCommercial(
    !["Pagado", "Parcial"].includes(body.status),
    "Registra los pagos después de crear el documento.",
    400,
  );
  return transaction(async (tx) => {
    const client = await invoiceLinks(tx, body.clientId, body.projectId);
    if (body.projectId) {
      await lock(tx, "projects", body.projectId);
      const project = await tx.project.findUnique({
        where: { id: body.projectId },
      });
      requireCommercial(
        !project?.currentAgreementId,
        "El proyecto tiene acuerdo: emite el cobro desde sus hitos.",
      );
    }
    const amountMinor = minorUnits(body.amount, body.currency);
    const net =
      body.netAmount ??
      fromMinor(
        BigInt(Math.round(Number(amountMinor) / (1 + body.taxRate / 100))),
        body.currency,
      );
    requireCommercial(
      net <= body.amount,
      "El neto no puede exceder el total.",
      400,
    );
    const invoice = await tx.invoice.create({
      data: {
        ...body,
        client: client?.name ?? body.client,
        clientId: body.clientId || null,
        projectId: body.projectId || null,
        dueDate: new Date(body.dueDate),
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : new Date(),
        netAmount: net,
        documentKind: "INTERNAL",
      },
    });
    await audit(tx, actor, "CREATE_INTERNAL_RECEIVABLE", "Invoice", invoice.id);
    return invoice;
  });
}

export async function updateInvoice(id: string, raw: unknown, actor: Actor) {
  const body = updateInvoiceSchema.parse(raw);
  return transaction(async (tx) => {
    await lock(tx, "invoices", id);
    const current = await tx.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { payments: true },
    });
    requireCommercial(current, "Documento no encontrado.", 404);
    const immutable = [
      "amount",
      "netAmount",
      "taxRate",
      "currency",
      "clientId",
      "client",
      "projectId",
      "number",
      "source",
      "externalReference",
      "issuedAt",
    ] as const;
    const paid =
      current.payments.length > 0 ||
      current.status === "Pagado" ||
      current.paidAt !== null;
    const changed = immutable.some(
      (key) =>
        body[key] !== undefined &&
        (key === "issuedAt"
          ? new Date(body.issuedAt!).getTime() !== current.issuedAt.getTime()
          : (body[key] || null) !== (current[key] || null)),
    );
    requireCommercial(
      !(paid || current.billingMilestoneId || current.contractId) || !changed,
      "El documento conserva su importe, impuestos, cliente y origen. Los documentos con pagos o ligados a hitos/contratos son inmutables.",
    );
    requireCommercial(
      body.paidAt === undefined ||
        (body.paidAt ? new Date(body.paidAt).getTime() : null) ===
          (current.paidAt ? current.paidAt.getTime() : null),
      "La fecha de pago se obtiene de los pagos registrados.",
    );
    if (body.status && body.status !== current.status) {
      requireCommercial(
        !paid && !["Pagado", "Parcial"].includes(body.status),
        "El estado pagado se obtiene de los pagos y no puede alterarse manualmente.",
      );
      requireCommercial(
        !current.billingMilestoneId || body.status !== "Cancelado",
        "Un hito emitido requiere ajuste formal para cancelarse.",
      );
    }
    await invoiceLinks(
      tx,
      body.clientId === undefined ? current.clientId : body.clientId,
      body.projectId === undefined ? current.projectId : body.projectId,
    );
    const { paidAt: _paidAt, issuedAt, dueDate, ...fields } = body;
    if (body.amount !== undefined)
      minorUnits(body.amount, body.currency ?? current.currency);
    const netAmount =
      body.netAmount ??
      (body.amount !== undefined || body.taxRate !== undefined
        ? fromMinor(
            BigInt(
              Math.round(
                Number(
                  minorUnits(body.amount ?? current.amount, current.currency),
                ) /
                  (1 + (body.taxRate ?? current.taxRate) / 100),
              ),
            ),
            current.currency,
          )
        : undefined);
    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        ...fields,
        clientId:
          body.clientId === undefined ? undefined : body.clientId || null,
        projectId:
          body.projectId === undefined ? undefined : body.projectId || null,
        netAmount,
        issuedAt: issuedAt ? new Date(issuedAt) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    });
    await audit(tx, actor, "UPDATE", "Invoice", id);
    return invoice;
  });
}

export async function archiveInvoice(id: string, actor: Actor) {
  return transaction(async (tx) => {
    await lock(tx, "invoices", id);
    const invoice = await tx.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    requireCommercial(invoice, "Documento no encontrado.", 404);
    requireCommercial(
      !invoice.payments.length &&
        !invoice.paidAt &&
        invoice.status !== "Pagado" &&
        !invoice.billingMilestoneId &&
        !invoice.contractId,
      "El historial financiero con pagos, hitos o contratos debe conservarse.",
    );
    const result = await tx.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await audit(tx, actor, "ARCHIVE", "Invoice", id);
    return result;
  });
}

// The existing recurring contract engine calls this single period-aware operation.
export async function billContract(
  contractId: string,
  now: Date,
  actor: Actor,
) {
  return transaction(async (tx) => {
    await lock(tx, "support_contracts", contractId);
    const contract = await tx.supportContract.findUnique({
      where: { id: contractId },
      include: { client: true },
    });
    if (
      !contract ||
      contract.deletedAt ||
      contract.status !== "Activo" ||
      !contract.nextBillingAt ||
      contract.nextBillingAt > now ||
      (contract.endDate && contract.nextBillingAt > contract.endDate)
    )
      return null;
    await invoiceLinks(tx, contract.clientId, contract.projectId);
    const period = contract.nextBillingAt.toISOString().slice(0, 10);
    const reference = `contract:${contract.id}:${period}`;
    const oldNumber = `REC-${now.toISOString().slice(0, 7).replace("-", "")}-${contract.id.slice(0, 6).toUpperCase()}`;
    const legacy = await tx.invoice.findFirst({
      where: {
        number: oldNumber,
        projectId: contract.projectId,
        clientId: contract.clientId,
        amount: contract.monthlyAmount,
        notes: `Facturación recurrente: ${contract.name}`,
      },
    });
    const invoice =
      legacy ??
      (await tx.invoice.upsert({
        where: { externalReference: reference },
        update: {},
        create: {
          number: `REC-${period.replaceAll("-", "")}-${contract.id.slice(0, 12)}`,
          externalReference: reference,
          contractId,
          projectId: contract.projectId,
          clientId: contract.clientId,
          client: contract.client.name,
          amount: contract.monthlyAmount,
          netAmount: null,
          currency: "CLP",
          dueDate: new Date(now.getTime() + 15 * 86400000),
          product: contract.name,
          documentKind: "INTERNAL",
        },
      }));
    const next = new Date(contract.nextBillingAt),
      day = next.getUTCDate();
    const months =
      contract.billingCycle === "Anual"
        ? 12
        : contract.billingCycle === "Semestral"
          ? 6
          : contract.billingCycle === "Trimestral"
            ? 3
            : 1;
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
    await tx.supportContract.update({
      where: { id: contractId },
      data: { lastBilledAt: now, nextBillingAt: next },
    });
    await audit(
      tx,
      actor,
      "RECURRING_INTERNAL_RECEIVABLE",
      "Invoice",
      invoice.id,
    );
    return invoice;
  });
}
