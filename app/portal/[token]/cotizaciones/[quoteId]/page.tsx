import { createHash } from "crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuoteDocument from "@/components/QuoteDocument";

export default async function PortalQuotePage({ params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const access = await prisma.clientPortalToken.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
  });
  if (!access || access.revokedAt || (access.expiresAt && access.expiresAt < new Date())) notFound();

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, clientId: access.clientId, deletedAt: null, status: { not: "Borrador" } },
    include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) notFound();

  return <QuoteDocument quote={{
    id: quote.id,
    number: quote.number,
    title: quote.title,
    status: quote.status,
    createdAt: quote.createdAt.toISOString(),
    validUntil: quote.validUntil?.toISOString() ?? null,
    taxRate: quote.taxRate,
    discount: quote.discount,
    terms: quote.terms,
    client: { name: quote.client.name, company: quote.client.company, email: quote.client.email },
    items: quote.items.map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
  }} backHref={`/portal/${token}`} />;
}
