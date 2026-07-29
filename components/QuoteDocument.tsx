import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrintButton from "@/components/PrintButton";

export type QuoteDocumentData = {
  id: string;
  number: string;
  title: string;
  status: string;
  createdAt: string;
  validUntil: string | null;
  taxRate: number;
  discount: number;
  terms: string | null;
  client: { name: string; company: string | null; email: string | null };
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
};

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default function QuoteDocument({ quote, backHref }: { quote: QuoteDocumentData; backHref: string }) {
  const subtotal = quote.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = subtotal * quote.discount / 100;
  const net = subtotal - discount;
  const tax = net * quote.taxRate / 100;
  const total = net + tax;

  return (
    <div className="quote-print-document min-h-screen bg-neutral-100 px-3 py-4 text-neutral-950 sm:px-6 sm:py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeft size={15} /> Volver
        </Link>
        <PrintButton />
      </div>
      <main className="mx-auto max-w-4xl rounded-xl bg-white px-5 py-7 shadow-sm sm:px-10 sm:py-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-7">
          <div>
            <img src="/brand/notecode-logo-horizontal-white.svg" alt="NoteCode" className="hidden" />
            <p className="text-xl font-black tracking-tight sm:text-2xl">PUROCODE</p>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">Propuesta comercial</p>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold sm:text-xl">{quote.number}</p>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">{new Date(quote.createdAt).toLocaleDateString("es-CL")}</p>
          </div>
        </header>

        <section className="grid gap-6 py-7 sm:grid-cols-2 sm:gap-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 sm:text-xs">Cliente</p>
            <p className="mt-2 font-semibold">{quote.client.company || quote.client.name}</p>
            <p className="text-sm text-neutral-500">{quote.client.name}</p>
            {quote.client.email && <p className="break-all text-sm text-neutral-500">{quote.client.email}</p>}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 sm:text-xs">Propuesta</p>
            <h1 className="mt-2 text-xl font-bold leading-tight sm:text-2xl">{quote.title}</h1>
            {quote.validUntil && <p className="mt-2 text-sm text-neutral-500">Válida hasta {new Date(quote.validUntil).toLocaleDateString("es-CL")}</p>}
          </div>
        </section>

        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] border-collapse">
            <thead><tr className="border-y border-neutral-200 text-left text-[10px] uppercase tracking-wider text-neutral-400 sm:text-xs"><th className="py-3">Descripción</th><th className="py-3 text-right">Cantidad</th><th className="py-3 text-right">Precio</th><th className="py-3 text-right">Total</th></tr></thead>
            <tbody>{quote.items.map((item) => <tr key={item.id} className="break-inside-avoid border-b border-neutral-100"><td className="py-4 pr-4 text-sm">{item.description}</td><td className="py-4 text-right text-sm">{item.quantity}</td><td className="py-4 text-right text-sm">{clp.format(item.unitPrice)}</td><td className="py-4 text-right text-sm font-medium">{clp.format(item.quantity * item.unitPrice)}</td></tr>)}</tbody>
          </table>
        </div>

        <section className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{clp.format(subtotal)}</span></div>
          {quote.discount > 0 && <div className="flex justify-between"><span className="text-neutral-500">Descuento ({quote.discount}%)</span><span>-{clp.format(discount)}</span></div>}
          <div className="flex justify-between"><span className="text-neutral-500">IVA ({quote.taxRate}%)</span><span>{clp.format(tax)}</span></div>
          <div className="flex justify-between border-t border-neutral-300 pt-3 text-lg font-bold"><span>Total</span><span>{clp.format(total)}</span></div>
        </section>

        {quote.terms && <section className="mt-10 break-inside-avoid sm:mt-12"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Condiciones</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">{quote.terms}</p></section>}
        <footer className="mt-12 flex items-center justify-between border-t border-neutral-200 pt-5 text-[10px] text-neutral-400 sm:mt-16 sm:text-xs"><span>NoteCode · PuroCode</span><span>Estado: {quote.status}</span></footer>
        <div className="mt-7 sm:hidden print:hidden"><PrintButton /></div>
      </main>
    </div>
  );
}
