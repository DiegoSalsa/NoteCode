import { quoteTotals } from "./money";

type Amount = number | string | { toString(): string };
export type ProjectPriceInput = {
  agreedAmount?: number;
  currency?: string;
  saleNetAmount?: Amount | null;
  saleTaxRate?: Amount | null;
  currentAgreement?: {
    currency: string;
    netAmount: Amount;
    taxAmount: Amount;
    totalAmount: Amount;
  } | null;
};
export function projectPriceView(project: ProjectPriceInput) {
  const a = project.currentAgreement;
  if (a)
    return {
      state: "ACCEPTED" as const,
      label: "Acuerdo aceptado",
      currency: a.currency,
      net: Number(a.netAmount),
      tax: Number(a.taxAmount),
      total: Number(a.totalAmount),
    };
  if (project.saleNetAmount != null && project.saleTaxRate != null) {
    const currency = project.currency ?? "CLP";
    const totals = quoteTotals(
      [{ quantity: 1, unitPrice: Number(project.saleNetAmount) }],
      0,
      Number(project.saleTaxRate),
      currency,
    );
    return {
      state: "PROPOSED" as const,
      label: "Precio propuesto · pendiente de aceptación",
      currency,
      ...totals,
    };
  }
  return {
    state: "UNCONFIRMED" as const,
    label: project.agreedAmount
      ? "Importe histórico · neto e IVA por confirmar"
      : "Sin precio propuesto",
    currency: project.currency ?? "CLP",
    net: null,
    tax: null,
    total: project.agreedAmount || null,
  };
}
