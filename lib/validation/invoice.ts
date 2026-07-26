import { z } from "zod";

const optionalId = z.union([z.string().uuid(), z.literal("")]).optional().nullable();
const dateString = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha invalida.");
const invoiceStatus = z.enum(["Pendiente", "Parcial", "Pagado", "Vencido", "Cancelado"]);

export const createInvoiceSchema = z.object({
  number: z.string().trim().min(1).max(100),
  client: z.string().trim().min(1).max(200),
  clientId: optionalId,
  projectId: optionalId,
  amount: z.coerce.number().finite().positive().max(9_999_999_999),
  netAmount: z.coerce.number().finite().nonnegative().max(9_999_999_999).optional(),
  taxRate: z.coerce.number().finite().min(0).max(100).default(19),
  currency: z.literal("CLP").default("CLP"),
  issuedAt: dateString.optional(),
  dueDate: dateString,
  status: invoiceStatus.default("Pendiente"),
  notes: z.string().trim().max(3000).optional().nullable(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  paidAt: z.union([dateString, z.null()]).optional(),
});
