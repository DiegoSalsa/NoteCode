import { invoiceOrigin } from "./invoice-origin";
import { minorUnits } from "./money";
import { requireCommercial, type Tx } from "./transaction";

export async function developmentObligations(tx: Tx, projectId: string) {
  const invoices = await tx.invoice.findMany({
    where: { projectId, deletedAt: null, status: { not: "Cancelado" } },
  });
  // Unattributed history reserves budget until a formal reconciliation establishes its origin.
  return invoices.filter((i) => invoiceOrigin(i) !== "CONTRACT");
}

export async function assertAgreementCoversObligations(
  tx: Tx,
  projectId: string,
  agreement: { currency: string; totalAmount: number | { toString(): string } },
) {
  const invoices = await developmentObligations(tx, projectId);
  requireCommercial(
    invoices.every((i) => i.currency === agreement.currency),
    "Conciliación formal necesaria: hay obligaciones de desarrollo en otra moneda.",
  );
  const billed = invoices.reduce(
    (s, i) => s + minorUnits(i.amount, agreement.currency),
    BigInt(0),
  );
  requireCommercial(
    minorUnits(Number(agreement.totalAmount), agreement.currency) >= billed,
    "El precio aceptado no puede ser menor que las obligaciones facturadas vigentes de desarrollo. Se requiere una conciliación o ajuste formal previo; los documentos y pagos se conservan.",
  );
  return invoices;
}
