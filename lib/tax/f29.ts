export type F29SalesDocument = {
  netAmount: number;
  vatAmount: number;
  exemptAmount?: number;
};

export type F29PurchaseDocument = {
  netAmount: number;
  vatAmount: number;
  recoverableVatAmount: number;
  exemptAmount?: number;
};

export type F29CalculationInput = {
  period: string;
  sales: F29SalesDocument[];
  purchases: F29PurchaseDocument[];
  previousCarryForward?: number;
  ppmRate?: number;
  withholdings?: number;
  otherTaxes?: number;
  hasTaxProfile: boolean;
  hasTaxRegime?: boolean;
  usesTaxDocuments: boolean;
  hasSiiComparison: boolean;
};

export type F29Confidence = "Baja" | "Media" | "Alta";

export type F29Calculation = {
  period: string;
  salesNet: number;
  salesExempt: number;
  debitVat: number;
  purchasesNet: number;
  purchasesExempt: number;
  purchaseVat: number;
  creditVat: number;
  previousCarryForward: number;
  vatPayable: number;
  nextCarryForward: number;
  ppmBase: number;
  ppmRate: number;
  ppmAmount: number;
  withholdings: number;
  otherTaxes: number;
  estimatedTotal: number;
  confidence: F29Confidence;
  gaps: string[];
};

function clp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function periodForPreviousMonth(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const previous = new Date(Date.UTC(year, month - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidTaxPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const [year] = period.split("-").map(Number);
  return year >= 2000 && year <= 2100;
}

export function honorariumWithholdingRate(year: number) {
  if (year >= 2028) return 17;
  if (year === 2027) return 16;
  if (year === 2026) return 15.25;
  if (year === 2025) return 14.5;
  if (year === 2024) return 13.75;
  return 13;
}

export function grossToNetAndVat(total: number, taxRate = 19) {
  const safeTotal = clp(total);
  const safeRate = Math.max(0, Number.isFinite(taxRate) ? taxRate : 0);
  if (!safeRate) return { net: safeTotal, vat: 0 };
  const net = Math.round(safeTotal / (1 + safeRate / 100));
  return { net, vat: safeTotal - net };
}

export function calculateF29(input: F29CalculationInput): F29Calculation {
  if (!isValidTaxPeriod(input.period)) throw new Error("Periodo tributario invalido.");

  const salesNet = input.sales.reduce((sum, item) => sum + clp(item.netAmount), 0);
  const salesExempt = input.sales.reduce((sum, item) => sum + clp(item.exemptAmount ?? 0), 0);
  const debitVat = input.sales.reduce((sum, item) => sum + clp(item.vatAmount), 0);
  const purchasesNet = input.purchases.reduce((sum, item) => sum + clp(item.netAmount), 0);
  const purchasesExempt = input.purchases.reduce((sum, item) => sum + clp(item.exemptAmount ?? 0), 0);
  const purchaseVat = input.purchases.reduce((sum, item) => sum + clp(item.vatAmount), 0);
  const creditVat = input.purchases.reduce((sum, item) => sum + clp(item.recoverableVatAmount), 0);
  const previousCarryForward = clp(input.previousCarryForward ?? 0);
  const availableCredit = creditVat + previousCarryForward;
  const vatPayable = Math.max(0, debitVat - availableCredit);
  const nextCarryForward = Math.max(0, availableCredit - debitVat);
  const ppmBase = salesNet;
  const ppmRate = Math.max(0, Number.isFinite(input.ppmRate ?? 0) ? input.ppmRate ?? 0 : 0);
  const ppmAmount = clp(ppmBase * ppmRate / 100);
  const withholdings = clp(input.withholdings ?? 0);
  const otherTaxes = clp(input.otherTaxes ?? 0);
  const estimatedTotal = vatPayable + ppmAmount + withholdings + otherTaxes;
  const gaps: string[] = [];

  if (!input.hasTaxProfile) gaps.push("Falta confirmar la identidad tributaria y la tasa PPM de la empresa.");
  if (input.hasTaxRegime === false) gaps.push("Falta confirmar el régimen tributario vigente de la empresa.");
  if (!input.usesTaxDocuments) gaps.push("El calculo usa facturas y gastos operativos; falta importar y clasificar el Registro de Compras y Ventas.");
  if (!input.purchases.length) gaps.push("No hay compras con IVA credito registradas para el periodo.");
  if (!input.hasSiiComparison) gaps.push("Falta comparar el resultado con la propuesta de IVA del SII.");
  if (!previousCarryForward) gaps.push("No se ha confirmado el remanente de credito fiscal del periodo anterior.");

  const completeProfile = input.hasTaxProfile && input.hasTaxRegime !== false;
  const confidence: F29Confidence = completeProfile && input.usesTaxDocuments && input.hasSiiComparison
    ? "Alta"
    : completeProfile && input.usesTaxDocuments
      ? "Media"
      : "Baja";

  return {
    period: input.period,
    salesNet,
    salesExempt,
    debitVat,
    purchasesNet,
    purchasesExempt,
    purchaseVat,
    creditVat,
    previousCarryForward,
    vatPayable,
    nextCarryForward,
    ppmBase,
    ppmRate,
    ppmAmount,
    withholdings,
    otherTaxes,
    estimatedTotal,
    confidence,
    gaps,
  };
}
