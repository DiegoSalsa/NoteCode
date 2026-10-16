import { invoiceOutstanding, invoicePaidAmount } from "./money";

export type InvoiceOriginFields = {
  contractId?: string | null;
  agreementId?: string | null;
  billingMilestoneId?: string | null;
  externalReference?: string | null;
  source?: string;
  number?: string;
  notes?: string | null;
};

// Keep this classifier aligned with commercial_invoice_origin in the corrective SQL.
// Legacy recurring documents are identified without rewriting financial history.
export function invoiceOrigin(i: InvoiceOriginFields) {
  if (
    i.contractId ||
    i.externalReference?.startsWith("contract:") ||
    (i.number?.startsWith("REC-") &&
      i.notes?.startsWith("Facturación recurrente: "))
  )
    return "CONTRACT" as const;
  if (i.agreementId || i.billingMilestoneId || i.source === "PROJECT")
    return "DEVELOPMENT" as const;
  return "UNATTRIBUTED" as const;
}

export const originLabels = {
  CONTRACT: "Contrato recurrente",
  DEVELOPMENT: "Desarrollo",
  UNATTRIBUTED: "Origen por conciliar",
};

type LedgerInvoice = InvoiceOriginFields & {
  amount: number;
  currency?: string;
  status: string;
  payments: Array<{ amount: number }>;
};

export function billingByOrigin(invoices: LedgerInvoice[]) {
  const result: Record<
    string,
    Record<
      ReturnType<typeof invoiceOrigin>,
      {
        invoiced: number;
        collected: number;
        outstanding: number;
      }
    >
  > = {};
  for (const i of invoices) {
    if (i.status === "Cancelado") continue;
    const currency = i.currency ?? "CLP";
    result[currency] ??= {
      DEVELOPMENT: { invoiced: 0, collected: 0, outstanding: 0 },
      CONTRACT: { invoiced: 0, collected: 0, outstanding: 0 },
      UNATTRIBUTED: { invoiced: 0, collected: 0, outstanding: 0 },
    };
    const bucket = result[currency][invoiceOrigin(i)];
    bucket.invoiced += i.amount;
    bucket.collected += invoicePaidAmount(i);
    bucket.outstanding += invoiceOutstanding(i);
  }
  return result;
}
