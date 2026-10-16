import { randomBytes, randomUUID, createHash } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createQuote,
  editQuote,
  transitionQuote,
  convertQuote,
  proposalPrefill,
  reviseQuote,
  quoteInclude,
  quoteHash,
} from "./quotes";
import {
  recordPayment,
  issueMilestone,
  updateInvoice,
  projectCommercialSummary,
  archiveInvoice,
  setBillingPlan,
  billContract,
} from "./billing";
import { portalData, resolvePortal } from "./portal";
import { ensureProjectPortal } from "./project-portal";
import { projectPriceData } from "./project-price";
import { quoteTotals } from "./money";
import { syncProjectInvoice, resolveClientId } from "@/lib/projects";
import { decideApproval } from "./approvals";

const auth = vi.hoisted(() => ({
  user: { id: "test-owner", name: "Owner", role: "ADMIN" } as {
    id: string;
    name: string;
    role: string;
  } | null,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => auth.user,
  canManage: (u: { role: string }) => ["ADMIN", "MANAGER"].includes(u.role),
  canManageFinance: (u: { role: string }) =>
    ["ADMIN", "MANAGER", "FINANCE"].includes(u.role),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(), notify: vi.fn() }));
const actor = { name: "Owner", origin: "INTERNAL" as const };
const prefix = randomUUID();
async function fixture() {
  const client = await prisma.client.create({
    data: { name: `Test ${prefix}`, notes: "PRIVATE_CLIENT_SENTINEL" },
  });
  const project = await prisma.project.create({
    data: {
      name: "Web corporativa",
      description: "Descripción pública",
      scope: "Sitio corporativo accesible",
      clientId: client.id,
      budgetCost: 99000,
      ...projectPriceData({
        saleNetAmount: 380000,
        saleTaxRate: 19,
        commercialTerms: "50% anticipo y 50% entrega",
      }),
    },
  });
  return { client, project };
}
async function proposal(projectId?: string, clientId?: string) {
  const prefill = projectId
    ? await proposalPrefill({ projectId })
    : {
        clientId,
        title: "Oportunidad",
        currency: "CLP",
        taxRate: 19,
        discount: 0,
        items: [{ description: "Trabajo", quantity: 1, unitPrice: 380000 }],
      };
  return createQuote(
    {
      ...prefill,
      paymentPlan: { kind: "DEPOSIT_BALANCE", depositPercent: 50 },
      notes: "PRIVATE_QUOTE_SENTINEL",
    },
    actor,
  );
}
async function publish(id: string) {
  const q = await prisma.quote.findUniqueOrThrow({ where: { id } });
  return transitionQuote(
    id,
    "Enviada",
    undefined,
    undefined,
    actor,
    q.editVersion,
  );
}
async function accept(id: string) {
  const q = await publish(id);
  return transitionQuote(id, "Aprobada", quoteHash(q), undefined, actor);
}
async function token(clientId: string, projectId?: string) {
  const raw = randomBytes(32).toString("hex");
  const access = await prisma.clientPortalToken.create({
    data: {
      clientId,
      projectId,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
    },
  });
  return {
    raw,
    access,
    actor: {
      name: "Cliente",
      origin: "PORTAL" as const,
      portalTokenId: access.id,
      clientId,
      projectId,
    },
  };
}

describe("commercial integration on isolated PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());
  it("links an accepted opportunity to an existing billed project and reconciles the remaining price", async () => {
    const { project, client } = await fixture();
    await prisma.invoice.create({
      data: {
        projectId: project.id,
        clientId: client.id,
        client: client.name,
        number: `PRIOR-${randomUUID()}`,
        amount: 119000,
        netAmount: 100000,
        dueDate: new Date(),
      },
    });
    const opportunity = await prisma.opportunity.create({
      data: { name: "Existing client opportunity", value: 380000 },
    });
    const q = await createQuote(
      {
        ...(await proposalPrefill({ opportunityId: opportunity.id })),
        clientId: client.id,
      },
      actor,
    );
    expect(q.clientId).toBe(client.id);
    await accept(q.id);
    await convertQuote(q.id, project.id, actor);
    const summary = await projectCommercialSummary(project.id);
    expect(summary.requiresReconciliation).toBe(true);
    await setBillingPlan(project.id, { kind: "SINGLE" }, actor);
    expect(
      Number(
        (await projectCommercialSummary(project.id)).agreement!.milestones[0]
          .amount,
      ),
    ).toBe(333200);
    const followup = await createQuote(
      {
        ...(await proposalPrefill({ opportunityId: opportunity.id })),
        projectId: null,
        clientId: client.id,
      },
      actor,
    );
    expect(followup.projectId).toBe(project.id);
  });
  it("resolves a new named client once under concurrent project creation", async () => {
    const name = `Named client ${randomUUID()}`;
    const ids = await Promise.all([
      resolveClientId({ clientName: name }),
      resolveClientId({ clientName: name }),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.client.count({ where: { name } })).toBe(1);
  });
  it("preserves omitted tax, discount and plan fields in partial proposal updates", async () => {
    const { project, client } = await fixture();
    const q = await createQuote(
      {
        projectId: project.id,
        clientId: client.id,
        title: "Zero VAT",
        currency: "CLP",
        taxRate: 0,
        discount: 10,
        items: [{ description: "Servicio", quantity: 1, unitPrice: 380000 }],
        paymentPlan: { kind: "DEPOSIT_BALANCE", depositPercent: 50 },
      },
      actor,
    );
    const changed = await editQuote(
      q.id,
      { editVersion: 1, notes: "Only private notes changed" },
      actor,
    );
    expect(changed.taxRate).toBe(0);
    expect(changed.discount).toBe(10);
    expect(changed.paymentPlan).toEqual({
      kind: "DEPOSIT_BALANCE",
      depositPercent: 50,
    });
  });
  it("shares selected documents and denies private documents and other projects", async () => {
    const { project, client } = await fixture();
    const other = await fixture();
    const t = await token(client.id, project.id);
    const data = {
      name: "test.txt",
      mimeType: "text/plain",
      size: 6,
      fileData: Buffer.from("public"),
    };
    const shared = await prisma.document.create({
      data: { ...data, projectId: project.id, clientVisible: true },
    });
    const privateDocument = await prisma.document.create({
      data: { ...data, projectId: project.id },
    });
    const foreignDocument = await prisma.document.create({
      data: { ...data, projectId: other.project.id, clientVisible: true },
    });
    const download = await import(
      "@/app/api/portal/[token]/documents/[id]/route"
    );
    const allowed = await download.GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: t.raw, id: shared.id }),
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("public");
    for (const id of [privateDocument.id, foreignDocument.id])
      expect(
        (
          await download.GET(new Request("http://localhost"), {
            params: Promise.resolve({ token: t.raw, id }),
          })
        ).status,
      ).toBe(404);
    const visible = await portalData((await resolvePortal(t.raw))!);
    expect(visible.projects[0].documents.map((d) => d.id)).toEqual([shared.id]);
  });
  it("preserves a paid invoice when only private notes change, including zero VAT", async () => {
    const invoice = await prisma.invoice.create({
      data: {
        number: `INTERNAL-${randomUUID()}`,
        client: "Test",
        amount: 1000,
        netAmount: 1000,
        taxRate: 0,
        source: "OTHER",
        dueDate: new Date(),
      },
    });
    await recordPayment(
      {
        invoiceId: invoice.id,
        amount: 1000,
        paidAt: "2026-10-16",
        requestKey: randomUUID(),
      },
      actor,
    );
    const changed = await updateInvoice(
      invoice.id,
      { notes: "Checked" },
      actor,
    );
    expect(changed.status).toBe("Pagado");
    expect(changed.source).toBe("OTHER");
    expect(changed.taxRate).toBe(0);
    expect(changed.amount).toBe(1000);
  });
  it("never exposes an unpublished replaced draft and freezes the published client snapshot", async () => {
    const { project, client } = await fixture();
    const draft = await proposal(project.id);
    const revision = await prisma.quote.create({
      data: {
        title: "Public revision",
        clientId: client.id,
        projectId: project.id,
        parentQuoteId: draft.id,
        version: 2,
        calculationVersion: 1,
        number: `TEST-${randomUUID()}`,
        items: {
          create: { description: "Public", quantity: 1, unitPrice: 380000 },
        },
      },
    });
    const sent = await publish(revision.id);
    const t = await token(client.id, project.id);
    await prisma.client.update({
      where: { id: client.id },
      data: { name: "Renamed client" },
    });
    const data = await portalData((await resolvePortal(t.raw))!);
    expect(data.quotes.map((q) => q.id)).toEqual([revision.id]);
    expect(data.quotes[0].client.name).toBe(sent.client.name);
    await transitionQuote(
      revision.id,
      "Aprobada",
      sent.contentHash!,
      undefined,
      t.actor,
    );
    expect(
      (
        await prisma.commercialAgreement.findUniqueOrThrow({
          where: { quoteId: revision.id },
        })
      ).contentHash,
    ).toBe(sent.contentHash);
  });
  it("audits a legacy acceptance while preserving its amounts and unspecified tax treatment", async () => {
    const { project, client } = await fixture();
    const legacy = await prisma.quote.create({
      data: {
        number: `LEGACY-${randomUUID()}`,
        title: "Historical quote",
        clientId: client.id,
        projectId: project.id,
        items: {
          create: {
            description: "Legacy line",
            quantity: 1,
            unitPrice: 319327.73109243695,
          },
        },
      },
    });
    const originalPrice = (
      await prisma.quoteItem.findFirstOrThrow({ where: { quoteId: legacy.id } })
    ).unitPrice;
    const sent = await publish(legacy.id);
    const t = await token(client.id, project.id);
    await transitionQuote(
      legacy.id,
      "Aprobada",
      quoteHash(sent),
      undefined,
      t.actor,
    );
    expect(
      await prisma.quoteDecision.count({ where: { quoteId: legacy.id } }),
    ).toBe(1);
    expect(
      await prisma.commercialAgreement.count({ where: { quoteId: legacy.id } }),
    ).toBe(0);
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
        .agreedAmount,
    ).toBe(0);
    expect(
      (
        await prisma.quoteItem.findFirstOrThrow({
          where: { quoteId: legacy.id },
        })
      ).unitPrice,
    ).toBe(originalPrice);
  });
  it("rejects stale draft edits, expired acceptance and conversion before approval", async () => {
    const { project } = await fixture();
    const q = await proposal(project.id);
    await editQuote(
      q.id,
      { editVersion: q.editVersion, terms: "New terms" },
      actor,
    );
    await expect(
      editQuote(
        q.id,
        { editVersion: q.editVersion, terms: "Stale terms" },
        actor,
      ),
    ).rejects.toThrow(/otra sesión/);
    await expect(convertQuote(q.id, undefined, actor)).rejects.toThrow(
      /aceptarse/,
    );
    await editQuote(q.id, { editVersion: 2, validUntil: "2000-01-01" }, actor);
    await expect(publish(q.id)).rejects.toThrow(/venció/);
  });
  it("does not let an older published family replace the newer accepted agreement", async () => {
    const { project } = await fixture();
    const older = await proposal(project.id);
    const olderSent = await publish(older.id);
    const newer = await proposal(project.id);
    await accept(newer.id);
    await expect(
      transitionQuote(
        older.id,
        "Aprobada",
        olderSent.contentHash!,
        undefined,
        actor,
      ),
    ).rejects.toThrow(/posterior/);
    expect(
      (await projectCommercialSummary(project.id)).agreement?.quoteId,
    ).toBe(newer.id);
  });
  it("rejects overpayment under concurrent different payment requests and audits one deliverable decision", async () => {
    const { project, client } = await fixture();
    const q = await proposal(project.id);
    await accept(q.id);
    const milestone = (await projectCommercialSummary(project.id)).agreement!
      .milestones[0];
    const invoice = await issueMilestone(project.id, milestone.id, actor);
    const payments = await Promise.allSettled([
      recordPayment(
        {
          invoiceId: invoice.id,
          amount: 200000,
          requestKey: randomUUID(),
          paidAt: "2026-10-16",
        },
        actor,
      ),
      recordPayment(
        {
          invoiceId: invoice.id,
          amount: 200000,
          requestKey: randomUUID(),
          paidAt: "2026-10-16",
        },
        actor,
      ),
    ]);
    expect(payments.filter((p) => p.status === "fulfilled")).toHaveLength(1);
    const approval = await prisma.clientApproval.create({
      data: { projectId: project.id, title: "Entregable" },
    });
    const t = await token(client.id, project.id);
    const decisions = await Promise.allSettled([
      decideApproval(approval.id, "Aprobado", "Listo", t.actor),
      decideApproval(approval.id, "Cambios solicitados", "Cambio", actor),
    ]);
    expect(decisions.filter((d) => d.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.auditEvent.count({
        where: { entityId: approval.id, action: "DECIDE_DELIVERABLE" },
      }),
    ).toBe(1);
  });
  it("rechecks revoked access when a stale public decision arrives", async () => {
    const { project, client } = await fixture();
    const q = await proposal(project.id);
    const sent = await publish(q.id);
    const t = await token(client.id, project.id);
    await prisma.clientPortalToken.update({
      where: { id: t.access.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      transitionQuote(q.id, "Aprobada", sent.contentHash!, undefined, t.actor),
    ).rejects.toThrow(/revocado/);
    expect(
      await prisma.commercialAgreement.count({ where: { quoteId: q.id } }),
    ).toBe(0);
  });
  it("preloads project price, scope and terms once and creates the exact net/VAT/total", async () => {
    const { project } = await fixture();
    const q = await proposal(project.id);
    expect(q.projectId).toBe(project.id);
    expect(q.scope).toBe(project.scope);
    expect(q.terms).toBe(project.commercialTerms);
    expect(q.items).toHaveLength(1);
    expect(quoteTotals(q.items, q.discount, q.taxRate).total).toBe(452200);
    expect(
      await prisma.invoice.count({ where: { projectId: project.id } }),
    ).toBe(0);
  });
  it("creates opportunity → proposal → agreement → one project under concurrent conversion", async () => {
    const opportunity = await prisma.opportunity.create({
      data: { name: "Nueva web", contactName: "Prospecto", value: 380000 },
    });
    const input = await proposalPrefill({ opportunityId: opportunity.id });
    const q = await createQuote(
      { ...input, opportunityId: opportunity.id },
      actor,
    );
    await accept(q.id);
    const results = await Promise.all([
      convertQuote(q.id, undefined, actor),
      convertQuote(q.id, undefined, actor),
      convertQuote(q.id, undefined, actor),
    ]);
    expect(new Set(results.map((r) => r.project.id)).size).toBe(1);
    expect(
      (
        await prisma.opportunity.findUniqueOrThrow({
          where: { id: opportunity.id },
        })
      ).convertedProjectId,
    ).toBe(results[0].project.id);
    expect(await prisma.client.count({ where: { id: q.clientId } })).toBe(1);
  });
  it("publishes only the selected proposal and exposes no private financial or client fields", async () => {
    const { project, client } = await fixture();
    const q = await proposal(project.id);
    const { raw } = await token(client.id, project.id);
    let access = (await resolvePortal(raw))!;
    expect((await portalData(access)).quotes).toHaveLength(0);
    await publish(q.id);
    await prisma.projectTask.createMany({
      data: [
        { projectId: project.id, title: "Private task" },
        { projectId: project.id, title: "Public task", clientVisible: true },
        {
          projectId: project.id,
          title: "Deleted task",
          clientVisible: true,
          deletedAt: new Date(),
        },
      ],
    });
    const data = await portalData(access),
      payload = JSON.stringify(data);
    expect(data.quotes).toHaveLength(1);
    expect(data.projects[0].tasks.map((t) => t.title)).toEqual(["Public task"]);
    for (const privateKey of [
      "PRIVATE_CLIENT_SENTINEL",
      "PRIVATE_QUOTE_SENTINEL",
      "budgetCost",
      "saleNetAmount",
      "tokenHash",
      "tokenCiphertext",
      "hourlyCost",
      "personalOwnerId",
    ])
      expect(payload).not.toContain(privateKey);
  });
  it("records change requests and a real revision, preserving the original terms and decision", async () => {
    const { project, client } = await fixture(),
      q = await proposal(project.id),
      sent = await publish(q.id),
      t = await token(client.id, project.id);
    await transitionQuote(
      q.id,
      "Cambios solicitados",
      quoteHash(sent),
      "Agregar accesibilidad",
      t.actor,
    );
    const revisions = await Promise.all([
      reviseQuote(q.id, actor),
      reviseQuote(q.id, actor),
    ]);
    expect(revisions[0].id).toBe(revisions[1].id);
    expect(revisions[0].version).toBe(2);
    const edited = await editQuote(
      revisions[0].id,
      { editVersion: 1, terms: "Accesibilidad incluida" },
      actor,
    );
    await publish(edited.id);
    const original = await prisma.quote.findUniqueOrThrow({
      where: { id: q.id },
      include: quoteInclude,
    });
    expect(original.terms).toBe(q.terms);
    expect(original.decisions[0].status).toBe("Cambios solicitados");
    expect(original.decisions[0].feedback).toBe("Agregar accesibilidad");
    await expect(
      transitionQuote(
        q.id,
        "Aprobada",
        quoteHash(original),
        undefined,
        t.actor,
      ),
    ).rejects.toThrow();
  });
  it("accepts exactly the viewed version, is immutable and idempotent with one agreement and plan", async () => {
    const { project, client } = await fixture(),
      q = await proposal(project.id),
      sent = await publish(q.id),
      t = await token(client.id, project.id);
    await expect(
      transitionQuote(q.id, "Aprobada", "wrong-hash", undefined, t.actor),
    ).rejects.toThrow(/visualizar/);
    await Promise.all([
      transitionQuote(q.id, "Aprobada", quoteHash(sent), "De acuerdo", t.actor),
      transitionQuote(q.id, "Aprobada", quoteHash(sent), "De acuerdo", t.actor),
    ]);
    expect(
      await prisma.commercialAgreement.count({ where: { quoteId: q.id } }),
    ).toBe(1);
    expect(await prisma.quoteDecision.count({ where: { quoteId: q.id } })).toBe(
      1,
    );
    const summary = await projectCommercialSummary(project.id);
    expect(summary.agreement?.milestones.map((m) => Number(m.amount))).toEqual([
      226100, 226100,
    ]);
    expect(summary.totals.accepted).toBe(452200);
    await expect(setBillingPlan(project.id, { kind: "SINGLE" }, actor)).rejects.toThrow(/plan aprobado/);
    await expect(
      editQuote(q.id, { editVersion: 1, terms: "Changed" }, actor),
    ).rejects.toThrow(/inmutable/);
    await expect(
      prisma.quoteItem.update({
        where: { id: q.items[0].id },
        data: { unitPrice: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.project.update({
        where: { id: project.id },
        data: { agreedAmount: 1 },
      }),
    ).rejects.toThrow();
  });
  it("serializes conflicting decisions from internal and external interfaces", async () => {
    const { project, client } = await fixture(),
      q = await proposal(project.id),
      sent = await publish(q.id),
      t = await token(client.id, project.id);
    const outcomes = await Promise.allSettled([
      transitionQuote(q.id, "Aprobada", quoteHash(sent), undefined, actor),
      transitionQuote(q.id, "Rechazada", quoteHash(sent), undefined, t.actor),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.quoteDecision.count({ where: { quoteId: q.id } })).toBe(
      1,
    );
  });
  it("issues deposit and balance once, accepts partial payments, and protects the financial snapshot", async () => {
    const { project, client } = await fixture(),
      q = await proposal(project.id);
    await accept(q.id);
    const agreement = (await projectCommercialSummary(project.id)).agreement!;
    const invoices = await Promise.all([
      issueMilestone(project.id, agreement.milestones[0].id, actor),
      issueMilestone(project.id, agreement.milestones[0].id, actor),
    ]);
    expect(invoices[0].id).toBe(invoices[1].id);
    const invoice = invoices[0];
    expect(invoice.amount).toBe(226100);
    expect(invoice.netAmount).toBe(190000);
    const payment = {
      invoiceId: invoice.id,
      requestKey: randomUUID(),
      amount: 100000,
      currency: "CLP",
      paidAt: "2026-10-16",
    };
    await Promise.all([
      recordPayment(payment, actor),
      recordPayment(payment, actor),
    ]);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe("Parcial");
    for (const patch of [
      { amount: 1 },
      { netAmount: 1 },
      { taxRate: 0 },
      { client: "Other" },
      { clientId: randomUUID() },
      { status: "Cancelado" },
      { status: "Pagado" },
    ])
      await expect(updateInvoice(invoice.id, patch, actor)).rejects.toThrow();
    await expect(archiveInvoice(invoice.id, actor)).rejects.toThrow();
    await expect(
      prisma.invoice.update({ where: { id: invoice.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.payment.deleteMany({ where: { invoiceId: invoice.id } }),
    ).rejects.toThrow();
    await expect(
      recordPayment(
        { ...payment, requestKey: randomUUID(), amount: 126101 },
        actor,
      ),
    ).rejects.toThrow(/saldo/);
    await recordPayment(
      { ...payment, requestKey: randomUUID(), amount: 126100 },
      actor,
    );
    await issueMilestone(project.id, agreement.milestones[1].id, actor);
    const summary = await projectCommercialSummary(project.id);
    expect(summary.totals).toMatchObject({
      invoiced: 452200,
      collected: 226100,
      outstanding: 226100,
      unbilled: 0,
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: "Completado" },
    });
    await syncProjectInvoice(project.id);
    expect(
      await prisma.invoice.count({ where: { projectId: project.id } }),
    ).toBe(2);
  });
  it("preserves prior invoices and acceptance after a new price revision", async () => {
    const { project } = await fixture(),
      q = await proposal(project.id);
    await accept(q.id);
    const first = (await projectCommercialSummary(project.id)).agreement!,
      invoice = await issueMilestone(project.id, first.milestones[0].id, actor);
    await recordPayment(
      {
        invoiceId: invoice.id,
        amount: 50000,
        paidAt: "2026-10-16",
        requestKey: randomUUID(),
      },
      actor,
    );
    const revision = await reviseQuote(q.id, actor);
    await editQuote(
      revision.id,
      {
        editVersion: 1,
        items: [
          { description: "Nuevo alcance", quantity: 1, unitPrice: 400000 },
        ],
      },
      actor,
    );
    await accept(revision.id);
    const summary = await projectCommercialSummary(project.id);
    expect(summary.requiresReconciliation).toBe(true);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .amount,
    ).toBe(226100);
    expect(
      (
        await prisma.commercialAgreement.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).totalAmount.toNumber(),
    ).toBe(452200);
    await setBillingPlan(project.id, { kind: "SINGLE" }, actor);
    expect(
      Number(
        (await projectCommercialSummary(project.id)).agreement!.milestones[0]
          .amount,
      ),
    ).toBe(249900);
  });
  it("isolates projects of the same client, other clients, personal projects and revoked portals", async () => {
    const { project, client } = await fixture(),
      other = await fixture();
    const sibling = await prisma.project.create({
      data: {
        name: "Sibling",
        clientId: client.id,
        saleNetAmount: 380000,
        saleTaxRate: 19,
      },
    });
    const secret = await proposal(sibling.id);
    await publish(secret.id);
    const own = await proposal(project.id);
    await publish(own.id);
    const t = await token(client.id, project.id),
      data = await portalData((await resolvePortal(t.raw))!);
    expect(data.quotes.map((q) => q.id)).toEqual([own.id]);
    expect(data.projects.map((p) => p.id)).toEqual([project.id]);
    await expect(
      transitionQuote(
        secret.id,
        "Aprobada",
        quoteHash(
          await prisma.quote.findUniqueOrThrow({
            where: { id: secret.id },
            include: quoteInclude,
          }),
        ),
        undefined,
        t.actor,
      ),
    ).rejects.toThrow(/encontrada/);
    const foreignQuote = await proposal(other.project.id);
    await publish(foreignQuote.id);
    await expect(
      transitionQuote(foreignQuote.id, "Aprobada", "any", undefined, t.actor),
    ).rejects.toThrow();
    await prisma.clientPortalToken.update({
      where: { id: t.access.id },
      data: { revokedAt: new Date() },
    });
    expect(await resolvePortal(t.raw)).toBeNull();
    await expect(
      proposalPrefill({
        projectId: (
          await prisma.project.create({
            data: {
              name: "Private",
              visibility: "PERSONAL",
              clientId: client.id,
            },
          })
        ).id,
      }),
    ).rejects.toThrow();
  });
  it("keeps old amounts and unknown VAT explicit and locks legacy paid invoices", async () => {
    const prefill = await proposalPrefill({
      projectId: "00000000-0000-4000-a000-000000000002",
    });
    expect(prefill.requiresPriceReview).toBe(true);
    expect(prefill.historicalAmount).toBe(380000);
    expect(prefill.items[0].unitPrice).toBe(0);
    await expect(
      updateInvoice(
        "00000000-0000-4000-a000-000000000003",
        { amount: 1 },
        actor,
      ),
    ).rejects.toThrow();
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { number: "LEGACY-PAID" },
        })
      ).amount,
    ).toBe(123456.78);
  });
  it("recovers one project portal concurrently without changing old tokens", async () => {
    const { project } = await fixture();
    const portals = await Promise.all([
      ensureProjectPortal(project.id, actor),
      ensureProjectPortal(project.id, actor),
    ]);
    expect(portals[0].id).toBe(portals[1].id);
    expect(portals[0].portalPath).toBe(portals[1].portalPath);
  });
  it("bills one contractual period under concurrent runs and preserves month-end scheduling", async () => {
    const { project, client } = await fixture();
    const contract = await prisma.supportContract.create({
      data: {
        clientId: client.id,
        projectId: project.id,
        name: "Soporte",
        monthlyAmount: 119000,
        startDate: new Date("2026-01-31"),
        nextBillingAt: new Date("2026-01-31"),
      },
    });
    const now = new Date("2026-01-31T12:00:00Z");
    const results = await Promise.all([
      billContract(contract.id, now, actor),
      billContract(contract.id, now, actor),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.invoice.count({ where: { contractId: contract.id } }),
    ).toBe(1);
    expect(
      (
        await prisma.supportContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).nextBillingAt
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-02-28");
  });
  it("keeps HTTP adapters authorized and rejects incompatible legacy update paths", async () => {
    const erp = await import("@/app/api/erp/[resource]/[id]/route"),
      invoices = await import("@/app/api/invoices/[id]/route");
    auth.user = { id: "staff", name: "Staff", role: "MEMBER" };
    expect(
      (
        await erp.PATCH(
          new NextRequest("http://localhost/api/erp/quotes/test", {
            method: "PATCH",
            body: JSON.stringify({ status: "Aprobada" }),
          }),
          { params: Promise.resolve({ resource: "quotes", id: randomUUID() }) },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await invoices.PATCH(
          new NextRequest("http://localhost/api/invoices/test", {
            method: "PATCH",
            body: JSON.stringify({ amount: 1 }),
          }),
          { params: Promise.resolve({ id: randomUUID() }) },
        )
      ).status,
    ).toBe(403);
    auth.user = { id: "test-owner", name: "Owner", role: "ADMIN" };
  });
});
