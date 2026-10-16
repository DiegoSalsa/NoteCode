import { quoteTotals } from "./money";
import { requireCommercial } from "./transaction";

export function projectPriceData(body: Record<string, unknown>) {
  if (body.saleNetAmount === undefined) return {};
  if (body.saleNetAmount === null || body.saleNetAmount === "")
    return { saleNetAmount: null, saleTaxRate: null };
  const net = Number(body.saleNetAmount),
    taxRate = Number(body.saleTaxRate ?? 19),
    currency = String(body.currency || "CLP");
  requireCommercial(
    Number.isFinite(net) &&
      net >= 0 &&
      Number.isFinite(taxRate) &&
      taxRate >= 0 &&
      taxRate <= 100,
    "Precio neto o IVA inválido.",
    400,
  );
  quoteTotals([{ quantity: 1, unitPrice: net }], 0, taxRate, currency);
  return {
    saleNetAmount: net,
    saleTaxRate: taxRate,
    currency,
    commercialTerms:
      typeof body.commercialTerms === "string"
        ? body.commercialTerms.slice(0, 10_000)
        : undefined,
  };
}
