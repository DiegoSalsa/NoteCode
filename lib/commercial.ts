import { prisma } from "@/lib/prisma";

export type QuoteLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export function quoteTotal(
  items: Array<{ quantity: number; unitPrice: number }>,
  discount = 0,
  taxRate = 19,
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const net = subtotal * (1 - Math.max(0, discount) / 100);
  return net * (1 + Math.max(0, taxRate) / 100);
}

export async function assertProjectBelongsToClient(projectId?: string | null, clientId?: string | null) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, clientId: true, name: true },
  });
  if (!project) throw new Error("El proyecto seleccionado no existe.");
  if (clientId && project.clientId !== clientId) {
    throw new Error("El proyecto no pertenece al cliente seleccionado.");
  }
  return project;
}

export async function syncApprovedQuoteToProject(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { items: true },
  });
  if (!quote || quote.status !== "Aprobada" || !quote.projectId) return;

  await prisma.project.update({
    where: { id: quote.projectId },
    data: {
      agreedAmount: quoteTotal(quote.items, quote.discount, quote.taxRate),
      currency: quote.currency,
    },
  });
}
