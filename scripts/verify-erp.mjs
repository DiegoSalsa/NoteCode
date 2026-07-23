import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROLLBACK = Symbol("ERP_VERIFY_ROLLBACK");

try {
  await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { name: "ERP Verify Client", status: "Prospecto" } });
    const opportunity = await tx.opportunity.create({ data: { clientId: client.id, name: "ERP Verify Opportunity", value: 1000000, probability: 50 } });
    const quote = await tx.quote.create({
      data: {
        number: `VERIFY-COT-${Date.now()}`,
        clientId: client.id,
        opportunityId: opportunity.id,
        title: "ERP Verify Quote",
        items: { create: [{ description: "Servicio", quantity: 2, unitPrice: 500000 }] },
      },
      include: { items: true },
    });
    const project = await tx.project.create({ data: { name: "ERP Verify Project", clientId: client.id, agreedAmount: 1190000, quote: { connect: { id: quote.id } } } });
    await tx.clientPortalToken.create({ data: { clientId: client.id, tokenHash: `verify-${Date.now()}` } });
    await tx.quote.update({ where: { id: quote.id }, data: { status: "Enviada", sentAt: new Date() } });
    const portalQuotes = await tx.quote.count({ where: { clientId: client.id, deletedAt: null, status: { not: "Borrador" } } });
    const pushUser = await tx.userProfile.create({
      data: { userId: `verify-${Date.now()}`, email: `verify-${Date.now()}@example.invalid`, displayName: "ERP Verify Push" },
    });
    await tx.pushSubscription.create({
      data: { userId: pushUser.userId, endpoint: `https://push.example.invalid/${Date.now()}`, p256dh: "verify-p256dh", auth: "verify-auth" },
    });
    const member = await tx.teamMember.create({ data: { name: "ERP Verify Member", weeklyCapacity: 40, hourlyCost: 15000, billableRate: 35000 } });
    await tx.projectAssignment.create({ data: { projectId: project.id, teamMemberId: member.id, allocation: 50 } });
    await tx.timeEntry.create({ data: { projectId: project.id, teamMemberId: member.id, description: "Implementación", date: new Date(), hours: 4 } });
    const supplier = await tx.supplier.create({ data: { name: "ERP Verify Supplier" } });
    await tx.expense.create({ data: { supplierId: supplier.id, projectId: project.id, description: "Servicio externo", amount: 100000, date: new Date() } });
    const invoice = await tx.invoice.create({ data: { projectId: project.id, clientId: client.id, number: `VERIFY-INV-${Date.now()}`, client: client.name, amount: 1190000, dueDate: new Date() } });
    await tx.payment.create({ data: { invoiceId: invoice.id, amount: 500000 } });
    const contract = await tx.supportContract.create({ data: { clientId: client.id, projectId: project.id, name: "ERP Verify Support", startDate: new Date(), monthlyAmount: 250000 } });
    const ticket = await tx.supportTicket.create({ data: { number: `VERIFY-TKT-${Date.now()}`, clientId: client.id, projectId: project.id, contractId: contract.id, subject: "Prueba", description: "Validación integral" } });
    await tx.ticketComment.create({ data: { ticketId: ticket.id, author: "Verifier", body: "Respuesta" } });
    await tx.clientApproval.create({ data: { projectId: project.id, title: "Aprobar entrega" } });
    const order = await tx.purchaseOrder.create({
      data: {
        number: `VERIFY-OC-${Date.now()}`,
        supplierId: supplier.id,
        projectId: project.id,
        items: { create: [{ description: "Equipo", quantity: 1, unitPrice: 300000 }] },
      },
    });
    await tx.asset.create({ data: { name: "ERP Verify Asset", assignedToId: member.id, purchaseCost: 300000, status: "Asignado" } });
    const period = await tx.payrollPeriod.create({ data: { name: "ERP Verify Payroll", startDate: new Date("2099-01-01"), endDate: new Date("2099-01-31") } });
    await tx.payrollEntry.create({ data: { periodId: period.id, teamMemberId: member.id, baseSalary: 1000000, netPay: 1000000 } });
    const debit = await tx.account.create({ data: { code: `VERIFY-D-${Date.now()}`, name: "Cuenta debe", type: "Activo" } });
    const credit = await tx.account.create({ data: { code: `VERIFY-C-${Date.now()}`, name: "Cuenta haber", type: "Ingreso" } });
    const journal = await tx.journalEntry.create({
      data: {
        number: `VERIFY-ASI-${Date.now()}`,
        date: new Date(),
        description: "Asiento de verificación",
        lines: { create: [{ accountId: debit.id, debit: 1000 }, { accountId: credit.id, credit: 1000 }] },
      },
      include: { lines: true },
    });

    const debitTotal = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const creditTotal = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    if (debitTotal !== creditTotal || quote.items.length !== 1 || !order.id || portalQuotes !== 1) {
      throw new Error("La verificación integral produjo datos inconsistentes.");
    }

    console.log(JSON.stringify({
      verified: [
        "crm", "quotes", "projects", "team", "assignments", "time",
        "suppliers", "expenses", "invoices", "payments", "contracts",
        "tickets", "approvals", "portal", "push", "purchases", "assets", "payroll", "accounting",
      ],
      balancedJournal: debitTotal,
      rollback: true,
    }));
    throw ROLLBACK;
  }, { timeout: 60000, maxWait: 10000 });
} catch (error) {
  if (error !== ROLLBACK) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
