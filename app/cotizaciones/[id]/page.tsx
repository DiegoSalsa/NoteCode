import { publicQuote, quoteInclude } from "@/lib/commercial/quotes";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import QuoteDocument from "@/components/QuoteDocument";

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id, deletedAt: null },
    include: quoteInclude,
  });
  if (!quote) notFound();

  return <QuoteDocument quote={publicQuote(quote)} backHref={quote.projectId ? `/proyectos/${quote.projectId}` : "/erp?tab=cotizaciones"} />;
}
