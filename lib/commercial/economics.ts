import { invoicePaidAmount, invoiceOutstanding } from "./money";
export type EconomicInputs = {
  currency?: string;
  acceptedNet: number | null;
  budgetHours: number;
  budgetCost: number;
  timeEntries: Array<{ hours: number; teamMember: { hourlyCost: number } }>;
  expenses: Array<{ amount: number }>;
  invoices: Array<{
    amount: number;
    netAmount?: number | null;
    currency?: string;
    status: string;
    payments: Array<{ amount: number }>;
  }>;
};
// Costs use current team rates, as the existing TimeEntry model has no historical rate snapshot.
export function projectEconomics(input: EconomicInputs) {
  const active = input.invoices.filter((i) => i.status !== "Cancelado");
  const laborCost = input.timeEntries.reduce(
    (s, e) => s + e.hours * e.teamMember.hourlyCost,
    0,
  );
  const expenses = input.expenses.reduce((s, e) => s + e.amount, 0);
  const invoiced = active.reduce((s, i) => s + i.amount, 0);
  const collected = active.reduce((s, i) => s + invoicePaidAmount(i), 0);
  const totalCost = laborCost + expenses;
  return {
    laborCost,
    expenses,
    totalCost,
    hours: input.timeEntries.reduce((s, e) => s + e.hours, 0),
    budgetHours: input.budgetHours,
    budgetCost: input.budgetCost,
    acceptedNet: input.acceptedNet,
    invoiced,
    collected,
    outstanding: active.reduce((s, i) => s + invoiceOutstanding(i), 0),
    margin:
      input.acceptedNet === null || (input.currency && input.currency !== "CLP")
        ? null
        : input.acceptedNet - totalCost,
    rateBasis: "CURRENT_TEAM_RATE" as const,
  };
}
