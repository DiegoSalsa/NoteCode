import { redirect } from "next/navigation";
import ChileTaxWorkspace from "@/components/ChileTaxWorkspace";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { isValidTaxPeriod } from "@/lib/tax/f29";

export default async function TaxesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!canManageFinance(user)) redirect("/dashboard");
  const { period } = await searchParams;

  return <ChileTaxWorkspace initialPeriod={period && isValidTaxPeriod(period) ? period : undefined} />;
}
