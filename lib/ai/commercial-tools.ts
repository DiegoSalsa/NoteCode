import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createQuote,
  proposalPrefill,
  quoteHash,
  quoteInclude,
  publicQuote,
} from "@/lib/commercial/quotes";
import { quoteCommand } from "@/lib/commercial/commands";
import { createInvoice, recordPayment } from "@/lib/commercial/billing";
import { quoteTotals } from "@/lib/commercial/money";
import type { GilbertoToolContext } from "./tools";

type Confirm = (
  context: GilbertoToolContext,
  action: string,
  details: Record<string, unknown>,
) => Promise<unknown>;
export function createCommercialTools(
  context: GilbertoToolContext,
  confirm: Confirm,
) {
  const actor = {
    name: "Gilberto",
    userId: context.userId,
    origin: "AI" as const,
  };
  const commercial = ["ADMIN", "MANAGER"].includes(context.role ?? ""),
    finance = commercial || context.role === "FINANCE";
  return {
    crearCotizacion: tool({
      description:
        "Prepara una propuesta reutilizando cliente, alcance, precio neto e IVA explícitos del proyecto. Si ya existe, recupera su versión. No deduce IVA de importes históricos ambiguos.",
      inputSchema: z.object({
        projectId: z.string().default(""),
        projectName: z.string().default(""),
        clientName: z.string().default(""),
        title: z.string().default(""),
        items: z
          .array(
            z.object({
              description: z.string(),
              quantity: z.number().positive(),
              unitPrice: z.number().nonnegative(),
            }),
          )
          .default([]),
        totalClp: z.number().nonnegative().default(0),
        taxRate: z.number().min(0).max(100).default(19),
        discount: z.number().min(0).max(100).default(0),
        validDays: z.number().int().min(1).max(365).default(30),
        terms: z.string().default(""),
        notes: z.string().default(""),
        status: z.enum(["Borrador", "Enviada"]).default("Borrador"),
      }),
      execute: async (input) => {
        if (!commercial) return { error: "Sin permisos comerciales." };
        const projectId = input.projectId || context.currentProjectId;
        const matches =
          projectId || input.projectName
            ? await prisma.project.findMany({
                where: {
                  deletedAt: null,
                  visibility: "COMPANY",
                  ...(projectId
                    ? { id: projectId }
                    : {
                        name: {
                          contains: input.projectName,
                          mode: "insensitive",
                        },
                      }),
                },
                take: 2,
              })
            : [];
        if ((projectId || input.projectName) && matches.length !== 1)
          return { error: "Indica un proyecto comercial único." };
        const project = matches[0];
        if (project) {
          const existing = await prisma.quote.findFirst({
            where: { projectId: project.id, deletedAt: null },
            orderBy: { createdAt: "desc" },
            include: quoteInclude,
          });
          if (existing)
            return {
              alreadyExists: true,
              quote: publicQuote(existing),
              proposalUrl: `/cotizaciones/${existing.id}`,
              message:
                "Usa el borrador existente o crea una revisión desde el proyecto.",
            };
        }
        const prefill = project
          ? await proposalPrefill({ projectId: project.id })
          : null;
        const clients = !project
          ? await prisma.client.findMany({
              where: {
                deletedAt: null,
                name: { equals: input.clientName, mode: "insensitive" },
              },
              take: 2,
            })
          : [];
        if (!project && clients.length !== 1)
          return { error: "Indica un cliente existente único." };
        if (
          prefill?.requiresPriceReview &&
          !input.items.length &&
          !input.totalClp
        )
          return {
            error:
              "El importe histórico no define IVA. Revisa el precio neto en la ficha del proyecto.",
          };
        const items = input.items.length
          ? input.items
          : input.totalClp
            ? [
                {
                  description:
                    input.title || project?.name || "Propuesta comercial",
                  quantity: 1,
                  unitPrice:
                    input.totalClp /
                    ((1 - input.discount / 100) * (1 + input.taxRate / 100)),
                },
              ]
            : prefill?.items;
        let quote = await createQuote(
          {
            ...prefill,
            clientId: prefill?.clientId ?? clients[0]?.id,
            projectId: project?.id,
            title:
              input.title ||
              prefill?.title ||
              `Propuesta para ${clients[0]?.name}`,
            items,
            taxRate:
              input.items.length || input.totalClp
                ? input.taxRate
                : (prefill?.taxRate ?? input.taxRate),
            discount: input.discount || prefill?.discount || 0,
            terms: input.terms || prefill?.terms,
            notes: input.notes,
            validUntil: new Date(
              Date.now() + input.validDays * 86400000,
            ).toISOString(),
          },
          actor,
        );
        if (input.status === "Enviada")
          quote = (await quoteCommand(
            quote.id,
            { status: "Enviada", editVersion: quote.editVersion },
            actor,
          )) as typeof quote;
        return {
          created: true,
          quote: publicQuote(quote),
          proposalUrl: `/cotizaciones/${quote.id}`,
        };
      },
    }),
    publicarCotizacionPortal: tool({
      description:
        "Publica una versión de propuesta sin modificar su contenido ni reemplazar una aceptación anterior.",
      inputSchema: z.object({
        quoteId: z.string().default(""),
        quoteNumber: z.string().default(""),
        projectId: z.string().default(""),
        projectName: z.string().default(""),
      }),
      execute: async (input) => {
        if (!commercial) return { error: "Sin permisos comerciales." };
        const projectId = input.projectId || context.currentProjectId;
        if (
          !input.quoteId &&
          !input.quoteNumber &&
          !projectId &&
          !input.projectName
        )
          return { error: "Indica una propuesta o proyecto." };
        const matches = await prisma.quote.findMany({
          where: {
            deletedAt: null,
            ...(input.quoteId
              ? { id: input.quoteId }
              : input.quoteNumber
                ? { number: input.quoteNumber }
                : projectId
                  ? { projectId }
                  : {
                      project: {
                        name: {
                          equals: input.projectName,
                          mode: "insensitive",
                        },
                        visibility: "COMPANY",
                        deletedAt: null,
                      },
                    }),
          },
          include: quoteInclude,
          take: 2,
        });
        if (matches.length !== 1)
          return { error: "Indica una única revisión para publicar." };
        const quote = matches[0];
        const updated = (await quoteCommand(
          quote.id,
          {
            status: "Enviada",
            editVersion: quote.editVersion,
            contentHash: quoteHash(quote),
          },
          actor,
        )) as typeof quote;
        return {
          quote: publicQuote(updated),
          proposalUrl: `/cotizaciones/${quote.id}`,
        };
      },
    }),
    crearFactura: tool({
      description:
        "Crea un registro interno de cobro. No emite un documento tributario SII. Requiere confirmación explícita.",
      inputSchema: z.object({
        number: z.string(),
        client: z.string(),
        amount: z.number().positive(),
        status: z
          .enum(["Pendiente", "Pagado", "Vencido", "Cancelado"])
          .default("Pendiente"),
        dueDate: z.string(),
        confirmado: z.boolean().default(false),
      }),
      execute: async (input) => {
        if (!finance) return { error: "Sin permisos financieros." };
        if (!input.confirmado) return confirm(context, "crearFactura", input);
        return createInvoice(input, actor);
      },
    }),
    registrarPago: tool({
      description:
        "Registra un pago parcial o total contra un documento interno. Conserva el importe original y rechaza sobrepagos. La orden directa con factura e importe claros cuenta como confirmación.",
      inputSchema: z.object({
        invoiceNumber: z.string(),
        amount: z.number().positive(),
        paidAt: z.string().default(""),
        method: z.string().default("Transferencia"),
        reference: z.string().default(""),
        notes: z.string().default(""),
        confirmado: z.boolean().default(false),
      }),
      execute: async (input, options) => {
        if (!finance) return { error: "Sin permisos financieros." };
        const invoices = await prisma.invoice.findMany({
          where: { number: input.invoiceNumber, deletedAt: null },
          take: 2,
        });
        if (invoices.length !== 1)
          return { error: "Indica el número exacto del documento." };
        if (!input.confirmado) return confirm(context, "registrarPago", input);
        return recordPayment(
          {
            ...input,
            invoiceId: invoices[0].id,
            currency: invoices[0].currency,
            paidAt: input.paidAt || new Date().toISOString().slice(0, 10),
            requestKey: `ai:${options.toolCallId}`,
          },
          actor,
        );
      },
    }),
  };
}
