import { allocatePlan, formatMoney } from "@/lib/commercial/money";
import { paymentPlanSchema } from "@/lib/commercial/validation";
export default function PaymentPlanSummary({
  plan,
  net,
  tax,
  currency,
}: {
  plan: unknown;
  net: number;
  tax: number;
  currency: string;
}) {
  const parsed = paymentPlanSchema.safeParse(plan);
  if (!parsed.success) return null;
  try {
    const entries = allocatePlan(net, tax, currency, parsed.data);
    return (
      <div className="mt-4 text-sm">
        <p className="font-semibold">Plan de cobros</p>
        <ul className="mt-2 space-y-1">
          {entries.map((entry, i) => (
            <li key={i}>
              {entry.title}: {formatMoney(entry.amount, currency)}
              {entry.dueDate
                ? ` · ${entry.dueDate.toLocaleDateString("es-CL", { timeZone: "UTC" })}`
                : ""}
            </li>
          ))}
        </ul>
      </div>
    );
  } catch {
    return (
      <p className="mt-3 text-xs">
        Plan histórico sujeto a las condiciones de esta propuesta.
      </p>
    );
  }
}
