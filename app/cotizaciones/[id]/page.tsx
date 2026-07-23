import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id, deletedAt: null }, include: { client: true, items: { orderBy: { sortOrder: "asc" } } } });
  if (!quote) notFound();

  const subtotal = quote.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = subtotal * quote.discount / 100;
  const net = subtotal - discount;
  const tax = net * quote.taxRate / 100;
  const total = net + tax;

  return <div className="min-h-screen bg-white px-6 py-10 text-neutral-950 print:p-0"><main className="mx-auto max-w-4xl"><header className="flex items-start justify-between border-b border-neutral-200 pb-8"><div><img src="/brand/notecode-mark-white.svg" alt="" className="hidden" /><p className="text-2xl font-black tracking-tight">PUROCODE</p><p className="mt-1 text-sm text-neutral-500">Propuesta comercial</p></div><div className="text-right"><p className="text-xl font-semibold">{quote.number}</p><p className="mt-1 text-sm text-neutral-500">{quote.createdAt.toLocaleDateString("es-CL")}</p></div></header><section className="grid gap-8 py-8 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Cliente</p><p className="mt-2 font-semibold">{quote.client.company || quote.client.name}</p><p className="text-sm text-neutral-500">{quote.client.name}</p><p className="text-sm text-neutral-500">{quote.client.email}</p></div><div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Propuesta</p><h1 className="mt-2 text-2xl font-bold">{quote.title}</h1>{quote.validUntil && <p className="mt-2 text-sm text-neutral-500">Válida hasta {quote.validUntil.toLocaleDateString("es-CL")}</p>}</div></section><table className="w-full border-collapse"><thead><tr className="border-y border-neutral-200 text-left text-xs uppercase tracking-wider text-neutral-400"><th className="py-3">Descripción</th><th className="py-3 text-right">Cantidad</th><th className="py-3 text-right">Precio</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{quote.items.map((item) => <tr key={item.id} className="border-b border-neutral-100"><td className="py-4 text-sm">{item.description}</td><td className="py-4 text-right text-sm">{item.quantity}</td><td className="py-4 text-right text-sm">{clp.format(item.unitPrice)}</td><td className="py-4 text-right text-sm font-medium">{clp.format(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table><section className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm"><div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{clp.format(subtotal)}</span></div>{quote.discount > 0 && <div className="flex justify-between"><span className="text-neutral-500">Descuento ({quote.discount}%)</span><span>-{clp.format(discount)}</span></div>}<div className="flex justify-between"><span className="text-neutral-500">IVA ({quote.taxRate}%)</span><span>{clp.format(tax)}</span></div><div className="flex justify-between border-t border-neutral-300 pt-3 text-lg font-bold"><span>Total</span><span>{clp.format(total)}</span></div></section>{quote.terms && <section className="mt-12"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Condiciones</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">{quote.terms}</p></section>}<footer className="mt-16 flex items-center justify-between border-t border-neutral-200 pt-5 text-xs text-neutral-400"><span>NoteCode · PuroCode</span><span>Estado: {quote.status}</span></footer><button onClick={undefined} className="mt-8 rounded bg-neutral-950 px-4 py-2 text-sm font-semibold text-white print:hidden" id="print-instruction">Usa Ctrl+P para imprimir o guardar en PDF</button></main></div>;
}
