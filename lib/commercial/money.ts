export class MoneyError extends Error {}
type InvoiceBalance = {
  amount: number;
  status: string;
  payments: Array<{ amount: number }>;
};
// A historical Paid marker remains authoritative when old records have no payment breakdown.
// This is a read model; it never creates or changes payment evidence.
export function invoicePaidAmount(invoice: InvoiceBalance) {
  return invoice.payments.length
    ? invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)
    : invoice.status === "Pagado"
      ? invoice.amount
      : 0;
}
export function invoiceOutstanding(invoice: InvoiceBalance) {
  return invoice.status === "Cancelado"
    ? 0
    : Math.max(0, invoice.amount - invoicePaidAmount(invoice));
}
// Shared by browser and server. Version 0 deliberately preserves historical arithmetic.
export const currencyDigits = { CLP: 0, USD: 2, EUR: 2 } as const;
export type Currency = keyof typeof currencyDigits;
export type Line = { quantity: number; unitPrice: number };

function fixed(value: number, digits: number): bigint {
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999)
    throw new MoneyError("Importe fuera de rango.");
  const scaled = value * 10 ** digits;
  if (Math.abs(scaled - Math.round(scaled)) > 0.0001)
    throw new MoneyError(`Se admiten hasta ${digits} decimales.`);
  return BigInt(Math.round(scaled));
}

function halfUp(value: bigint, divisor: bigint) {
  return (value + divisor / 2n) / divisor;
}
export function minorUnits(value: number, currency = "CLP") {
  if (!(currency in currencyDigits))
    throw new MoneyError("Moneda no admitida.");
  return fixed(value, currencyDigits[currency as Currency]);
}
export function fromMinor(value: bigint, currency = "CLP") {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new MoneyError("Importe fuera de rango.");
  return Number(value) / 10 ** currencyDigits[currency as Currency];
}

export function quoteTotals(
  items: Line[],
  discount = 0,
  taxRate = 19,
  currency = "CLP",
  version = 1,
) {
  if (version === 0) {
    const subtotal = items.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    );
    const discountAmount = (subtotal * discount) / 100;
    const net = subtotal - discountAmount;
    const tax = (net * taxRate) / 100;
    return { subtotal, discountAmount, net, tax, total: net + tax };
  }
  if (discount < 0 || discount > 100 || taxRate < 0 || taxRate > 100)
    throw new MoneyError("Porcentaje inválido.");
  const subtotalMinor = items.reduce((sum, line) => {
    if (line.quantity <= 0)
      throw new MoneyError("La cantidad debe ser positiva.");
    return (
      sum +
      halfUp(
        fixed(line.quantity, 4) * minorUnits(line.unitPrice, currency),
        10_000n,
      )
    );
  }, 0n);
  const discounted = halfUp(subtotalMinor * fixed(discount, 4), 1_000_000n);
  const netMinor = subtotalMinor - discounted;
  const taxMinor = halfUp(netMinor * fixed(taxRate, 4), 1_000_000n);
  // Also bounds the total, independently of line count.
  const total = fromMinor(netMinor + taxMinor, currency);
  if (total > 9_999_999_999)
    throw new MoneyError("Importe total fuera de rango.");
  return {
    subtotal: fromMinor(subtotalMinor, currency),
    discountAmount: fromMinor(discounted, currency),
    net: fromMinor(netMinor, currency),
    tax: fromMinor(taxMinor, currency),
    total,
  };
}

export type PaymentPlan =
  | { kind: "SINGLE" }
  | { kind: "DEPOSIT_BALANCE"; depositPercent: number }
  | {
      kind: "MILESTONES";
      entries: Array<{
        title: string;
        percent: number;
        dueDate?: string | null;
      }>;
    };

export function allocatePlan(
  net: number,
  tax: number,
  currency: string,
  plan: PaymentPlan,
) {
  const entries =
    plan.kind === "SINGLE"
      ? [{ title: "Pago único", percent: 100 }]
      : plan.kind === "DEPOSIT_BALANCE"
        ? [
            { title: "Anticipo", percent: plan.depositPercent },
            {
              title: "Saldo contra entrega",
              percent: 100 - plan.depositPercent,
            },
          ]
        : plan.entries;
  if (
    !entries.length ||
    entries.some((e) => e.percent <= 0) ||
    Math.abs(entries.reduce((s, e) => s + e.percent, 0) - 100) > 0.00001
  )
    throw new MoneyError("El plan debe distribuir exactamente el 100%.");
  const netMinor = minorUnits(net, currency),
    taxMinor = minorUnits(tax, currency);
  let assignedNet = 0n,
    assignedTax = 0n;
  return entries.map((entry, position) => {
    const last = position === entries.length - 1;
    const n = last
      ? netMinor - assignedNet
      : halfUp(netMinor * fixed(entry.percent, 4), 1_000_000n);
    const t = last
      ? taxMinor - assignedTax
      : halfUp(taxMinor * fixed(entry.percent, 4), 1_000_000n);
    assignedNet += n;
    assignedTax += t;
    if (n + t <= 0n)
      throw new MoneyError("Cada hito debe tener un importe positivo.");
    return {
      position,
      title: entry.title,
      dueDate:
        "dueDate" in entry && entry.dueDate ? new Date(entry.dueDate) : null,
      netAmount: fromMinor(n, currency),
      taxAmount: fromMinor(t, currency),
      amount: fromMinor(n + t, currency),
    };
  });
}

export function formatMoney(amount: number, currency = "CLP") {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currencyDigits[currency as Currency] ?? 2,
  }).format(amount);
}
