import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal, portalQuoteWhere } from "@/lib/commercial/portal";
import { publicQuote, quoteInclude } from "@/lib/commercial/quotes";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const access = await resolvePortal(token);
  if (!access) return NextResponse.json({ error: "Acceso inválido." }, { status: 404 });
  const quote = await prisma.quote.findFirst({ where: { ...portalQuoteWhere(access), id: quoteId }, include: quoteInclude });
  if (!quote) return NextResponse.json({ error: "Propuesta no encontrada." }, { status: 404 });
  return NextResponse.json(publicQuote(quote), { headers: { "Cache-Control": "private, no-store" } });
}
