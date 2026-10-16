import { prisma } from "@/lib/prisma";

export type QuoteLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export { quoteTotals } from "./commercial/money";
import { quoteTotals } from "./commercial/money";
export function quoteTotal(items: Array<{ quantity: number; unitPrice: number }>, discount = 0, taxRate = 19, currency = "CLP", version = 1) {
  return quoteTotals(items, discount, taxRate, currency, version).total;
}

export async function assertProjectBelongsToClient(projectId?: string | null, clientId?: string | null) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, visibility: "COMPANY", deletedAt: null },
    select: { id: true, clientId: true, name: true },
  });
  if (!project) throw new Error("El proyecto seleccionado no existe.");
  if (clientId && project.clientId !== clientId) {
    throw new Error("El proyecto no pertenece al cliente seleccionado.");
  }
  return project;
}
