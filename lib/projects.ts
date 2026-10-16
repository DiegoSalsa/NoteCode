import { prisma } from "@/lib/prisma";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function resolveClientId(input: {
  clientId?: string;
  clientName?: string;
}) {
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, deletedAt: null },
      select: { id: true },
    });
    if (!client) throw new Error("El cliente seleccionado no existe.");
    return client.id;
  }
  const clientName = normalizeName(input.clientName ?? "");
  if (!clientName) throw new Error("El nombre del cliente es obligatorio.");
  return prisma.$transaction(async (tx) => {
    // A narrow lock prevents concurrent name-based resolution creating two new clients.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clientName.toLowerCase()}, 0))::text`;
    const existing = await tx.client.findFirst({
      where: {
        deletedAt: null,
        name: { equals: clientName, mode: "insensitive" },
      },
      select: { id: true },
    });
    return (
      existing?.id ??
      (
        await tx.client.create({
          data: { name: clientName },
          select: { id: true },
        })
      ).id
    );
  });
}

export function calculateNetWithoutVat(amount: number) {
  return amount / 1.19;
}

/** @deprecated Billing is explicit through commercial/billing.issueMilestone.
 * Operational changes cannot issue or reprice invoices.
 */
export async function syncProjectInvoice(_projectId: string): Promise<void> {}
