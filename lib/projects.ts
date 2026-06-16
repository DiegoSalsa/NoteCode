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
    where: { id: projectId },
    include: { client: { select: { name: true } } },
  });

  if (!project || project.status !== COMPLETED_STATUS || project.agreedAmount <= 0) return;

  const invoiceNumber = `PROJ-${project.createdAt.getFullYear()}-${project.id.slice(0, 8).toUpperCase()}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 15);

  await prisma.invoice.upsert({
    where: { projectId },
    update: {
      number: invoiceNumber,
      client: project.client.name,
      amount: project.agreedAmount,
      dueDate,
    },
    create: {
      projectId,
      number: invoiceNumber,
      client: project.client.name,
      amount: project.agreedAmount,
      status: "Pendiente",
      dueDate,
    },
  });
}
