import { prisma } from "@/lib/prisma";

const COMPLETED_STATUS = "Completado";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function resolveClientId(input: { clientId?: string; clientName?: string }) {
  if (input.clientId) return input.clientId;

  const clientName = normalizeName(input.clientName ?? "");
  if (!clientName) {
    throw new Error("Client name is required.");
  }

  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const existing = clients.find((client) => client.name.toLowerCase() === clientName.toLowerCase());

  if (existing) return existing.id;

  const client = await prisma.client.create({
    data: { name: clientName },
    select: { id: true },
  });

  return client.id;
}

export function calculateNetWithoutVat(amount: number) {
  return amount / 1.19;
}

export async function syncProjectInvoice(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    include: {
      client: { select: { name: true } },
      quotes: {
        where: { deletedAt: null, status: "Aprobada" },
        orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        include: { items: true },
      },
    },
  });

  if (!project || project.status !== COMPLETED_STATUS) return;
  const approvedQuote = project.quotes[0];
  const quoteSubtotal = approvedQuote?.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ?? 0;
  const billingAmount = approvedQuote
    ? quoteSubtotal * (1 - approvedQuote.discount / 100) * (1 + approvedQuote.taxRate / 100)
    : project.agreedAmount;
  if (billingAmount <= 0) return;
  if (approvedQuote && Math.abs(project.agreedAmount - billingAmount) > 0.01) {
    await prisma.project.update({ where: { id: project.id }, data: { agreedAmount: billingAmount } });
  }

  const invoiceNumber = `PROJ-${project.createdAt.getFullYear()}-${project.id.slice(0, 8).toUpperCase()}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 15);

  await prisma.invoice.upsert({
    where: { number: invoiceNumber },
    update: {
      projectId,
      clientId: project.clientId,
      number: invoiceNumber,
      client: project.client.name,
      amount: billingAmount,
      netAmount: calculateNetWithoutVat(billingAmount),
      source: "PROJECT",
      product: project.name,
      externalReference: invoiceNumber,
    },
    create: {
      projectId,
      clientId: project.clientId,
      number: invoiceNumber,
      client: project.client.name,
      amount: billingAmount,
      netAmount: calculateNetWithoutVat(billingAmount),
      source: "PROJECT",
      product: project.name,
      externalReference: invoiceNumber,
      status: "Pendiente",
      dueDate,
    },
  });
}
