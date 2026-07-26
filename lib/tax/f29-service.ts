import { prisma } from "@/lib/prisma";
import { calculateF29, grossToNetAndVat, isValidTaxPeriod } from "@/lib/tax/f29";
import { f29DueDate, f29DueDateChile, previousTaxPeriod, taxPeriodRange } from "@/lib/tax/period";

export async function buildF29Snapshot(requestedPeriod: string) {
  if (!isValidTaxPeriod(requestedPeriod)) throw new Error("Periodo tributario invalido. Usa AAAA-MM.");

  const { start, end } = taxPeriodRange(requestedPeriod);
  const profile = await prisma.companyTaxProfile.findFirst({ orderBy: { createdAt: "asc" } });
  const [taxDocuments, invoices, expenses, savedPeriod, previousPeriod] = await Promise.all([
    profile
      ? prisma.taxDocument.findMany({ where: { profileId: profile.id, period: requestedPeriod, status: { not: "Anulado" } } })
      : Promise.resolve([]),
    prisma.invoice.findMany({
      where: { deletedAt: null, issuedAt: { gte: start, lt: end }, status: { not: "Cancelado" } },
      select: { id: true, number: true, amount: true, netAmount: true, taxRate: true },
    }),
    prisma.expense.findMany({
      where: { deletedAt: null, date: { gte: start, lt: end } },
      select: { id: true, description: true, amount: true, taxAmount: true },
    }),
    profile ? prisma.f29Period.findUnique({ where: { profileId_period: { profileId: profile.id, period: requestedPeriod } } }) : Promise.resolve(null),
    profile ? prisma.f29Period.findUnique({ where: { profileId_period: { profileId: profile.id, period: previousTaxPeriod(requestedPeriod) } } }) : Promise.resolve(null),
  ]);

  const usesTaxDocuments = taxDocuments.length > 0;
  const sales = usesTaxDocuments
    ? taxDocuments
        .filter((document) => document.direction === "Venta")
        .map((document) => ({ netAmount: document.netAmount, vatAmount: document.vatAmount, exemptAmount: document.exemptAmount }))
    : invoices.map((invoice) => {
        const fallback = grossToNetAndVat(invoice.amount, invoice.taxRate);
        const net = invoice.netAmount === null ? fallback.net : Math.round(invoice.netAmount);
        return { netAmount: net, vatAmount: Math.max(0, Math.round(invoice.amount) - net), exemptAmount: 0 };
      });
  const purchases = usesTaxDocuments
    ? taxDocuments
        .filter((document) => document.direction === "Compra")
        .map((document) => ({
          netAmount: document.netAmount,
          vatAmount: document.vatAmount,
          recoverableVatAmount: document.vatRecoverableAmount,
          exemptAmount: document.exemptAmount,
        }))
    : expenses.map((expense) => {
        const vat = Math.max(0, Math.round(expense.taxAmount));
        return {
          netAmount: Math.max(0, Math.round(expense.amount) - vat),
          vatAmount: vat,
          recoverableVatAmount: vat,
          exemptAmount: 0,
        };
      });

  const withholdings = usesTaxDocuments
    ? taxDocuments.reduce((sum, document) => sum + document.withholdingAmount, 0)
    : 0;
  const otherTaxes = usesTaxDocuments
    ? taxDocuments.reduce((sum, document) => sum + document.otherTaxAmount, 0)
    : 0;
  const calculation = calculateF29({
    period: requestedPeriod,
    sales,
    purchases,
    previousCarryForward: previousPeriod?.nextCarryForward ?? 0,
    ppmRate: Number(profile?.ppmRate ?? 0),
    withholdings,
    otherTaxes,
    hasTaxProfile: Boolean(profile?.legalName && profile.ppmRateConfirmed),
    hasTaxRegime: Boolean(profile?.taxRegime),
    usesTaxDocuments,
    hasSiiComparison: savedPeriod?.siiProposedTotal !== null && savedPeriod?.siiProposedTotal !== undefined,
  });

  return {
    ...calculation,
    dueDate: f29DueDate(requestedPeriod, profile?.f29DueDay ?? 20).toISOString(),
    dueDateChile: f29DueDateChile(requestedPeriod, profile?.f29DueDay ?? 20),
    profile: profile
      ? {
          id: profile.id,
          rut: profile.rut,
          legalName: profile.legalName,
          companyType: profile.companyType,
          taxRegime: profile.taxRegime,
          taxCategory: profile.taxCategory,
          segment: profile.segment,
          vatTaxpayer: profile.vatTaxpayer,
          ppmRate: Number(profile.ppmRate),
          ppmRateConfirmed: profile.ppmRateConfirmed,
          f29DueDay: profile.f29DueDay,
          businessStartDate: profile.businessStartDate?.toISOString() ?? null,
          activityDescription: profile.activityDescription,
          address: profile.address,
          commune: profile.commune,
          contactEmail: profile.contactEmail,
          contactPhone: profile.contactPhone,
        }
      : null,
    sources: {
      mode: usesTaxDocuments ? "Documentos tributarios" : "Registros operativos",
      taxDocuments: taxDocuments.length,
      invoices: invoices.length,
      expenses: expenses.length,
    },
    officialF29: savedPeriod
      ? {
          status: savedPeriod.status,
          total: savedPeriod.siiProposedTotal ?? savedPeriod.estimatedTotal,
          debitVat: savedPeriod.debitVat,
          ppmBase: savedPeriod.ppmBase,
          ppmRate: Number(savedPeriod.ppmRate),
          ppmAmount: savedPeriod.ppmAmount,
          filedAt: savedPeriod.filedAt?.toISOString() ?? null,
          paymentReference: savedPeriod.paymentReference,
          details: savedPeriod.calculation,
          variance: calculation.estimatedTotal - (savedPeriod.siiProposedTotal ?? savedPeriod.estimatedTotal),
        }
      : null,
    disclaimer: "Estimación interna para conciliación. Debe compararse con el RCV y la propuesta oficial del SII antes de declarar o pagar.",
  };
}
