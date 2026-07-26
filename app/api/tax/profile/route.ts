import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { formatChileanRut, isValidChileanRut } from "@/lib/tax/chile";

const profileSchema = z.object({
  rut: z.string().min(3).max(20).refine(isValidChileanRut, "El RUT no es valido."),
  legalName: z.string().trim().max(200).optional().nullable(),
  companyType: z.string().trim().max(100).optional().nullable(),
  taxRegime: z.string().trim().max(100).optional().nullable(),
  taxCategory: z.string().trim().max(100).optional().nullable(),
  segment: z.string().trim().max(100).optional().nullable(),
  vatTaxpayer: z.boolean().default(true),
  ppmRate: z.coerce.number().min(0).max(100),
  f29DueDay: z.coerce.number().int().min(1).max(28).default(20),
  businessStartDate: z.string().datetime().optional().nullable(),
  activityDescription: z.string().trim().max(500).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  contactEmail: z.string().trim().email().max(200).optional().nullable(),
  contactPhone: z.string().trim().max(30).optional().nullable(),
});

async function financeUser() {
  const user = await getCurrentUser();
  return user && canManageFinance(user) ? user : null;
}

export async function GET() {
  const user = await financeUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const profile = await prisma.companyTaxProfile.findFirst({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(profile);
}

export async function PUT(request: Request) {
  const user = await financeUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos tributarios invalidos." }, { status: 400 });
  }

  const current = await prisma.companyTaxProfile.findFirst({ orderBy: { createdAt: "asc" } });
  const data = {
    rut: formatChileanRut(parsed.data.rut),
    legalName: parsed.data.legalName?.trim() || null,
    taxRegime: parsed.data.taxRegime?.trim() || null,
    vatTaxpayer: parsed.data.vatTaxpayer,
    ppmRate: parsed.data.ppmRate,
    f29DueDay: parsed.data.f29DueDay,
    ppmRateConfirmed: true,
    ...(parsed.data.companyType !== undefined ? { companyType: parsed.data.companyType?.trim() || null } : {}),
    ...(parsed.data.taxCategory !== undefined ? { taxCategory: parsed.data.taxCategory?.trim() || null } : {}),
    ...(parsed.data.segment !== undefined ? { segment: parsed.data.segment?.trim() || null } : {}),
    ...(parsed.data.businessStartDate !== undefined
      ? { businessStartDate: parsed.data.businessStartDate ? new Date(parsed.data.businessStartDate) : null }
      : {}),
    ...(parsed.data.activityDescription !== undefined
      ? { activityDescription: parsed.data.activityDescription?.trim() || null }
      : {}),
    ...(parsed.data.address !== undefined ? { address: parsed.data.address?.trim() || null } : {}),
    ...(parsed.data.commune !== undefined ? { commune: parsed.data.commune?.trim() || null } : {}),
    ...(parsed.data.contactEmail !== undefined ? { contactEmail: parsed.data.contactEmail?.trim() || null } : {}),
    ...(parsed.data.contactPhone !== undefined ? { contactPhone: parsed.data.contactPhone?.trim() || null } : {}),
  };
  const profile = current
    ? await prisma.companyTaxProfile.update({ where: { id: current.id }, data })
    : await prisma.companyTaxProfile.create({ data });
  invalidateCache("tax:");
  invalidateCache("gilberto:today:");

  await recordAudit({
    action: current ? "UPDATE" : "CREATE",
    entityType: "CompanyTaxProfile",
    entityId: profile.id,
    summary: "Configuracion tributaria actualizada",
    metadata: { rut: profile.rut, ppmRate: String(profile.ppmRate), ppmRateConfirmed: profile.ppmRateConfirmed, f29DueDay: profile.f29DueDay },
  });

  return NextResponse.json(profile);
}
