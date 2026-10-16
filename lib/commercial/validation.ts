import { z } from "zod";

const date = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha inválida.")
  .nullable()
  .optional();
export const paymentPlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SINGLE") }),
  z.object({
    kind: z.literal("DEPOSIT_BALANCE"),
    depositPercent: z.number().min(0.01).max(99.99),
  }),
  z.object({
    kind: z.literal("MILESTONES"),
    entries: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          percent: z.number().positive().max(100),
          dueDate: date,
        }),
      )
      .min(1)
      .max(36),
  }),
]);
export const quoteFields = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  opportunityId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  scope: z.string().max(20_000).nullable().optional(),
  currency: z.enum(["CLP", "USD", "EUR"]),
  taxRate: z.number().finite().min(0).max(100),
  discount: z.number().finite().min(0).max(100),
  validUntil: date,
  terms: z.string().max(10_000).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  paymentPlan: paymentPlanSchema,
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(2000),
        quantity: z.number().finite().positive().max(1_000_000),
        unitPrice: z.number().finite().nonnegative().max(9_999_999_999),
      }),
    )
    .min(1)
    .max(100),
});
export const quotePatch = quoteFields
  .partial()
  .extend({ editVersion: z.number().int().positive() });
export const quoteStatuses = [
  "Borrador",
  "Enviada",
  "Aprobada",
  "Cambios solicitados",
  "Rechazada",
  "Vencida",
  "Reemplazada",
] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];
export function canTransition(from: string, to: string) {
  if (from === to) return true;
  if (from === "Borrador") return ["Enviada", "Reemplazada"].includes(to);
  return (
    from === "Enviada" &&
    [
      "Aprobada",
      "Cambios solicitados",
      "Rechazada",
      "Vencida",
      "Reemplazada",
    ].includes(to)
  );
}
