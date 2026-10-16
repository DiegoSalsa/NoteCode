import { resolvePortal, portalQuoteWhere } from "@/lib/commercial/portal";
import { publicQuote, quoteInclude } from "@/lib/commercial/quotes";
import { createHash } from "crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuoteDocument from "@/components/QuoteDocument";

export default async function PortalQuotePage({ params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const access = await resolvePortal(token);
  if (!access) notFound();
  const quote = await prisma.quote.findFirst({ where: { ...portalQuoteWhere(access), id: quoteId }, include: quoteInclude });
  if (!quote) notFound();

  return <QuoteDocument quote={publicQuote(quote)} backHref={`/portal/${token}`} />;
}
