import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify, recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { invalidateCache } from "@/lib/server-cache";
import { periodForPreviousMonth } from "@/lib/tax/f29";
import { buildF29Snapshot } from "@/lib/tax/f29-service";

function formatClp(value: number) {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
    }).format(Math.round(value));
}

async function confirmationRequired(context: GilbertoToolContext, action: string, details: Record<string, unknown>) {
    let actionId: string | null = null;
    if (context.userId) {
        const idempotencyKey = `approval:${createHash("sha256")
            .update(`${context.userId}:${new Date().toISOString().slice(0, 10)}:${action}:${JSON.stringify(details)}`)
            .digest("hex")}`;
        const thread = context.threadId
            ? await prisma.assistantThread.findFirst({ where: { id: context.threadId, userId: context.userId }, select: { id: true } })
            : null;
        const queued = await prisma.assistantAction.upsert({
            where: { idempotencyKey },
            create: {
                userId: context.userId,
                threadId: thread?.id ?? null,
                type: action,
                title: action.replace(/([a-z])([A-Z])/g, "$1 $2"),
                description: "Acción preparada por Gilberto a la espera de aprobación.",
                payload: details as Prisma.InputJsonValue,
                riskLevel: action === "enviarCorreo" || action === "registrarPago" ? "high" : "medium",
                requiresApproval: true,
                idempotencyKey,
            },
            update: {},
        });
        actionId = queued.id;
    }

    return {
        requiresConfirmation: true,
        action,
        actionId,
        details,
        message: "La acción quedó preparada y auditada. Puedes aprobarla desde Hoy o responder 'confirmo' para ejecutarla.",
    };
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const requirementCategorySchema = z.enum(["Funcional", "No funcional"]);
const requirementPrioritySchema = z.enum(["Baja", "Media", "Alta"]);
const quoteItemSchema = z.object({
    description: z.string().min(1).max(500),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().nonnegative().describe("Precio unitario neto antes de IVA, en CLP."),
});

function calculateQuoteTotals(
    items: Array<{ quantity: number; unitPrice: number }>,
    discount: number,
    taxRate: number,
) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = subtotal * Math.max(0, discount) / 100;
    const net = subtotal - discountAmount;
    const tax = net * Math.max(0, taxRate) / 100;
    return { subtotal, discountAmount, net, tax, total: net + tax };
}

export type GilbertoToolContext = {
    pathname?: string;
    currentProjectId?: string | null;
    threadId?: string | null;
    userId?: string | null;
    role?: string | null;
};

async function resolveProjectForTool(input: {
    projectId?: string;
    projectName?: string;
    contextProjectId?: string | null;
}) {
    if (input.projectId || input.contextProjectId) {
        const project = await prisma.project.findUnique({
            where: { id: input.projectId || input.contextProjectId || "", deletedAt: null },
            select: { id: true, name: true, status: true, agreedAmount: true, clientId: true, client: { select: { id: true, name: true, company: true } } },
        });
        if (project) return { project };
    }

    const projectName = input.projectName?.trim();
    if (!projectName) {
        return {
            error: "Necesito saber a que proyecto te refieres. Puedes abrir el proyecto o decirme el nombre.",
        };
    }

    const matches = await prisma.project.findMany({
        where: {
            deletedAt: null,
            name: { contains: projectName, mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, status: true, agreedAmount: true, clientId: true, client: { select: { id: true, name: true, company: true } } },
    });

    if (matches.length === 1) return { project: matches[0] };
    if (matches.length > 1) {
        return {
            error: "Encontre varios proyectos parecidos. Dime cual usar.",
            matches,
        };
    }

    return { error: "No encontre un proyecto con ese nombre." };
}

async function resolveClientForTool(clientName: string) {
    const name = clientName.trim();
    if (!name) return { error: "Necesito saber a que cliente te refieres." };

    const matches = await prisma.client.findMany({
        where: {
            deletedAt: null,
            OR: [
                { name: { contains: name, mode: "insensitive" } },
                { company: { contains: name, mode: "insensitive" } },
            ],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, company: true, email: true },
    });

    if (matches.length === 1) return { client: matches[0] };
    if (matches.length > 1) return { error: "Encontre varios clientes parecidos. Dime cual usar.", matches };
    return { error: "No encontre un cliente con ese nombre." };
}

async function nextQuoteNumber() {
    const prefix = `COT-${new Date().getFullYear()}-`;
    const latest = await prisma.quote.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: "desc" },
        select: { number: true },
    });
    const latestSequence = Number(latest?.number.slice(prefix.length)) || 0;

    for (let sequence = latestSequence + 1; sequence < latestSequence + 1000; sequence += 1) {
        const number = `${prefix}${String(sequence).padStart(4, "0")}`;
        const exists = await prisma.quote.findUnique({ where: { number }, select: { id: true } });
        if (!exists) return number;
    }

    return `${prefix}${Date.now()}`;
}

export function createTools(context: GilbertoToolContext = {}) {
    const canUseFinance = ["ADMIN", "MANAGER", "FINANCE"].includes(context.role ?? "");
    return {
    getProyectos: tool({
        description:
            "Obtiene proyectos de PuroCode con cliente, estado, monto acordado y fechas relevantes. Puede incluir activos, finalizados o todos.",
        inputSchema: z.object({
            estado: z.enum(["todos", "activos", "finalizados"]).default("todos").describe("Filtro de proyectos a consultar."),
        }),
        execute: async ({ estado }) => {
            const statusWhere =
                estado === "activos"
                    ? { status: { not: "Completado" } }
                    : estado === "finalizados"
                      ? { status: "Completado" }
                      : {};
            const where = { deletedAt: null, ...statusWhere };

            const projects = await prisma.project.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    status: true,
                    agreedAmount: true,
                    createdAt: true,
                    updatedAt: true,
                    client: {
                        select: {
                            name: true,
                            company: true,
                        },
                    },
                },
                orderBy: {
                    updatedAt: "desc",
                },
                take: 50,
            });

            return projects.map((project) => ({
                ...project,
                agreedAmountClp: formatClp(project.agreedAmount),
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
            }));
        },
    }),
    getFinanzas: tool({
        description:
            "Resume las finanzas operativas de PuroCode usando facturas: total facturado, neto sin IVA, cobrado, pendiente y vencido.",
        inputSchema: z.object({}),
        execute: async () => {
            if (!canUseFinance) return { error: "No tienes permiso para consultar finanzas." };
            const [total, paid, pending, overdue] = await Promise.all([
                prisma.invoice.aggregate({
                    where: { deletedAt: null },
                    _sum: {
                        amount: true,
                        netAmount: true,
                    },
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    where: {
                        deletedAt: null,
                        status: "Pagado",
                    },
                    _sum: {
                        amount: true,
                    },
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    where: {
                        deletedAt: null,
                        status: "Pendiente",
                    },
                    _sum: {
                        amount: true,
                    },
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    where: {
                        deletedAt: null,
                        status: "Vencido",
                    },
                    _sum: {
                        amount: true,
                    },
                    _count: true,
                }),
            ]);

            const totalAmount = total._sum.amount ?? 0;
            const paidAmount = paid._sum.amount ?? 0;
            const pendingAmount = pending._sum.amount ?? 0;
            const overdueAmount = overdue._sum.amount ?? 0;
            const netAmount = total._sum.netAmount ?? totalAmount / 1.19;

            return {
                totalAmount,
                totalAmountClp: formatClp(totalAmount),
                netAmount,
                netAmountClp: formatClp(netAmount),
                vatAmount: totalAmount - netAmount,
                vatAmountClp: formatClp(totalAmount - netAmount),
                paidAmount,
                paidAmountClp: formatClp(paidAmount),
                pendingAmount,
                pendingAmountClp: formatClp(pendingAmount),
                overdueAmount,
                overdueAmountClp: formatClp(overdueAmount),
                invoiceCount: total._count,
                paidInvoiceCount: paid._count,
                pendingInvoiceCount: pending._count,
                overdueInvoiceCount: overdue._count,
            };
        },
    }),
    getF29Chile: tool({
        description:
            "Calcula y concilia el Formulario 29 chileno de un periodo AAAA-MM. Devuelve IVA débito/crédito, PPM, total estimado, vencimiento, brechas de respaldo y, si existe, el F29 oficial declarado. Úsala para cualquier pregunta sobre impuestos, IVA, PPM o cuánto pagar de F29.",
        inputSchema: z.object({
            periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
                .describe("Periodo tributario AAAA-MM. Si se omite usa el mes anterior."),
        }),
        execute: async ({ periodo }) => {
            if (!canUseFinance) return { error: "No tienes permiso para consultar impuestos." };
            const result = await buildF29Snapshot(periodo ?? periodForPreviousMonth());
            return {
                period: result.period,
                estimate: {
                    total: result.estimatedTotal,
                    totalClp: formatClp(result.estimatedTotal),
                    vatPayable: result.vatPayable,
                    vatPayableClp: formatClp(result.vatPayable),
                    ppmAmount: result.ppmAmount,
                    ppmAmountClp: formatClp(result.ppmAmount),
                    ppmRate: result.ppmRate,
                    dueDateChile: result.dueDateChile,
                },
                officialF29: result.officialF29
                    ? {
                        ...result.officialF29,
                        totalClp: formatClp(result.officialF29.total),
                        debitVatClp: formatClp(result.officialF29.debitVat),
                        ppmAmountClp: formatClp(result.officialF29.ppmAmount),
                        varianceClp: formatClp(result.officialF29.variance),
                    }
                    : null,
                confidence: result.confidence,
                gaps: result.gaps,
                sources: result.sources,
                company: result.profile
                    ? {
                        rut: result.profile.rut,
                        legalName: result.profile.legalName,
                        taxRegime: result.profile.taxRegime,
                        ppmRateConfirmed: result.profile.ppmRateConfirmed,
                    }
                    : null,
                disclaimer: result.disclaimer,
            };
        },
    }),
    consultarMemoriaPersonal: tool({
        description:
            "Consulta preferencias y datos personales no sensibles que el usuario pidió recordar. Úsala cuando necesites confirmar una preferencia persistente.",
        inputSchema: z.object({
            categoria: z.enum(["preferencia", "persona", "trabajo", "rutina", "contexto"]).optional(),
        }),
        execute: async ({ categoria }) => {
            if (!context.userId) return { error: "No hay un usuario autenticado." };
            const memories = await prisma.assistantMemory.findMany({
                where: {
                    userId: context.userId,
                    ...(categoria ? { category: categoria } : {}),
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
                take: 30,
                select: { key: true, value: true, category: true, confirmedAt: true },
            });
            return memories;
        },
    }),
    guardarMemoriaPersonal: tool({
        description:
            "Guarda una preferencia o dato personal no sensible cuando el usuario pide explícitamente recordarlo. Nunca guarda contraseñas, API keys, tokens ni credenciales.",
        inputSchema: z.object({
            clave: z.string().min(2).max(80).describe("Nombre corto y estable, por ejemplo formato_reportes."),
            valor: z.string().min(1).max(1000),
            categoria: z.enum(["preferencia", "persona", "trabajo", "rutina", "contexto"]).default("preferencia"),
        }),
        execute: async ({ clave, valor, categoria }) => {
            if (!context.userId) return { error: "No hay un usuario autenticado." };
            if (/(contrase|password|api.?key|token|secreto|credencial)/i.test(`${clave} ${valor}`)) {
                return { error: "No puedo guardar secretos ni credenciales en la memoria personal." };
            }
            const key = clave.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ_-]+/gi, "_").slice(0, 80);
            const memory = await prisma.assistantMemory.upsert({
                where: { userId_key: { userId: context.userId, key } },
                create: {
                    userId: context.userId,
                    key,
                    value: valor.trim(),
                    category: categoria,
                    source: "usuario",
                    confidence: 1,
                    confirmedAt: new Date(),
                },
                update: {
                    value: valor.trim(),
                    category: categoria,
                    source: "usuario",
                    confidence: 1,
                    confirmedAt: new Date(),
                    expiresAt: null,
                },
            });
            await recordAudit({
                action: "UPSERT",
                entityType: "AssistantMemory",
                entityId: memory.id,
                summary: `Gilberto recordó ${key}`,
                metadata: { category: categoria },
            });
            return { saved: true, key: memory.key, value: memory.value, category: memory.category };
        },
    }),
    olvidarMemoriaPersonal: tool({
        description:
            "Desactiva una memoria personal cuando el usuario pide explícitamente olvidarla. La conserva en auditoría, pero deja de usarla inmediatamente.",
        inputSchema: z.object({ clave: z.string().min(2).max(80) }),
        execute: async ({ clave }) => {
            if (!context.userId) return { error: "No hay un usuario autenticado." };
            const memory = await prisma.assistantMemory.findUnique({
                where: { userId_key: { userId: context.userId, key: clave.trim().toLowerCase() } },
            });
            if (!memory) return { error: "No encontré esa memoria." };
            await prisma.assistantMemory.update({
                where: { id: memory.id },
                data: { expiresAt: new Date(), confidence: 0 },
            });
            await recordAudit({
                action: "EXPIRE",
                entityType: "AssistantMemory",
                entityId: memory.id,
                summary: `Gilberto dejó de usar ${memory.key}`,
            });
            return { forgotten: true, key: memory.key };
        },
    }),
    prepararAccionGilberto: tool({
        description:
            "Crea una acción durable y auditada sin ejecutarla. Úsala cuando el usuario pida dejar algo en cola, pendiente de aprobación o para ejecutar más tarde.",
        inputSchema: z.object({
            tipo: z.string().min(2).max(80),
            titulo: z.string().min(2).max(200),
            descripcion: z.string().min(1).max(1000),
            riesgo: z.enum(["low", "medium", "high"]).default("medium"),
            detalles: z.record(z.string(), z.string()).default({}),
            requiereAprobacion: z.boolean().default(true),
        }),
        execute: async ({ tipo, titulo, descripcion, riesgo, detalles, requiereAprobacion }) => {
            if (!context.userId) return { error: "No hay un usuario autenticado." };
            const thread = context.threadId
                ? await prisma.assistantThread.findFirst({ where: { id: context.threadId, userId: context.userId }, select: { id: true } })
                : null;
            const action = await prisma.assistantAction.create({
                data: {
                    userId: context.userId,
                    threadId: thread?.id ?? null,
                    type: tipo,
                    title: titulo,
                    description: descripcion,
                    payload: detalles,
                    riskLevel: riesgo,
                    requiresApproval: requiereAprobacion,
                    status: requiereAprobacion ? "pending" : "approved",
                    approvedAt: requiereAprobacion ? null : new Date(),
                    idempotencyKey: `queued:${randomBytes(16).toString("hex")}`,
                },
            });
            await recordAudit({
                action: "QUEUE",
                entityType: "AssistantAction",
                entityId: action.id,
                summary: titulo,
                metadata: { type: tipo, riskLevel: riesgo, requiresApproval: requiereAprobacion },
            });
            return {
                queued: true,
                actionId: action.id,
                status: action.status,
                title: action.title,
                message: requiereAprobacion ? "La acción quedó pendiente de aprobación en Hoy." : "La acción quedó aprobada y lista para ejecutar.",
            };
        },
    }),
    consultarAccionesGilberto: tool({
        description: "Lista acciones preparadas, pendientes de aprobación o ya aprobadas para el usuario actual.",
        inputSchema: z.object({ estado: z.enum(["pending", "approved", "failed", "all"]).default("all") }),
        execute: async ({ estado }) => {
            if (!context.userId) return { error: "No hay un usuario autenticado." };
            return prisma.assistantAction.findMany({
                where: {
                    userId: context.userId,
                    ...(estado === "all" ? { status: { in: ["pending", "approved", "failed"] } } : { status: estado }),
                },
                orderBy: { createdAt: "desc" },
                take: 20,
                select: { id: true, type: true, title: true, description: true, payload: true, riskLevel: true, status: true, requiresApproval: true, approvedAt: true, error: true },
            });
        },
    }),
    finalizarAccionGilberto: tool({
        description: "Marca como completada o fallida una acción de Gilberto después de intentar su ejecución y guarda el resultado auditado.",
        inputSchema: z.object({
            actionId: z.string().uuid(),
            estado: z.enum(["completed", "failed"]),
            resumen: z.string().min(1).max(1000),
        }),
        execute: async ({ actionId, estado, resumen }) => {
            if (!context.userId) return { error: "No hay un usuario autenticado." };
            const action = await prisma.assistantAction.findFirst({ where: { id: actionId, userId: context.userId } });
            if (!action) return { error: "Acción no encontrada." };
            if (!["pending", "approved", "failed"].includes(action.status)) return { error: `La acción ya está ${action.status}.` };
            const updated = await prisma.assistantAction.update({
                where: { id: action.id },
                data: {
                    status: estado,
                    executedAt: new Date(),
                    result: estado === "completed" ? { summary: resumen } : undefined,
                    error: estado === "failed" ? resumen : null,
                },
            });
            await recordAudit({
                action: estado === "completed" ? "EXECUTE" : "FAIL",
                entityType: "AssistantAction",
                entityId: updated.id,
                summary: resumen,
                metadata: { type: updated.type, riskLevel: updated.riskLevel },
            });
            return { id: updated.id, status: updated.status, summary: resumen };
        },
    }),
    getResumenEjecutivo: tool({
        description:
            "Entrega un resumen ejecutivo de proyectos, finanzas, facturas y notas recientes en pesos chilenos.",
        inputSchema: z.object({}),
        execute: async () => {
            if (!canUseFinance) return { error: "No tienes permiso para consultar el resumen financiero." };
            const [activeProjects, completedProjects, invoices, recentNotes] = await Promise.all([
                prisma.project.count({ where: { deletedAt: null, status: { not: "Completado" } } }),
                prisma.project.count({ where: { deletedAt: null, status: "Completado" } }),
                prisma.invoice.groupBy({
                    by: ["status"],
                    where: { deletedAt: null },
                    _sum: { amount: true },
                    _count: { id: true },
                }),
                prisma.note.findMany({
                    where: { deletedAt: null },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                    select: {
                        id: true,
                        title: true,
                        folder: true,
                        updatedAt: true,
                    },
                }),
            ]);

            const totalAmount = invoices.reduce((sum, item) => sum + (item._sum.amount ?? 0), 0);
            const paidAmount = invoices.find((item) => item.status === "Pagado")?._sum.amount ?? 0;
            const pendingAmount = invoices.find((item) => item.status === "Pendiente")?._sum.amount ?? 0;
            const overdueAmount = invoices.find((item) => item.status === "Vencido")?._sum.amount ?? 0;

            return {
                projects: {
                    active: activeProjects,
                    completed: completedProjects,
                },
                finances: {
                    totalAmount,
                    totalAmountClp: formatClp(totalAmount),
                    paidAmount,
                    paidAmountClp: formatClp(paidAmount),
                    pendingAmount,
                    pendingAmountClp: formatClp(pendingAmount),
                    overdueAmount,
                    overdueAmountClp: formatClp(overdueAmount),
                },
                recentNotes: recentNotes.map((note) => ({
                    ...note,
                    updatedAt: note.updatedAt.toISOString(),
                })),
            };
        },
    }),
    getAlertas: tool({
        description:
            "Detecta alertas operativas: facturas vencidas, proyectos sin actividad reciente, montos pendientes y notas con posibles pendientes.",
        inputSchema: z.object({}),
        execute: async () => {
            const staleDate = new Date();
            staleDate.setDate(staleDate.getDate() - 14);

            const [overdueInvoices, staleProjects, notesWithTodos] = await Promise.all([
                prisma.invoice.findMany({
                    where: {
                        deletedAt: null,
                        OR: [
                            { status: "Vencido" },
                            {
                                status: "Pendiente",
                                dueDate: { lt: new Date() },
                            },
                        ],
                    },
                    orderBy: { dueDate: "asc" },
                    take: 10,
                    select: {
                        id: true,
                        number: true,
                        client: true,
                        amount: true,
                        status: true,
                        dueDate: true,
                    },
                }),
                prisma.project.findMany({
                    where: {
                        deletedAt: null,
                        status: { not: "Completado" },
                        updatedAt: { lt: staleDate },
                    },
                    orderBy: { updatedAt: "asc" },
                    take: 10,
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        updatedAt: true,
                        client: { select: { name: true } },
                    },
                }),
                prisma.note.findMany({
                    where: {
                        deletedAt: null,
                        OR: [
                            { title: { contains: "pendiente", mode: "insensitive" } },
                            { content: { contains: "pendiente", mode: "insensitive" } },
                            { content: { contains: "revisar", mode: "insensitive" } },
                            { content: { contains: "hacer", mode: "insensitive" } },
                        ],
                    },
                    orderBy: { updatedAt: "desc" },
                    take: 10,
                    select: {
                        id: true,
                        title: true,
                        folder: true,
                        updatedAt: true,
                    },
                }),
            ]);

            return {
                overdueInvoices: overdueInvoices.map((invoice) => ({
                    ...invoice,
                    amountClp: formatClp(invoice.amount),
                    dueDate: invoice.dueDate.toISOString(),
                })),
                staleProjects: staleProjects.map((project) => ({
                    ...project,
                    updatedAt: project.updatedAt.toISOString(),
                })),
                notesWithTodos: notesWithTodos.map((note) => ({
                    ...note,
                    updatedAt: note.updatedAt.toISOString(),
                })),
            };
        },
    }),
    buscarNotas: tool({
        description:
            "Busca notas operativas por texto o carpeta. No busca ni devuelve secretos, credenciales ni datos de la Boveda.",
        inputSchema: z.object({
            query: z.string().default("").describe("Texto a buscar en titulo o contenido."),
            folder: z.string().default("").describe("Carpeta opcional."),
        }),
        execute: async ({ query, folder }) => {
            const q = query.trim();
            const cleanFolder = folder.trim();
            const notes = await prisma.note.findMany({
                where: {
                    deletedAt: null,
                    ...(cleanFolder ? { folder: cleanFolder } : {}),
                    ...(q
                        ? {
                              OR: [
                                  { title: { contains: q, mode: "insensitive" } },
                                  { content: { contains: q, mode: "insensitive" } },
                              ],
                          }
                        : {}),
                },
                orderBy: { updatedAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    title: true,
                    content: true,
                    folder: true,
                    updatedAt: true,
                },
            });

            return notes.map((note) => ({
                ...note,
                updatedAt: note.updatedAt.toISOString(),
            }));
        },
    }),
    buscarNotasProyecto: tool({
        description:
            "Busca notas internas de un proyecto especifico. Usa el proyecto actual si el usuario dice este proyecto o esta dentro de /proyectos/[id].",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
            query: z.string().default("").describe("Texto a buscar en titulo o contenido."),
        }),
        execute: async ({ projectId, projectName, query }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            const q = query.trim();
            const notes = await prisma.note.findMany({
                where: {
                    projectId: resolved.project.id,
                    deletedAt: null,
                    ...(q
                        ? {
                              OR: [
                                  { title: { contains: q, mode: "insensitive" } },
                                  { content: { contains: q, mode: "insensitive" } },
                              ],
                          }
                        : {}),
                },
                orderBy: { updatedAt: "desc" },
                take: 20,
                select: {
                    id: true,
                    title: true,
                    content: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            return {
                project: resolved.project,
                notes: notes.map((note) => ({
                    ...note,
                    createdAt: note.createdAt.toISOString(),
                    updatedAt: note.updatedAt.toISOString(),
                })),
            };
        },
    }),
    getDetalleProyecto: tool({
        description:
            "Obtiene un resumen completo de un proyecto: cliente, estado, monto, requisitos, notas recientes, tecnologias, factura y actividad. No devuelve credenciales ni secretos.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
        }),
        execute: async ({ projectId, projectName }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            const project = await prisma.project.findUnique({
                where: { id: resolved.project.id },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    status: true,
                    agreedAmount: true,
                    createdAt: true,
                    updatedAt: true,
                    client: { select: { name: true, email: true, company: true } },
                    requirements: {
                        orderBy: [{ completed: "asc" }, { priority: "desc" }],
                        take: 20,
                        select: { id: true, description: true, category: true, priority: true, completed: true },
                    },
                    techs: {
                        orderBy: { category: "asc" },
                        select: { name: true, category: true },
                    },
                    notes: {
                        orderBy: { updatedAt: "desc" },
                        take: 8,
                        select: { id: true, title: true, content: true, updatedAt: true },
                    },
                    invoices: {
                        orderBy: { createdAt: "desc" },
                        take: 10,
                        select: { number: true, amount: true, status: true, dueDate: true, paidAt: true },
                    },
                    statusLogs: {
                        orderBy: { createdAt: "desc" },
                        take: 8,
                        select: { status: true, note: true, createdAt: true },
                    },
                },
            });

            if (!project) return { error: "No encontre el proyecto." };
            const invoice = project.invoices[0] ?? null;

            return {
                ...project,
                agreedAmountClp: formatClp(project.agreedAmount),
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
                notes: project.notes.map((note) => ({ ...note, updatedAt: note.updatedAt.toISOString() })),
                invoice: invoice
                    ? {
                          ...invoice,
                          amountClp: formatClp(invoice.amount),
                          dueDate: invoice.dueDate.toISOString(),
                          paidAt: invoice.paidAt?.toISOString() ?? null,
                      }
                    : null,
                invoices: project.invoices.map((item) => ({
                    ...item,
                    amountClp: formatClp(item.amount),
                    dueDate: item.dueDate.toISOString(),
                    paidAt: item.paidAt?.toISOString() ?? null,
                })),
                statusLogs: project.statusLogs.map((log) => ({ ...log, createdAt: log.createdAt.toISOString() })),
            };
        },
    }),
    detectarPendientesProyecto: tool({
        description:
            "Detecta pendientes accionables de un proyecto usando requisitos incompletos, notas recientes y estado de factura. No lee credenciales ni secretos.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
        }),
        execute: async ({ projectId, projectName }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            const today = new Date();
            const project = await prisma.project.findUnique({
                where: { id: resolved.project.id },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    updatedAt: true,
                    client: { select: { name: true } },
                    requirements: {
                        where: { completed: false },
                        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
                        take: 15,
                        select: { description: true, category: true, priority: true },
                    },
                    notes: {
                        where: {
                            OR: [
                                { title: { contains: "pendiente", mode: "insensitive" } },
                                { content: { contains: "pendiente", mode: "insensitive" } },
                                { content: { contains: "revisar", mode: "insensitive" } },
                                { content: { contains: "hacer", mode: "insensitive" } },
                                { content: { contains: "enviar", mode: "insensitive" } },
                            ],
                        },
                        orderBy: { updatedAt: "desc" },
                        take: 10,
                        select: { title: true, content: true, updatedAt: true },
                    },
                    invoices: {
                        orderBy: { createdAt: "desc" },
                        take: 10,
                        select: { number: true, amount: true, status: true, dueDate: true },
                    },
                },
            });

            if (!project) return { error: "No encontre el proyecto." };
            const pendingInvoice = project.invoices.find((item) => item.status !== "Pagado") ?? null;

            return {
                project: {
                    id: project.id,
                    name: project.name,
                    status: project.status,
                    client: project.client,
                    updatedAt: project.updatedAt.toISOString(),
                },
                incompleteRequirements: project.requirements,
                notesWithPossibleTodos: project.notes.map((note) => ({ ...note, updatedAt: note.updatedAt.toISOString() })),
                invoiceAlert:
                    pendingInvoice
                        ? {
                              ...pendingInvoice,
                              amountClp: formatClp(pendingInvoice.amount),
                              dueDate: pendingInvoice.dueDate.toISOString(),
                              overdue: pendingInvoice.dueDate < today,
                          }
                        : null,
            };
        },
    }),
    analizarRequisitosProyecto: tool({
        description:
            "Analiza requisitos funcionales/no funcionales de un proyecto usando requisitos existentes y notas recientes. Sirve para detectar faltantes, duplicados, ambiguedades y proximos requisitos a crear. No escribe datos.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
        }),
        execute: async ({ projectId, projectName }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            const project = await prisma.project.findUnique({
                where: { id: resolved.project.id },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    client: { select: { name: true } },
                    requirements: {
                        orderBy: [{ completed: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
                        select: {
                            id: true,
                            description: true,
                            category: true,
                            priority: true,
                            completed: true,
                            updatedAt: true,
                        },
                    },
                    notes: {
                        orderBy: { updatedAt: "desc" },
                        take: 12,
                        select: {
                            title: true,
                            content: true,
                            updatedAt: true,
                        },
                    },
                },
            });

            if (!project) return { error: "No encontre el proyecto." };

            return {
                project: {
                    id: project.id,
                    name: project.name,
                    status: project.status,
                    client: project.client,
                },
                requirements: project.requirements.map((requirement) => ({
                    ...requirement,
                    updatedAt: requirement.updatedAt.toISOString(),
                })),
                recentNotes: project.notes.map((note) => ({
                    ...note,
                    updatedAt: note.updatedAt.toISOString(),
                })),
                instruction:
                    "En la respuesta, separa hallazgos en funcionales y no funcionales. Si propones cambios, pide confirmacion antes de crear o modificar requisitos.",
            };
        },
    }),
    crearRequisitoProyecto: tool({
        description:
            "Crea un requisito funcional o no funcional dentro de un proyecto. Requiere confirmacion explicita antes de escribir.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
            description: z.string().min(1).max(500).describe("Descripcion clara del requisito."),
            category: requirementCategorySchema.default("Funcional").describe("Tipo de requisito."),
            priority: requirementPrioritySchema.default("Media").describe("Prioridad del requisito."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ projectId, projectName, description, category, priority, confirmado }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            if (!confirmado) {
                return confirmationRequired(context, "crearRequisitoProyecto", {
                    projectId: resolved.project.id,
                    projectName: resolved.project.name,
                    clientName: resolved.project.client.name,
                    description,
                    category,
                    priority,
                });
            }

            const requirement = await prisma.projectRequirement.create({
                data: {
                    projectId: resolved.project.id,
                    description,
                    category,
                    priority,
                },
                select: {
                    id: true,
                    projectId: true,
                    description: true,
                    category: true,
                    priority: true,
                    completed: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            invalidateCache(`project:${resolved.project.id}`);

            return {
                project: resolved.project,
                requirement: {
                    ...requirement,
                    createdAt: requirement.createdAt.toISOString(),
                    updatedAt: requirement.updatedAt.toISOString(),
                },
            };
        },
    }),
    actualizarRequisitoProyecto: tool({
        description:
            "Modifica descripcion, categoria, prioridad o estado de completado de un requisito de proyecto. Requiere confirmacion explicita antes de escribir.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
            requirementId: z.string().min(1).describe("ID del requisito a modificar."),
            description: z.string().min(1).max(500).optional().describe("Nueva descripcion, si corresponde."),
            category: requirementCategorySchema.optional().describe("Nueva categoria, si corresponde."),
            priority: requirementPrioritySchema.optional().describe("Nueva prioridad, si corresponde."),
            completed: z.boolean().optional().describe("Nuevo estado de completado, si corresponde."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ projectId, projectName, requirementId, description, category, priority, completed, confirmado }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            const current = await prisma.projectRequirement.findFirst({
                where: {
                    id: requirementId,
                    projectId: resolved.project.id,
                },
                select: {
                    id: true,
                    description: true,
                    category: true,
                    priority: true,
                    completed: true,
                },
            });

            if (!current) return { error: "No encontre ese requisito dentro del proyecto indicado." };

            const next = {
                description: description ?? current.description,
                category: category ?? current.category,
                priority: priority ?? current.priority,
                completed: completed ?? current.completed,
            };

            if (!confirmado) {
                return confirmationRequired(context, "actualizarRequisitoProyecto", {
                    projectId: resolved.project.id,
                    projectName: resolved.project.name,
                    requirementId,
                    before: current,
                    after: next,
                });
            }

            const requirement = await prisma.projectRequirement.update({
                where: { id: requirementId },
                data: next,
                select: {
                    id: true,
                    projectId: true,
                    description: true,
                    category: true,
                    priority: true,
                    completed: true,
                    updatedAt: true,
                },
            });

            invalidateCache(`project:${resolved.project.id}`);

            return {
                project: resolved.project,
                requirement: {
                    ...requirement,
                    updatedAt: requirement.updatedAt.toISOString(),
                },
            };
        },
    }),
    prepararCorreoProyecto: tool({
        description:
            "Prepara un borrador de correo para cliente usando datos del proyecto, requisitos y notas. No envia el correo y no incluye secretos.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
            objetivo: z.string().min(1).max(300).describe("Objetivo del correo: seguimiento, cobro, avance, solicitud de feedback, etc."),
        }),
        execute: async ({ projectId, projectName, objetivo }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            const project = await prisma.project.findUnique({
                where: { id: resolved.project.id },
                select: {
                    name: true,
                    status: true,
                    updatedAt: true,
                    client: { select: { name: true, email: true } },
                    requirements: {
                        where: { completed: false },
                        take: 8,
                        select: { description: true, priority: true },
                    },
                    notes: {
                        orderBy: { updatedAt: "desc" },
                        take: 5,
                        select: { title: true, content: true },
                    },
                    invoices: {
                        orderBy: { createdAt: "desc" },
                        take: 10,
                        select: { number: true, amount: true, status: true, dueDate: true },
                    },
                },
            });

            if (!project) return { error: "No encontre el proyecto." };
            const invoice = project.invoices[0] ?? null;

            return {
                objetivo,
                to: project.client.email ?? "",
                subject: `${project.name} - ${objetivo}`,
                context: {
                    project: project.name,
                    client: project.client.name,
                    status: project.status,
                    updatedAt: project.updatedAt.toISOString(),
                    pendingRequirements: project.requirements,
                    recentNotes: project.notes,
                    invoice: invoice
                        ? {
                              ...invoice,
                              amountClp: formatClp(invoice.amount),
                              dueDate: invoice.dueDate.toISOString(),
                          }
                        : null,
                },
                instruction: "Redacta el correo en la respuesta final. No inventes compromisos ni fechas.",
            };
        },
    }),
    enviarCorreo: tool({
        description:
            "Envia un correo mediante Resend. Requiere confirmacion explicita. Puede usar el email del cliente de un proyecto si se entrega projectId/projectName. No debe incluir secretos, credenciales, tokens ni contrasenas.",
        inputSchema: z.object({
            to: z.string().default("").describe("Destinatario. Opcional si se indica un proyecto con email de cliente."),
            projectId: z.string().default("").describe("ID del proyecto para resolver el email del cliente. Opcional."),
            projectName: z.string().default("").describe("Nombre del proyecto para resolver el email del cliente. Opcional."),
            subject: z.string().min(1).max(160).describe("Asunto del correo."),
            body: z.string().min(1).max(6000).describe("Cuerpo del correo en texto plano."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente enviar este correo."),
        }),
        execute: async ({ to, projectId, projectName, subject, body, confirmado }) => {
            let recipient = to.trim();
            let projectContext: { id: string; name: string; client: { name: string; email: string | null } } | null = null;

            if (!recipient && (projectId.trim() || projectName.trim() || context.currentProjectId)) {
                const resolved = await resolveProjectForTool({
                    projectId: projectId.trim() || undefined,
                    projectName,
                    contextProjectId: context.currentProjectId,
                });

                if (!resolved.project) return resolved;

                const project = await prisma.project.findUnique({
                    where: { id: resolved.project.id },
                    select: {
                        id: true,
                        name: true,
                        client: { select: { name: true, email: true } },
                    },
                });

                if (!project) return { error: "No encontre el proyecto." };
                projectContext = project;
                recipient = project.client.email ?? "";
            }

            if (!recipient || !isValidEmail(recipient)) {
                return { error: "Necesito un email de destinatario valido antes de enviar." };
            }

            if (/(contrase|password|token|api key|secret|credencial|boveda|llave)/i.test(body)) {
                return { error: "No puedo enviar correos que parezcan contener secretos o credenciales." };
            }

            if (!confirmado) {
                return confirmationRequired(context, "enviarCorreo", {
                    to: recipient,
                    subject,
                    body,
                    project: projectContext ? { id: projectContext.id, name: projectContext.name, client: projectContext.client.name } : null,
                });
            }

            if (!context.userId) {
                return { error: "Necesito una sesion activa para registrar y enviar correos." };
            }

            const message = await prisma.emailMessage.create({
                data: {
                    userId: context.userId,
                    to: recipient,
                    subject,
                    body,
                    status: "sending",
                    source: "gilberto",
                },
            });

            let result: { id?: string } | null = null;

            try {
                result = await sendEmail({
                    to: recipient,
                    subject,
                    text: body,
                });

                await prisma.emailMessage.update({
                    where: { id: message.id },
                    data: {
                        status: "sent",
                        resendId: result?.id ?? null,
                        sentAt: new Date(),
                        error: null,
                    },
                });
            } catch (error) {
                await prisma.emailMessage.update({
                    where: { id: message.id },
                    data: {
                        status: "failed",
                        error: error instanceof Error ? error.message : "No se pudo enviar el correo.",
                    },
                });

                return { error: "Resend no pudo enviar el correo. Quedo registrado como fallido en el Centro de correos." };
            }

            return {
                sent: true,
                resendId: result?.id ?? null,
                to: recipient,
                subject,
            };
        },
    }),
    guardarBorradorCorreo: tool({
        description:
            "Guarda un borrador en el Centro de correos. Puede resolver destinatario desde el proyecto actual. No envia el correo.",
        inputSchema: z.object({
            to: z.string().default("").describe("Destinatario. Opcional si se indica un proyecto con email de cliente."),
            projectId: z.string().default("").describe("ID del proyecto para resolver el email del cliente. Opcional."),
            projectName: z.string().default("").describe("Nombre del proyecto para resolver el email del cliente. Opcional."),
            subject: z.string().min(1).max(160).describe("Asunto del correo."),
            body: z.string().min(1).max(6000).describe("Cuerpo del correo en texto plano."),
        }),
        execute: async ({ to, projectId, projectName, subject, body }) => {
            if (!context.userId) {
                return { error: "Necesito una sesion activa para guardar borradores." };
            }

            let recipient = to.trim();

            if (!recipient && (projectId.trim() || projectName.trim() || context.currentProjectId)) {
                const resolved = await resolveProjectForTool({
                    projectId: projectId.trim() || undefined,
                    projectName,
                    contextProjectId: context.currentProjectId,
                });

                if (!resolved.project) return resolved;

                const project = await prisma.project.findUnique({
                    where: { id: resolved.project.id },
                    select: { client: { select: { email: true } } },
                });

                recipient = project?.client.email ?? "";
            }

            if (!recipient || !isValidEmail(recipient)) {
                return { error: "Necesito un email de destinatario valido para guardar el borrador." };
            }

            const draft = await prisma.emailMessage.create({
                data: {
                    userId: context.userId,
                    to: recipient,
                    subject,
                    body,
                    status: "draft",
                    source: "gilberto",
                },
            });

            return {
                saved: true,
                id: draft.id,
                to: draft.to,
                subject: draft.subject,
            };
        },
    }),
    crearNota: tool({
        description:
            "Crea una nota operativa en NoteCode. Sirve para registrar pendientes, ideas, mejoras o recordatorios generales. No guarda contrasenas ni secretos.",
        inputSchema: z.object({
            title: z.string().min(1).max(120).describe("Titulo breve de la nota."),
            content: z.string().max(4000).default("").describe("Contenido de la nota."),
            folder: z.string().min(1).max(80).default("General").describe("Carpeta donde guardar la nota."),
        }),
        execute: async ({ title, content, folder }) => {
            const note = await prisma.note.create({
                data: {
                    title,
                    content,
                    folder,
                },
                select: {
                    id: true,
                    title: true,
                    content: true,
                    folder: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            invalidateCache("notes");

            return {
                ...note,
                createdAt: note.createdAt.toISOString(),
                updatedAt: note.updatedAt.toISOString(),
            };
        },
    }),
    crearNotaProyecto: tool({
        description:
            "Crea una nota interna dentro de un proyecto especifico. No crea una nota general. Requiere confirmacion explicita.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay proyecto actual."),
            projectName: z.string().default("").describe("Nombre del proyecto si no hay ID o contexto."),
            title: z.string().min(1).max(160).describe("Titulo breve de la nota del proyecto."),
            content: z.string().max(4000).default("").describe("Contenido de la nota del proyecto."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ projectId, projectName, title, content, confirmado }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });

            if (!resolved.project) return resolved;

            if (!confirmado) {
                return confirmationRequired(context, "crearNotaProyecto", {
                    projectId: resolved.project.id,
                    projectName: resolved.project.name,
                    clientName: resolved.project.client.name,
                    title,
                    content,
                });
            }

            const note = await prisma.note.create({
                data: {
                    projectId: resolved.project.id,
                    title,
                    content,
                    folder: "Proyecto",
                },
                select: {
                    id: true,
                    projectId: true,
                    title: true,
                    content: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            invalidateCache(`project:${resolved.project.id}`);

            return {
                project: resolved.project,
                note: {
                    ...note,
                    createdAt: note.createdAt.toISOString(),
                    updatedAt: note.updatedAt.toISOString(),
                },
            };
        },
    }),
    actualizarNota: tool({
        description:
            "Actualiza una nota operativa existente. Requiere confirmacion explicita antes de modificar.",
        inputSchema: z.object({
            id: z.string().min(1).describe("ID de la nota a actualizar."),
            title: z.string().min(1).max(120).optional().describe("Nuevo titulo."),
            content: z.string().max(4000).optional().describe("Nuevo contenido."),
            folder: z.string().min(1).max(80).optional().describe("Nueva carpeta."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ id, title, content, folder, confirmado }) => {
            if (!confirmado) {
                return confirmationRequired(context, "actualizarNota", { id, title, content, folder });
            }

            const current = await prisma.note.findUnique({ where: { id } });
            if (!current) return { error: "No encontre una nota con ese ID." };

            const note = await prisma.note.update({
                where: { id },
                data: {
                    title: title ?? current.title,
                    content: content ?? current.content,
                    folder: folder ?? current.folder,
                },
                select: {
                    id: true,
                    title: true,
                    content: true,
                    folder: true,
                    updatedAt: true,
                },
            });

            invalidateCache("notes");

            return {
                ...note,
                updatedAt: note.updatedAt.toISOString(),
            };
        },
    }),
    crearPendiente: tool({
        description:
            "Crea un pendiente como nota en la carpeta Pendientes. Requiere confirmacion explicita.",
        inputSchema: z.object({
            title: z.string().min(1).max(120),
            content: z.string().max(2000).default(""),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ title, content, confirmado }) => {
            if (!confirmado) {
                return confirmationRequired(context, "crearPendiente", { title, content, folder: "Pendientes" });
            }

            const note = await prisma.note.create({
                data: {
                    title,
                    content,
                    folder: "Pendientes",
                },
                select: {
                    id: true,
                    title: true,
                    content: true,
                    folder: true,
                    createdAt: true,
                },
            });

            invalidateCache("notes");

            return {
                ...note,
                createdAt: note.createdAt.toISOString(),
            };
        },
    }),
    crearProyecto: tool({
        description:
            "Crea un proyecto en NoteCode con cliente, estado y monto acordado en CLP. Requiere confirmacion explicita.",
        inputSchema: z.object({
            name: z.string().min(1).max(160),
            clientName: z.string().min(1).max(160),
            description: z.string().max(2000).default(""),
            status: z.enum(["Planificado", "En progreso", "Revision", "Revisión", "Completado"]).default("Planificado"),
            agreedAmount: z.number().nonnegative().default(0).describe("Monto acordado en pesos chilenos."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ name, clientName, description, status, agreedAmount, confirmado }) => {
            if (!confirmado) {
                return confirmationRequired(context, "crearProyecto", {
                    name,
                    clientName,
                    description,
                    status,
                    agreedAmountClp: formatClp(agreedAmount),
                });
            }

            const clientId = await resolveClientId({ clientName });
            const project = await prisma.project.create({
                data: {
                    name,
                    description: description || null,
                    status,
                    agreedAmount,
                    clientId,
                },
                include: {
                    client: { select: { id: true, name: true } },
                },
            });

            await syncProjectInvoice(project.id);
            invalidateCache("projects:");
            invalidateCache("invoices");

            return {
                ...project,
                agreedAmountClp: formatClp(project.agreedAmount),
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
            };
        },
    }),
    crearFactura: tool({
        description:
            "Crea una factura en finanzas por un monto en pesos chilenos. Requiere confirmacion explicita.",
        inputSchema: z.object({
            number: z.string().min(1).max(80).describe("Numero de factura."),
            client: z.string().min(1).max(160).describe("Cliente de la factura."),
            amount: z.number().positive().describe("Monto total en pesos chilenos."),
            status: z.enum(["Pendiente", "Pagado", "Vencido", "Cancelado"]).default("Pendiente"),
            dueDate: z.string().min(1).describe("Fecha de vencimiento en formato ISO o YYYY-MM-DD."),
            confirmado: z.boolean().default(false).describe("Debe ser true solo cuando el usuario confirmo explicitamente."),
        }),
        execute: async ({ number, client, amount, status, dueDate, confirmado }) => {
            if (!canUseFinance) return { error: "No tienes permiso para crear facturas." };
            if (!confirmado) {
                return confirmationRequired(context, "crearFactura", {
                    number,
                    client,
                    amountClp: formatClp(amount),
                    status,
                    dueDate,
                });
            }

            const parsedDueDate = new Date(dueDate);
            if (Number.isNaN(parsedDueDate.getTime())) {
                return { error: "La fecha de vencimiento no es valida. Usa YYYY-MM-DD." };
            }

            const invoice = await prisma.invoice.create({
                data: {
                    number,
                    client,
                    amount,
                    status,
                    dueDate: parsedDueDate,
                    paidAt: status === "Pagado" ? new Date() : null,
                },
                select: {
                    id: true,
                    number: true,
                    client: true,
                    amount: true,
                    status: true,
                    dueDate: true,
                    paidAt: true,
                    createdAt: true,
                },
            });

            invalidateCache("invoices");

            return {
                ...invoice,
                amountClp: formatClp(invoice.amount),
                dueDate: invoice.dueDate.toISOString(),
                paidAt: invoice.paidAt?.toISOString() ?? null,
                createdAt: invoice.createdAt.toISOString(),
            };
        },
    }),
    crearCotizacion: tool({
        description:
            "Crea una cotizacion formal en el ERP, vinculada al proyecto y cliente, con una propuesta imprimible o guardable como PDF. Usala de inmediato cuando el usuario diga crear o generar una cotizacion; una orden directa no necesita una segunda confirmacion.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("ID del proyecto. Opcional si hay un proyecto abierto."),
            projectName: z.string().default("").describe("Nombre del proyecto. Opcional si hay un proyecto abierto."),
            clientName: z.string().default("").describe("Cliente, solo si la cotizacion no pertenece a un proyecto."),
            title: z.string().max(200).default("").describe("Titulo de la propuesta. Si se omite se usa el nombre del proyecto."),
            items: z.array(quoteItemSchema).max(30).default([]).describe("Lineas netas antes de IVA. Si se omiten, se usa el monto total o el monto acordado del proyecto."),
            totalClp: z.number().nonnegative().default(0).describe("Total final con IVA incluido, usado para crear una linea automatica si no se entregan items."),
            taxRate: z.number().min(0).max(100).default(19).describe("IVA en porcentaje."),
            discount: z.number().min(0).max(99).default(0).describe("Descuento porcentual."),
            validDays: z.number().int().min(1).max(365).default(30),
            terms: z.string().max(4000).default(""),
            notes: z.string().max(2000).default(""),
            status: z.enum(["Borrador", "Enviada"]).default("Borrador"),
        }),
        execute: async ({ projectId, projectName, clientName, title, items, totalClp, taxRate, discount, validDays, terms, notes, status }) => {
            const hasProjectReference = Boolean(projectId.trim() || projectName.trim() || context.currentProjectId);
            const resolvedProject = hasProjectReference
                ? await resolveProjectForTool({
                      projectId: projectId.trim() || undefined,
                      projectName,
                      contextProjectId: context.currentProjectId,
                  })
                : null;

            if (resolvedProject && !resolvedProject.project) return resolvedProject;
            const project = resolvedProject?.project ?? null;

            let client: { id: string; name: string; company: string | null };
            if (project) {
                client = project.client;
                const existing = await prisma.quote.findFirst({
                    where: { projectId: project.id, deletedAt: null },
                    include: { items: { orderBy: { sortOrder: "asc" } }, client: { select: { id: true, name: true, company: true } } },
                });
                if (existing) {
                    return {
                        alreadyExists: true,
                        message: "Este proyecto ya tiene una cotizacion formal.",
                        quote: existing,
                        totals: calculateQuoteTotals(existing.items, existing.discount, existing.taxRate),
                        proposalUrl: `/cotizaciones/${existing.id}`,
                        erpUrl: "/erp?tab=cotizaciones",
                    };
                }
            } else {
                const resolvedClient = await resolveClientForTool(clientName);
                if (!resolvedClient.client) return resolvedClient;
                client = resolvedClient.client;
            }

            let quoteItems = items.map((item) => ({
                description: item.description.trim(),
                quantity: item.quantity,
                unitPrice: item.unitPrice,
            }));

            if (!quoteItems.length) {
                const finalTotal = totalClp > 0 ? totalClp : project?.agreedAmount ?? 0;
                if (finalTotal <= 0) {
                    return { error: "Necesito el monto total o al menos una linea con precio para crear la cotizacion." };
                }
                const factor = (1 - discount / 100) * (1 + taxRate / 100);
                quoteItems = [{
                    description: title.trim() || project?.name || "Servicios profesionales",
                    quantity: 1,
                    unitPrice: finalTotal / factor,
                }];
            }

            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + validDays);
            const number = await nextQuoteNumber();
            const quote = await prisma.quote.create({
                data: {
                    number,
                    clientId: client.id,
                    projectId: project?.id ?? null,
                    title: title.trim() || project?.name || `Propuesta para ${client.company || client.name}`,
                    status,
                    currency: "CLP",
                    taxRate,
                    discount,
                    validUntil,
                    terms: terms.trim() || null,
                    notes: notes.trim() || null,
                    sentAt: status === "Enviada" ? new Date() : null,
                    items: {
                        create: quoteItems.map((item, index) => ({ ...item, sortOrder: index })),
                    },
                },
                include: {
                    client: { select: { id: true, name: true, company: true, email: true } },
                    project: { select: { id: true, name: true } },
                    items: { orderBy: { sortOrder: "asc" } },
                },
            });

            const totals = calculateQuoteTotals(quote.items, quote.discount, quote.taxRate);
            await Promise.all([
                recordAudit({
                    action: "CREATE",
                    entityType: "Quote",
                    entityId: quote.id,
                    summary: `Cotizacion ${quote.number} creada por Gilberto`,
                    metadata: { projectId: quote.projectId, clientId: quote.clientId, total: totals.total },
                }),
                notify({
                    userId: context.userId,
                    type: "quote",
                    title: `Cotizacion creada: ${quote.number}`,
                    message: `${quote.title} por ${formatClp(totals.total)}.`,
                    href: "/erp?tab=cotizaciones",
                    severity: "success",
                }),
            ]);
            invalidateCache(`project:${project?.id ?? ""}`);

            return {
                created: true,
                quote,
                totals: {
                    ...totals,
                    subtotalClp: formatClp(totals.subtotal),
                    taxClp: formatClp(totals.tax),
                    totalClp: formatClp(totals.total),
                },
                proposalUrl: `/cotizaciones/${quote.id}`,
                erpUrl: "/erp?tab=cotizaciones",
                instruction: "Informa que la cotizacion ya fue creada y entrega el enlace de propuesta. Indica que desde ahi puede imprimirse o guardarse como PDF.",
            };
        },
    }),
    publicarCotizacionPortal: tool({
        description:
            "Publica una cotizacion existente en el portal del cliente cambiandola de Borrador a Enviada. Usala cuando el usuario diga subir, publicar, enviar o hacer visible una cotizacion en el portal; no necesita crear otro portal ni pedir confirmacion adicional.",
        inputSchema: z.object({
            quoteId: z.string().default(""),
            quoteNumber: z.string().default(""),
            projectId: z.string().default(""),
            projectName: z.string().default(""),
        }),
        execute: async ({ quoteId, quoteNumber, projectId, projectName }) => {
            let resolvedProjectId = projectId.trim() || context.currentProjectId || "";
            if (!resolvedProjectId && projectName.trim()) {
                const resolved = await resolveProjectForTool({ projectName });
                if (!resolved.project) return resolved;
                resolvedProjectId = resolved.project.id;
            }

            const matches = await prisma.quote.findMany({
                where: {
                    deletedAt: null,
                    ...(quoteId.trim()
                        ? { id: quoteId.trim() }
                        : quoteNumber.trim()
                          ? { number: { contains: quoteNumber.trim(), mode: "insensitive" } }
                          : resolvedProjectId
                            ? { projectId: resolvedProjectId }
                            : {}),
                },
                orderBy: { updatedAt: "desc" },
                take: 5,
                include: {
                    client: { select: { id: true, name: true, company: true } },
                    project: { select: { id: true, name: true } },
                    items: { orderBy: { sortOrder: "asc" } },
                },
            });
            if (!quoteId.trim() && !quoteNumber.trim() && !resolvedProjectId) {
                return { error: "Necesito la cotizacion, su numero o el proyecto al que pertenece." };
            }
            if (matches.length !== 1) {
                return matches.length
                    ? { error: "Encontre varias cotizaciones. Indica cual publicar.", matches: matches.map((item) => ({ id: item.id, number: item.number, title: item.title, project: item.project?.name })) }
                    : { error: "No encontre una cotizacion para publicar." };
            }

            const quote = matches[0];
            const [updated, activePortals] = await Promise.all([
                prisma.quote.update({
                    where: { id: quote.id },
                    data: { status: "Enviada", sentAt: quote.sentAt ?? new Date() },
                    include: {
                        client: { select: { id: true, name: true, company: true } },
                        project: { select: { id: true, name: true } },
                        items: { orderBy: { sortOrder: "asc" } },
                    },
                }),
                prisma.clientPortalToken.count({
                    where: {
                        clientId: quote.clientId,
                        revokedAt: null,
                        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                    },
                }),
            ]);
            const totals = calculateQuoteTotals(updated.items, updated.discount, updated.taxRate);
            await Promise.all([
                recordAudit({
                    action: "PUBLISH",
                    entityType: "Quote",
                    entityId: updated.id,
                    summary: `Cotizacion ${updated.number} publicada por Gilberto`,
                    metadata: { clientId: updated.clientId, projectId: updated.projectId, activePortals },
                }),
                notify({
                    userId: context.userId,
                    type: "quote",
                    title: `Cotizacion publicada: ${updated.number}`,
                    message: `${updated.title} ya es visible en el portal de ${updated.client.company || updated.client.name}.`,
                    href: "/erp?tab=cotizaciones",
                    severity: "success",
                }),
            ]);

            return {
                published: true,
                quote: updated,
                totals: { ...totals, totalClp: formatClp(totals.total) },
                activePortals,
                visibleInPortal: activePortals > 0,
                proposalUrl: `/cotizaciones/${updated.id}`,
                erpUrl: "/erp?tab=cotizaciones",
                instruction: activePortals
                    ? "Confirma que ya esta visible en el portal existente."
                    : "La cotizacion quedo Enviada, pero el cliente no tiene un acceso de portal activo.",
            };
        },
    }),
    actualizarRegistroERP: tool({
        description:
            "Actualiza registros existentes del ERP: cotizacion, proyecto, oportunidad, factura, ticket, contrato, aprobacion, orden de compra, activo, remuneracion o automatizacion. Sirve para cambiar estados y campos operativos; una orden directa autoriza cambios reversibles.",
        inputSchema: z.object({
            area: z.enum(["cotizacion", "proyecto", "oportunidad", "factura", "ticket", "contrato", "aprobacion", "orden-compra", "activo", "remuneracion", "automatizacion"]),
            identifier: z.string().default("").describe("ID, numero, titulo o nombre. Para proyecto puede usarse la pagina actual."),
            status: z.string().max(100).default(""),
            fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}).describe(
                "Campos adicionales. Ejemplos: notes, validUntil, agreedAmount, targetDate, priority, assignee, feedback, monthlyAmount, includedHours, active, location o renewalDate.",
            ),
        }),
        execute: async ({ area, identifier, status, fields }) => {
            const term = identifier.trim();
            const stringField = (key: string) => typeof fields[key] === "string" ? String(fields[key]).trim() : "";
            const optionalNumber = (key: string) => typeof fields[key] === "number" ? Number(fields[key]) : undefined;
            const optionalBoolean = (key: string) => typeof fields[key] === "boolean" ? Boolean(fields[key]) : undefined;
            const optionalDate = (key: string) => {
                const value = stringField(key);
                if (!value) return undefined;
                const parsed = new Date(value);
                return Number.isNaN(parsed.getTime()) ? undefined : parsed;
            };
            const requireUnique = <T extends { id: string }>(matches: T[], label: string) => {
                if (matches.length === 1) return { item: matches[0] };
                if (!matches.length) return { error: `No encontre ${label}.` };
                return { error: `Encontre varios registros para ${label}. Indica el ID o numero exacto.`, matches };
            };

            let item: { id: string };
            let href = "/erp";

            if (area === "cotizacion") {
                const matches = await prisma.quote.findMany({
                    where: {
                        deletedAt: null,
                        ...(term ? { OR: [{ id: term }, { number: { contains: term, mode: "insensitive" } }, { title: { contains: term, mode: "insensitive" } }] } : {}),
                    },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "la cotizacion");
                if (!resolved.item) return resolved;
                const nextStatus = status || undefined;
                item = await prisma.quote.update({
                    where: { id: resolved.item.id },
                    data: {
                        title: stringField("title") || undefined,
                        status: nextStatus,
                        validUntil: optionalDate("validUntil"),
                        terms: fields.terms === null ? null : stringField("terms") || undefined,
                        notes: fields.notes === null ? null : stringField("notes") || undefined,
                        sentAt: nextStatus === "Enviada" ? new Date() : undefined,
                        approvedAt: nextStatus === "Aprobada" ? new Date() : undefined,
                        rejectedAt: nextStatus === "Rechazada" ? new Date() : undefined,
                    },
                });
                href = `/cotizaciones/${item.id}`;
            } else if (area === "proyecto") {
                const projectId = term || context.currentProjectId || "";
                const matches = await prisma.project.findMany({
                    where: { deletedAt: null, ...(projectId ? { OR: [{ id: projectId }, { name: { contains: projectId, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "el proyecto");
                if (!resolved.item) return resolved;
                item = await prisma.project.update({
                    where: { id: resolved.item.id },
                    data: {
                        name: stringField("name") || undefined,
                        description: fields.description === null ? null : stringField("description") || undefined,
                        status: status || undefined,
                        agreedAmount: optionalNumber("agreedAmount"),
                        budgetHours: optionalNumber("budgetHours"),
                        budgetCost: optionalNumber("budgetCost"),
                        startDate: optionalDate("startDate"),
                        targetDate: optionalDate("targetDate"),
                    },
                });
                href = `/proyectos/${item.id}`;
            } else if (area === "oportunidad") {
                const matches = await prisma.opportunity.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { name: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "la oportunidad");
                if (!resolved.item) return resolved;
                item = await prisma.opportunity.update({
                    where: { id: resolved.item.id },
                    data: {
                        stage: status || stringField("stage") || undefined,
                        value: optionalNumber("value"),
                        probability: optionalNumber("probability"),
                        nextAction: fields.nextAction === null ? null : stringField("nextAction") || undefined,
                        expectedClose: optionalDate("expectedClose"),
                        notes: fields.notes === null ? null : stringField("notes") || undefined,
                    },
                });
                href = "/erp?tab=crm";
            } else if (area === "factura") {
                if (!canUseFinance) return { error: "No tienes permiso para modificar facturas." };
                const matches = await prisma.invoice.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { number: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "la factura");
                if (!resolved.item) return resolved;
                item = await prisma.invoice.update({
                    where: { id: resolved.item.id },
                    data: {
                        status: status || undefined,
                        amount: optionalNumber("amount"),
                        dueDate: optionalDate("dueDate"),
                        notes: fields.notes === null ? null : stringField("notes") || undefined,
                        paidAt: status === "Pagado" ? new Date() : undefined,
                    },
                });
                href = "/finanzas";
            } else if (area === "ticket") {
                const matches = await prisma.supportTicket.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { number: { contains: term, mode: "insensitive" } }, { subject: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "el ticket");
                if (!resolved.item) return resolved;
                item = await prisma.supportTicket.update({
                    where: { id: resolved.item.id },
                    data: {
                        status: status || undefined,
                        priority: stringField("priority") || undefined,
                        assignee: fields.assignee === null ? null : stringField("assignee") || undefined,
                        resolvedAt: status === "Resuelto" ? new Date() : undefined,
                        closedAt: status === "Cerrado" ? new Date() : undefined,
                    },
                });
                href = "/erp?tab=soporte";
            } else if (area === "contrato") {
                const matches = await prisma.supportContract.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { name: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "el contrato");
                if (!resolved.item) return resolved;
                item = await prisma.supportContract.update({
                    where: { id: resolved.item.id },
                    data: {
                        status: status || undefined,
                        monthlyAmount: optionalNumber("monthlyAmount"),
                        includedHours: optionalNumber("includedHours"),
                        responseHours: optionalNumber("responseHours"),
                        resolutionHours: optionalNumber("resolutionHours"),
                        endDate: optionalDate("endDate"),
                        autoRenew: optionalBoolean("autoRenew"),
                        notes: fields.notes === null ? null : stringField("notes") || undefined,
                    },
                });
                href = "/erp?tab=contratos";
            } else if (area === "aprobacion") {
                const matches = await prisma.clientApproval.findMany({
                    where: term ? { OR: [{ id: term }, { title: { contains: term, mode: "insensitive" } }] } : {},
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "la aprobacion");
                if (!resolved.item) return resolved;
                item = await prisma.clientApproval.update({
                    where: { id: resolved.item.id },
                    data: {
                        status: status || undefined,
                        feedback: fields.feedback === null ? null : stringField("feedback") || undefined,
                        decidedAt: status && status !== "Pendiente" ? new Date() : undefined,
                        decidedBy: status && status !== "Pendiente" ? "PuroCode" : undefined,
                    },
                });
                href = "/erp?tab=aprobaciones";
            } else if (area === "orden-compra") {
                if (!canUseFinance) return { error: "No tienes permiso para modificar ordenes de compra." };
                const matches = await prisma.purchaseOrder.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { number: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "la orden de compra");
                if (!resolved.item) return resolved;
                item = await prisma.purchaseOrder.update({
                    where: { id: resolved.item.id },
                    data: {
                        status: status || undefined,
                        expectedAt: optionalDate("expectedAt"),
                        notes: fields.notes === null ? null : stringField("notes") || undefined,
                        approvedBy: status === "Aprobada" ? "PuroCode" : undefined,
                        approvedAt: status === "Aprobada" ? new Date() : undefined,
                        receivedAt: status === "Recibida" ? new Date() : undefined,
                    },
                });
                href = "/erp?tab=compras";
            } else if (area === "activo") {
                if (!canUseFinance) return { error: "No tienes permiso para modificar activos." };
                const matches = await prisma.asset.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { name: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "el activo");
                if (!resolved.item) return resolved;
                item = await prisma.asset.update({
                    where: { id: resolved.item.id },
                    data: {
                        status: status || undefined,
                        location: fields.location === null ? null : stringField("location") || undefined,
                        renewalDate: optionalDate("renewalDate"),
                        monthlyCost: optionalNumber("monthlyCost"),
                        notes: fields.notes === null ? null : stringField("notes") || undefined,
                    },
                });
                href = "/erp?tab=activos";
            } else if (area === "remuneracion") {
                if (!canUseFinance) return { error: "No tienes permiso para modificar remuneraciones." };
                const matches = await prisma.payrollPeriod.findMany({
                    where: { deletedAt: null, ...(term ? { OR: [{ id: term }, { name: { contains: term, mode: "insensitive" } }] } : {}) },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "el periodo de remuneraciones");
                if (!resolved.item) return resolved;
                item = await prisma.payrollPeriod.update({
                    where: { id: resolved.item.id },
                    data: { status: status || undefined, paymentDate: optionalDate("paymentDate") ?? (status === "Pagada" ? new Date() : undefined) },
                });
                if (status === "Pagada") await prisma.payrollEntry.updateMany({ where: { periodId: item.id }, data: { status: "Pagado", paidAt: new Date() } });
                href = "/erp?tab=remuneraciones";
            } else {
                const matches = await prisma.automationRule.findMany({
                    where: term ? { OR: [{ id: term }, { name: { contains: term, mode: "insensitive" } }] } : {},
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                });
                const resolved = requireUnique(matches, "la automatizacion");
                if (!resolved.item) return resolved;
                item = await prisma.automationRule.update({
                    where: { id: resolved.item.id },
                    data: { active: optionalBoolean("active"), name: stringField("name") || undefined },
                });
                href = "/erp?tab=automatizaciones";
            }

            await recordAudit({
                action: "UPDATE",
                entityType: area,
                entityId: item.id,
                summary: `Actualizacion ejecutada por Gilberto en ${area}`,
                metadata: { status: status || null, fields },
            });
            return { updated: true, area, item, href };
        },
    }),
    crearRegistroERP: tool({
        description:
            "Crea registros en los modulos que no tienen una herramienta dedicada: contacto, proveedor, contrato, orden de compra, activo, periodo de remuneraciones, automatizacion, asignacion, ausencia o asiento contable. Usa nombres para resolver relaciones o IDs obtenidos con consultarERP.",
        inputSchema: z.object({
            area: z.enum(["contacto", "proveedor", "contrato", "orden-compra", "activo", "remuneracion", "automatizacion", "asignacion", "ausencia", "asiento-contable"]),
            data: z.record(z.string(), z.unknown()).describe(
                "Datos del registro. Contacto: clientName,name,email,phone,position. Proveedor: name,taxId,email,category. Contrato: clientName,projectName,name,startDate,monthlyAmount. Orden: supplierName,projectName,items[{description,quantity,unitPrice}]. Activo: name,type,vendor,assignedTo. Remuneracion: name,startDate,endDate. Automatizacion: name,trigger,action. Asignacion: projectName,memberName,role,allocation. Ausencia: memberName,startDate,endDate,type. Asiento: date,description,lines[{accountCode,debit,credit}].",
            ),
        }),
        execute: async ({ area, data }) => {
            const textValue = (key: string) => typeof data[key] === "string" ? String(data[key]).trim() : "";
            const numberValue = (key: string, fallback = 0) => {
                const parsed = Number(data[key]);
                return Number.isFinite(parsed) ? parsed : fallback;
            };
            const booleanValue = (key: string, fallback = false) => typeof data[key] === "boolean" ? Boolean(data[key]) : fallback;
            const dateValue = (key: string, fallback?: Date) => {
                const raw = textValue(key);
                if (!raw) return fallback ?? null;
                const parsed = new Date(raw);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            };
            const findProject = async () => {
                const id = textValue("projectId") || context.currentProjectId || "";
                const name = textValue("projectName");
                return id || name
                    ? prisma.project.findFirst({ where: { deletedAt: null, ...(id ? { id } : { name: { contains: name, mode: "insensitive" } }) }, select: { id: true, name: true, clientId: true } })
                    : null;
            };
            const findClient = async () => {
                const id = textValue("clientId");
                if (id) return prisma.client.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true } });
                const resolved = await resolveClientForTool(textValue("clientName"));
                return resolved.client ?? null;
            };
            const findSupplier = async () => {
                const id = textValue("supplierId");
                const name = textValue("supplierName");
                return id || name
                    ? prisma.supplier.findFirst({ where: { deletedAt: null, ...(id ? { id } : { name: { contains: name, mode: "insensitive" } }) }, select: { id: true, name: true } })
                    : null;
            };
            const findMember = async () => {
                const id = textValue("teamMemberId");
                const name = textValue("memberName") || textValue("assignedTo");
                return id || name
                    ? prisma.teamMember.findFirst({ where: { deletedAt: null, ...(id ? { id } : { name: { contains: name, mode: "insensitive" } }) }, select: { id: true, name: true } })
                    : null;
            };

            try {
                let item: { id: string };
                let href = "/erp";

                if (area === "contacto") {
                    const client = await findClient();
                    if (!client || !textValue("name")) return { error: "Necesito cliente y nombre del contacto." };
                    item = await prisma.contact.create({
                        data: {
                            clientId: client.id,
                            name: textValue("name"),
                            position: textValue("position") || null,
                            email: textValue("email") || null,
                            phone: textValue("phone") || null,
                            isPrimary: booleanValue("isPrimary"),
                            notes: textValue("notes") || null,
                        },
                    });
                    href = "/erp?tab=contactos";
                } else if (area === "proveedor") {
                    if (!canUseFinance) return { error: "No tienes permiso para crear proveedores." };
                    if (!textValue("name")) return { error: "Necesito el nombre del proveedor." };
                    item = await prisma.supplier.create({
                        data: {
                            name: textValue("name"),
                            taxId: textValue("taxId") || null,
                            email: textValue("email") || null,
                            phone: textValue("phone") || null,
                            category: textValue("category") || "Servicios",
                            notes: textValue("notes") || null,
                        },
                    });
                    href = "/erp?tab=proveedores";
                } else if (area === "contrato") {
                    const [client, project] = await Promise.all([findClient(), findProject()]);
                    const startDate = dateValue("startDate", new Date());
                    if (!client || !textValue("name") || !startDate) return { error: "Necesito cliente, nombre y fecha de inicio del contrato." };
                    item = await prisma.supportContract.create({
                        data: {
                            clientId: client.id,
                            projectId: project?.id ?? null,
                            name: textValue("name"),
                            status: textValue("status") || "Activo",
                            billingCycle: textValue("billingCycle") || "Mensual",
                            monthlyAmount: numberValue("monthlyAmount"),
                            includedHours: numberValue("includedHours"),
                            responseHours: numberValue("responseHours", 24),
                            resolutionHours: numberValue("resolutionHours", 72),
                            startDate,
                            endDate: dateValue("endDate"),
                            autoRenew: booleanValue("autoRenew", true),
                            nextBillingAt: startDate,
                            notes: textValue("notes") || null,
                        },
                    });
                    href = "/erp?tab=contratos";
                } else if (area === "orden-compra") {
                    if (!canUseFinance) return { error: "No tienes permiso para crear ordenes de compra." };
                    const [supplier, project] = await Promise.all([findSupplier(), findProject()]);
                    const lines = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
                    if (!supplier || !lines.length) return { error: "Necesito proveedor y al menos un item." };
                    item = await prisma.purchaseOrder.create({
                        data: {
                            number: textValue("number") || `OC-${new Date().getFullYear()}-${String(await prisma.purchaseOrder.count() + 1).padStart(4, "0")}`,
                            supplierId: supplier.id,
                            projectId: project?.id ?? null,
                            status: textValue("status") || "Borrador",
                            taxRate: numberValue("taxRate", 19),
                            expectedAt: dateValue("expectedAt"),
                            notes: textValue("notes") || null,
                            items: {
                                create: lines.map((line) => ({
                                    description: String(line.description ?? "").trim(),
                                    quantity: Math.max(.01, Number(line.quantity) || 1),
                                    unitPrice: Math.max(0, Number(line.unitPrice) || 0),
                                })),
                            },
                        },
                    });
                    href = "/erp?tab=compras";
                } else if (area === "activo") {
                    if (!canUseFinance) return { error: "No tienes permiso para crear activos." };
                    const member = await findMember();
                    if (!textValue("name")) return { error: "Necesito el nombre del activo." };
                    item = await prisma.asset.create({
                        data: {
                            name: textValue("name"),
                            type: textValue("type") || "Hardware",
                            category: textValue("category") || "General",
                            serialNumber: textValue("serialNumber") || null,
                            vendor: textValue("vendor") || null,
                            assignedToId: member?.id ?? null,
                            purchaseDate: dateValue("purchaseDate"),
                            purchaseCost: numberValue("purchaseCost"),
                            renewalDate: dateValue("renewalDate"),
                            monthlyCost: numberValue("monthlyCost"),
                            status: textValue("status") || (member ? "Asignado" : "Disponible"),
                            location: textValue("location") || null,
                            notes: textValue("notes") || null,
                        },
                    });
                    href = "/erp?tab=activos";
                } else if (area === "remuneracion") {
                    if (!canUseFinance) return { error: "No tienes permiso para crear remuneraciones." };
                    const startDate = dateValue("startDate");
                    const endDate = dateValue("endDate");
                    if (!textValue("name") || !startDate || !endDate) return { error: "Necesito nombre, inicio y termino del periodo." };
                    const members = await prisma.teamMember.findMany({ where: { active: true, deletedAt: null } });
                    item = await prisma.payrollPeriod.create({
                        data: {
                            name: textValue("name"),
                            startDate,
                            endDate,
                            paymentDate: dateValue("paymentDate"),
                            status: textValue("status") || "Borrador",
                            entries: { create: members.map((member) => ({ teamMemberId: member.id, baseSalary: member.monthlySalary, netPay: member.monthlySalary })) },
                        },
                    });
                    href = "/erp?tab=remuneraciones";
                } else if (area === "automatizacion") {
                    if (!textValue("name") || !textValue("trigger") || !textValue("action")) return { error: "Necesito nombre, disparador y accion." };
                    item = await prisma.automationRule.create({
                        data: {
                            name: textValue("name"),
                            trigger: textValue("trigger"),
                            action: textValue("action"),
                            config: data.config && typeof data.config === "object" ? data.config : {},
                            active: booleanValue("active", true),
                        },
                    });
                    href = "/erp?tab=automatizaciones";
                } else if (area === "asignacion") {
                    const [project, member] = await Promise.all([findProject(), findMember()]);
                    if (!project || !member) return { error: "Necesito proyecto y persona del equipo." };
                    item = await prisma.projectAssignment.upsert({
                        where: { projectId_teamMemberId: { projectId: project.id, teamMemberId: member.id } },
                        update: { role: textValue("role") || "Miembro", allocation: numberValue("allocation", 100), startDate: dateValue("startDate"), endDate: dateValue("endDate") },
                        create: { projectId: project.id, teamMemberId: member.id, role: textValue("role") || "Miembro", allocation: numberValue("allocation", 100), startDate: dateValue("startDate"), endDate: dateValue("endDate") },
                    });
                    href = "/erp?tab=asignaciones";
                } else if (area === "ausencia") {
                    const member = await findMember();
                    const startDate = dateValue("startDate");
                    const endDate = dateValue("endDate");
                    if (!member || !startDate || !endDate) return { error: "Necesito persona, inicio y termino de la ausencia." };
                    item = await prisma.teamAbsence.create({
                        data: { teamMemberId: member.id, type: textValue("type") || "Vacaciones", startDate, endDate, notes: textValue("notes") || null },
                    });
                    href = "/erp?tab=ausencias";
                } else {
                    if (!canUseFinance) return { error: "No tienes permiso para crear asientos contables." };
                    const entryDate = dateValue("date", new Date());
                    const rawLines = Array.isArray(data.lines) ? data.lines as Array<Record<string, unknown>> : [];
                    const accountCodes = rawLines.map((line) => String(line.accountCode ?? "").trim()).filter(Boolean);
                    const accounts = await prisma.account.findMany({ where: { code: { in: accountCodes }, active: true } });
                    const lines = rawLines.map((line) => {
                        const account = accounts.find((entry) => entry.code === String(line.accountCode ?? "").trim());
                        return { accountId: account?.id ?? "", description: String(line.description ?? "").trim() || null, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 };
                    });
                    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
                    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
                    if (!entryDate || lines.length < 2 || lines.some((line) => !line.accountId) || Math.abs(debit - credit) > .001) {
                        return { error: "El asiento requiere fecha, al menos dos cuentas validas y debe estar balanceado." };
                    }
                    item = await prisma.journalEntry.create({
                        data: {
                            number: textValue("number") || `ASI-${new Date().getFullYear()}-${String(await prisma.journalEntry.count() + 1).padStart(4, "0")}`,
                            date: entryDate,
                            description: textValue("description"),
                            reference: textValue("reference") || null,
                            createdBy: context.userId,
                            status: textValue("status") || "Borrador",
                            lines: { create: lines },
                        },
                    });
                    href = "/erp?tab=contabilidad";
                }

                await recordAudit({
                    action: "CREATE",
                    entityType: area,
                    entityId: item.id,
                    summary: `Registro creado por Gilberto en ${area}`,
                });
                return { created: true, area, item, href };
            } catch (error) {
                return { error: error instanceof Error ? error.message : "No se pudo crear el registro." };
            }
        },
    }),
    crearAprobacionCliente: tool({
        description:
            "Crea una solicitud de aprobacion visible en el portal del cliente para un proyecto. Una orden directa del usuario autoriza crearla sin otra confirmacion.",
        inputSchema: z.object({
            projectId: z.string().default(""),
            projectName: z.string().default(""),
            type: z.string().min(1).max(80).default("Entregable"),
            title: z.string().min(1).max(200),
            description: z.string().max(3000).default(""),
        }),
        execute: async ({ projectId, projectName, type, title, description }) => {
            const resolved = await resolveProjectForTool({
                projectId: projectId.trim() || undefined,
                projectName,
                contextProjectId: context.currentProjectId,
            });
            if (!resolved.project) return resolved;

            const approval = await prisma.clientApproval.create({
                data: {
                    projectId: resolved.project.id,
                    type,
                    title,
                    description: description.trim() || null,
                },
            });
            await Promise.all([
                recordAudit({
                    action: "CREATE",
                    entityType: "ClientApproval",
                    entityId: approval.id,
                    summary: `Aprobacion solicitada por Gilberto: ${title}`,
                    metadata: { projectId: resolved.project.id },
                }),
                notify({
                    userId: context.userId,
                    type: "approval",
                    title: "Aprobacion de cliente creada",
                    message: `${resolved.project.name}: ${title}`,
                    href: "/erp?tab=aprobaciones",
                }),
            ]);

            return {
                created: true,
                approval,
                project: resolved.project,
                erpUrl: "/erp?tab=aprobaciones",
                portalVisible: true,
            };
        },
    }),
    generarAccesoPortal: tool({
        description:
            "Genera un enlace seguro de portal para un cliente. Usala solo cuando el usuario pida explicitamente crear o regenerar el acceso; el enlace completo se devuelve una sola vez.",
        inputSchema: z.object({
            projectId: z.string().default("").describe("Proyecto desde el que resolver el cliente."),
            projectName: z.string().default(""),
            clientName: z.string().default(""),
            label: z.string().min(1).max(120).default("Portal principal"),
            expiresDays: z.number().int().min(0).max(3650).default(0).describe("0 significa sin vencimiento."),
        }),
        execute: async ({ projectId, projectName, clientName, label, expiresDays }) => {
            const hasProjectReference = Boolean(projectId.trim() || projectName.trim() || context.currentProjectId);
            const resolvedProject = hasProjectReference
                ? await resolveProjectForTool({
                      projectId: projectId.trim() || undefined,
                      projectName,
                      contextProjectId: context.currentProjectId,
                  })
                : null;
            if (resolvedProject && !resolvedProject.project) return resolvedProject;

            let client: { id: string; name: string; company: string | null };
            if (resolvedProject?.project) {
                client = resolvedProject.project.client;
            } else {
                const resolvedClient = await resolveClientForTool(clientName);
                if (!resolvedClient.client) return resolvedClient;
                client = resolvedClient.client;
            }

            const rawToken = randomBytes(32).toString("base64url");
            const expiresAt = expiresDays > 0 ? new Date(Date.now() + expiresDays * 86400000) : null;
            const access = await prisma.clientPortalToken.create({
                data: {
                    clientId: client.id,
                    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
                    label,
                    expiresAt,
                },
                select: { id: true, label: true, expiresAt: true, createdAt: true },
            });
            await recordAudit({
                action: "CREATE",
                entityType: "ClientPortalToken",
                entityId: access.id,
                summary: `Acceso de portal creado por Gilberto para ${client.name}`,
                metadata: { clientId: client.id, expiresAt: expiresAt?.toISOString() ?? null },
            });

            return {
                created: true,
                client,
                access,
                portalUrl: `/portal/${rawToken}`,
                warning: "Muestra este enlace ahora: el token no puede recuperarse despues.",
            };
        },
    }),
    registrarGasto: tool({
        description:
            "Registra un gasto real en el ERP y lo vincula opcionalmente a proyecto y proveedor. Una orden directa y con monto claro autoriza el registro.",
        inputSchema: z.object({
            description: z.string().min(1).max(500),
            amount: z.number().positive().describe("Monto total en CLP."),
            category: z.string().min(1).max(100).default("General"),
            date: z.string().default("").describe("YYYY-MM-DD; vacio usa hoy."),
            projectName: z.string().default(""),
            supplierName: z.string().default(""),
            status: z.enum(["Pendiente", "Pagado", "Reembolsado"]).default("Pagado"),
            recurring: z.boolean().default(false),
            notes: z.string().max(2000).default(""),
        }),
        execute: async ({ description, amount, category, date, projectName, supplierName, status, recurring, notes }) => {
            if (!canUseFinance) return { error: "No tienes permiso para registrar gastos." };
            const parsedDate = date.trim() ? new Date(date) : new Date();
            if (Number.isNaN(parsedDate.getTime())) return { error: "La fecha no es valida. Usa YYYY-MM-DD." };

            const project = projectName.trim()
                ? await prisma.project.findFirst({
                      where: { deletedAt: null, name: { contains: projectName.trim(), mode: "insensitive" } },
                      select: { id: true, name: true },
                  })
                : context.currentProjectId
                  ? await prisma.project.findUnique({ where: { id: context.currentProjectId }, select: { id: true, name: true } })
                  : null;
            const supplier = supplierName.trim()
                ? await prisma.supplier.findFirst({
                      where: { deletedAt: null, name: { contains: supplierName.trim(), mode: "insensitive" } },
                      select: { id: true, name: true },
                  })
                : null;

            if (projectName.trim() && !project) return { error: "No encontre el proyecto indicado." };
            if (supplierName.trim() && !supplier) return { error: "No encontre el proveedor indicado." };

            const expense = await prisma.expense.create({
                data: {
                    projectId: project?.id ?? null,
                    supplierId: supplier?.id ?? null,
                    description,
                    category,
                    amount,
                    date: parsedDate,
                    status,
                    recurring,
                    notes: notes.trim() || null,
                },
            });
            await recordAudit({
                action: "CREATE",
                entityType: "Expense",
                entityId: expense.id,
                summary: `Gasto registrado por Gilberto: ${description}`,
                metadata: { amount, projectId: project?.id ?? null, supplierId: supplier?.id ?? null },
            });

            return {
                created: true,
                expense: { ...expense, amountClp: formatClp(expense.amount) },
                project,
                supplier,
                erpUrl: "/erp?tab=gastos",
            };
        },
    }),
    registrarPago: tool({
        description:
            "Registra un pago contra una factura y actualiza automaticamente su estado. Si el usuario ordena registrarlo e indica claramente factura y monto, esa orden cuenta como confirmacion.",
        inputSchema: z.object({
            invoiceNumber: z.string().min(1).max(100),
            amount: z.number().positive(),
            paidAt: z.string().default("").describe("YYYY-MM-DD; vacio usa hoy."),
            method: z.string().min(1).max(80).default("Transferencia"),
            reference: z.string().max(200).default(""),
            notes: z.string().max(2000).default(""),
            confirmado: z.boolean().default(false).describe("True si el usuario dio una orden directa con factura y monto claros."),
        }),
        execute: async ({ invoiceNumber, amount, paidAt, method, reference, notes, confirmado }) => {
            if (!canUseFinance) return { error: "No tienes permiso para registrar pagos." };
            const invoices = await prisma.invoice.findMany({
                where: { deletedAt: null, number: { contains: invoiceNumber.trim(), mode: "insensitive" } },
                take: 5,
                include: { payments: true },
            });
            if (invoices.length !== 1) {
                return invoices.length
                    ? { error: "Encontre varias facturas parecidas. Indica el numero exacto.", matches: invoices.map((item) => ({ id: item.id, number: item.number, client: item.client, amount: item.amount })) }
                    : { error: "No encontre la factura indicada." };
            }
            const invoice = invoices[0];
            const parsedDate = paidAt.trim() ? new Date(paidAt) : new Date();
            if (Number.isNaN(parsedDate.getTime())) return { error: "La fecha no es valida. Usa YYYY-MM-DD." };
            if (!confirmado) {
                return confirmationRequired(context, "registrarPago", {
                    invoice: invoice.number,
                    client: invoice.client,
                    amountClp: formatClp(amount),
                    paidAt: parsedDate.toISOString().slice(0, 10),
                    method,
                });
            }

            const payment = await prisma.payment.create({
                data: {
                    invoiceId: invoice.id,
                    amount,
                    paidAt: parsedDate,
                    method,
                    reference: reference.trim() || null,
                    notes: notes.trim() || null,
                },
            });
            const paid = invoice.payments.reduce((sum, item) => sum + item.amount, 0) + amount;
            const nextStatus = paid >= invoice.amount ? "Pagado" : "Parcial";
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: nextStatus, paidAt: nextStatus === "Pagado" ? parsedDate : null },
            });
            await recordAudit({
                action: "CREATE",
                entityType: "Payment",
                entityId: payment.id,
                summary: `Pago registrado por Gilberto en ${invoice.number}`,
                metadata: { invoiceId: invoice.id, amount },
            });
            invalidateCache("invoices");

            return {
                created: true,
                payment: { ...payment, amountClp: formatClp(payment.amount) },
                invoice: { number: invoice.number, client: invoice.client, status: nextStatus, paidClp: formatClp(paid), totalClp: formatClp(invoice.amount) },
                erpUrl: "/erp?tab=pagos",
            };
        },
    }),
    getCRM: tool({
        description: "Resume el pipeline comercial, oportunidades, valor ponderado y proximas acciones.",
        inputSchema: z.object({}),
        execute: async () => {
            const opportunities = await prisma.opportunity.findMany({
                where: { deletedAt: null },
                orderBy: [{ expectedClose: "asc" }, { updatedAt: "desc" }],
                take: 50,
                include: { client: { select: { name: true } } },
            });
            return {
                count: opportunities.length,
                totalValue: opportunities.reduce((sum, item) => sum + item.value, 0),
                weightedValue: opportunities.reduce((sum, item) => sum + item.value * item.probability / 100, 0),
                byStage: Object.entries(opportunities.reduce<Record<string, { count: number; value: number }>>((result, item) => {
                    const current = result[item.stage] ?? { count: 0, value: 0 };
                    result[item.stage] = { count: current.count + 1, value: current.value + item.value };
                    return result;
                }, {})).map(([stage, summary]) => ({ stage, ...summary, valueClp: formatClp(summary.value) })),
                opportunities: opportunities.map((item) => ({
                    id: item.id,
                    name: item.name,
                    client: item.client?.name ?? item.company,
                    stage: item.stage,
                    value: item.value,
                    valueClp: formatClp(item.value),
                    probability: item.probability,
                    nextAction: item.nextAction,
                    expectedClose: item.expectedClose?.toISOString() ?? null,
                })),
            };
        },
    }),
    getRentabilidad: tool({
        description: "Calcula rentabilidad por proyecto usando horas, costos del equipo, gastos, facturas y pagos.",
        inputSchema: z.object({
            projectName: z.string().default("").describe("Proyecto opcional. Si se omite, analiza todos."),
        }),
        execute: async ({ projectName }) => {
            if (!canUseFinance) return { error: "No tienes permiso para consultar rentabilidad." };
            const projects = await prisma.project.findMany({
                where: {
                    deletedAt: null,
                    ...(projectName.trim() ? { name: { contains: projectName.trim(), mode: "insensitive" } } : {}),
                },
                include: {
                    client: { select: { name: true } },
                    timeEntries: { include: { teamMember: { select: { hourlyCost: true } } } },
                    expenses: { where: { deletedAt: null } },
                    invoices: { where: { deletedAt: null }, include: { payments: true } },
                },
                take: 30,
            });
            return projects.map((project) => {
                const hours = project.timeEntries.reduce((sum, item) => sum + item.hours, 0);
                const laborCost = project.timeEntries.reduce((sum, item) => sum + item.hours * item.teamMember.hourlyCost, 0);
                const expenseCost = project.expenses.reduce((sum, item) => sum + item.amount, 0);
                const invoiced = project.invoices.reduce((sum, item) => sum + item.amount, 0);
                const collected = project.invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0), 0);
                const revenue = invoiced || project.agreedAmount;
                const cost = laborCost + expenseCost;
                return {
                    id: project.id,
                    project: project.name,
                    client: project.client.name,
                    hours,
                    revenue,
                    revenueClp: formatClp(revenue),
                    cost,
                    costClp: formatClp(cost),
                    collected,
                    collectedClp: formatClp(collected),
                    margin: revenue - cost,
                    marginClp: formatClp(revenue - cost),
                    marginPercent: revenue ? Math.round((revenue - cost) / revenue * 1000) / 10 : 0,
                };
            });
        },
    }),
    getCapacidadEquipo: tool({
        description: "Muestra capacidad y utilizacion semanal del equipo.",
        inputSchema: z.object({}),
        execute: async () => {
            const since = new Date(Date.now() - 7 * 86400000);
            const members = await prisma.teamMember.findMany({
                where: { deletedAt: null, active: true },
                include: { timeEntries: { where: { date: { gte: since } }, select: { hours: true, billable: true } }, assignments: { include: { project: { select: { name: true } } } } },
            });
            return members.map((member) => {
                const used = member.timeEntries.reduce((sum, item) => sum + item.hours, 0);
                return {
                    id: member.id,
                    name: member.name,
                    role: member.role,
                    capacityHours: member.weeklyCapacity,
                    usedHours: used,
                    availableHours: member.weeklyCapacity - used,
                    utilizationPercent: member.weeklyCapacity ? Math.round(used / member.weeklyCapacity * 100) : 0,
                    projects: member.assignments.map((assignment) => assignment.project.name),
                };
            });
        },
    }),
    getSoporte: tool({
        description: "Resume tickets abiertos, prioridades y cumplimiento de SLA.",
        inputSchema: z.object({}),
        execute: async () => {
            const now = new Date();
            const tickets = await prisma.supportTicket.findMany({
                where: { deletedAt: null, status: { notIn: ["Resuelto", "Cerrado"] } },
                orderBy: [{ priority: "asc" }, { resolutionDue: "asc" }],
                include: { client: { select: { name: true } }, project: { select: { name: true } } },
                take: 50,
            });
            return {
                open: tickets.length,
                breached: tickets.filter((item) => item.resolutionDue && item.resolutionDue < now).length,
                tickets: tickets.map((item) => ({
                    id: item.id,
                    number: item.number,
                    subject: item.subject,
                    client: item.client.name,
                    project: item.project?.name ?? null,
                    status: item.status,
                    priority: item.priority,
                    assignee: item.assignee,
                    responseDue: item.responseDue?.toISOString() ?? null,
                    resolutionDue: item.resolutionDue?.toISOString() ?? null,
                    slaBreached: Boolean(item.resolutionDue && item.resolutionDue < now),
                })),
            };
        },
    }),
    consultarERP: tool({
        description:
            "Consulta los modulos nuevos del ERP con datos reales y recientes. Usala para clientes, contactos, cotizaciones, gastos, pagos, contratos, aprobaciones, ordenes de compra, activos, remuneraciones, contabilidad, automatizaciones, notificaciones o accesos de portal.",
        inputSchema: z.object({
            area: z.enum([
                "clientes",
                "contactos",
                "cotizaciones",
                "gastos",
                "pagos",
                "contratos",
                "aprobaciones",
                "ordenes-compra",
                "activos",
                "remuneraciones",
                "contabilidad",
                "automatizaciones",
                "notificaciones",
                "portal",
            ]),
            query: z.string().max(160).default("").describe("Texto opcional para acotar la busqueda."),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ area, query, limit }) => {
            const financialAreas = ["gastos", "pagos", "ordenes-compra", "activos", "remuneraciones", "contabilidad"];
            if (financialAreas.includes(area) && !canUseFinance) {
                return { error: "No tienes permiso para consultar esta informacion financiera." };
            }

            const q = query.trim();
            switch (area) {
                case "clientes":
                    return prisma.client.findMany({
                        where: {
                            deletedAt: null,
                            ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}),
                        },
                        orderBy: { updatedAt: "desc" },
                        take: limit,
                        select: {
                            id: true, name: true, company: true, email: true, phone: true, status: true,
                            _count: { select: { projects: true, opportunities: true, invoices: true, tickets: true } },
                        },
                    });
                case "contactos":
                    return prisma.contact.findMany({
                        where: {
                            deletedAt: null,
                            ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
                        },
                        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
                        take: limit,
                        include: { client: { select: { id: true, name: true, company: true } } },
                    });
                case "cotizaciones": {
                    const quotes = await prisma.quote.findMany({
                        where: {
                            deletedAt: null,
                            ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
                        },
                        orderBy: { createdAt: "desc" },
                        take: limit,
                        include: {
                            client: { select: { id: true, name: true, company: true } },
                            project: { select: { id: true, name: true } },
                            items: { orderBy: { sortOrder: "asc" } },
                        },
                    });
                    return quotes.map((quote) => ({
                        ...quote,
                        totals: calculateQuoteTotals(quote.items, quote.discount, quote.taxRate),
                        proposalUrl: `/cotizaciones/${quote.id}`,
                    }));
                }
                case "gastos":
                    return prisma.expense.findMany({
                        where: { deletedAt: null, ...(q ? { description: { contains: q, mode: "insensitive" } } : {}) },
                        orderBy: { date: "desc" },
                        take: limit,
                        include: { supplier: { select: { name: true } }, project: { select: { name: true } } },
                    });
                case "pagos":
                    return prisma.payment.findMany({
                        orderBy: { paidAt: "desc" },
                        take: limit,
                        include: { invoice: { select: { number: true, client: true, amount: true, status: true } } },
                    });
                case "contratos":
                    return prisma.supportContract.findMany({
                        where: { deletedAt: null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
                        orderBy: { updatedAt: "desc" },
                        take: limit,
                        include: { client: { select: { name: true, company: true } }, project: { select: { name: true } } },
                    });
                case "aprobaciones":
                    return prisma.clientApproval.findMany({
                        where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { project: { name: { contains: q, mode: "insensitive" } } }] } : {},
                        orderBy: { requestedAt: "desc" },
                        take: limit,
                        include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } },
                    });
                case "ordenes-compra":
                    return prisma.purchaseOrder.findMany({
                        where: { deletedAt: null, ...(q ? { number: { contains: q, mode: "insensitive" } } : {}) },
                        orderBy: { createdAt: "desc" },
                        take: limit,
                        include: { supplier: { select: { name: true } }, project: { select: { name: true } }, items: true },
                    });
                case "activos":
                    return prisma.asset.findMany({
                        where: {
                            deletedAt: null,
                            ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { vendor: { contains: q, mode: "insensitive" } }] } : {}),
                        },
                        orderBy: { updatedAt: "desc" },
                        take: limit,
                        select: {
                            id: true, name: true, type: true, category: true, vendor: true, status: true,
                            location: true, renewalDate: true, monthlyCost: true,
                            assignedTo: { select: { name: true } },
                        },
                    });
                case "remuneraciones":
                    return prisma.payrollPeriod.findMany({
                        where: { deletedAt: null },
                        orderBy: { startDate: "desc" },
                        take: limit,
                        include: { entries: { include: { teamMember: { select: { name: true, role: true } } } } },
                    });
                case "contabilidad": {
                    const [accounts, journal] = await Promise.all([
                        prisma.account.findMany({ where: { active: true }, orderBy: { code: "asc" }, take: 100 }),
                        prisma.journalEntry.findMany({
                            orderBy: { date: "desc" },
                            take: limit,
                            include: { lines: { include: { account: { select: { code: true, name: true } } } } },
                        }),
                    ]);
                    return { accounts, journal };
                }
                case "automatizaciones":
                    return prisma.automationRule.findMany({ orderBy: { updatedAt: "desc" }, take: limit });
                case "notificaciones":
                    return prisma.notification.findMany({
                        where: context.userId ? { OR: [{ userId: context.userId }, { userId: null }] } : { userId: null },
                        orderBy: { createdAt: "desc" },
                        take: limit,
                    });
                case "portal":
                    return prisma.clientPortalToken.findMany({
                        orderBy: { createdAt: "desc" },
                        take: limit,
                        select: {
                            id: true, label: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true,
                            client: { select: { id: true, name: true, company: true } },
                        },
                    });
            }
        },
    }),
    crearOportunidad: tool({
        description: "Crea una oportunidad comercial en CRM. Requiere confirmacion explicita.",
        inputSchema: z.object({
            name: z.string().min(1).max(160),
            company: z.string().max(160).default(""),
            contactName: z.string().max(160).default(""),
            email: z.string().max(200).default(""),
            value: z.number().nonnegative().default(0),
            source: z.string().max(80).default("Directo"),
            nextAction: z.string().max(300).default(""),
            confirmado: z.boolean().default(false),
        }),
        execute: async ({ name, company, contactName, email, value, source, nextAction, confirmado }) => {
            if (!confirmado) return confirmationRequired(context, "crearOportunidad", { name, company, contactName, email, valueClp: formatClp(value), source, nextAction });
            const opportunity = await prisma.opportunity.create({
                data: { name, company: company || null, contactName: contactName || null, email: email || null, value, source, nextAction: nextAction || null },
            });
            return { ...opportunity, valueClp: formatClp(opportunity.value) };
        },
    }),
    registrarHoras: tool({
        description: "Registra horas en un proyecto para una persona del equipo. Requiere confirmacion.",
        inputSchema: z.object({
            projectName: z.string().min(1),
            memberName: z.string().min(1),
            description: z.string().min(1).max(500),
            hours: z.number().positive().max(24),
            date: z.string().default(""),
            billable: z.boolean().default(true),
            confirmado: z.boolean().default(false),
        }),
        execute: async ({ projectName, memberName, description, hours, date, billable, confirmado }) => {
            const [project, member] = await Promise.all([
                prisma.project.findFirst({ where: { deletedAt: null, name: { contains: projectName, mode: "insensitive" } } }),
                prisma.teamMember.findFirst({ where: { deletedAt: null, name: { contains: memberName, mode: "insensitive" } } }),
            ]);
            if (!project || !member) return { error: "No encontre el proyecto o la persona indicada." };
            const entryDate = date ? new Date(date) : new Date();
            if (Number.isNaN(entryDate.getTime())) return { error: "La fecha no es valida." };
            if (!confirmado) return confirmationRequired(context, "registrarHoras", { project: project.name, member: member.name, description, hours, date: entryDate.toISOString().slice(0, 10), billable });
            const entry = await prisma.timeEntry.create({ data: { projectId: project.id, teamMemberId: member.id, description, hours, date: entryDate, billable } });
            invalidateCache(`project:${project.id}`);
            return { ...entry, date: entry.date.toISOString() };
        },
    }),
    crearTicketSoporte: tool({
        description: "Crea un ticket de soporte para un cliente o proyecto. Requiere confirmacion explicita.",
        inputSchema: z.object({
            clientName: z.string().min(1),
            projectName: z.string().default(""),
            subject: z.string().min(1).max(160),
            description: z.string().min(1).max(3000),
            priority: z.enum(["Baja", "Media", "Alta", "Critica"]).default("Media"),
            confirmado: z.boolean().default(false),
        }),
        execute: async ({ clientName, projectName, subject, description, priority, confirmado }) => {
            const client = await prisma.client.findFirst({ where: { deletedAt: null, name: { contains: clientName, mode: "insensitive" } } });
            if (!client) return { error: "No encontre el cliente." };
            const project = projectName ? await prisma.project.findFirst({ where: { clientId: client.id, deletedAt: null, name: { contains: projectName, mode: "insensitive" } } }) : null;
            if (!confirmado) return confirmationRequired(context, "crearTicketSoporte", { client: client.name, project: project?.name ?? null, subject, description, priority });
            const count = await prisma.supportTicket.count();
            const createdAt = new Date();
            const ticket = await prisma.supportTicket.create({
                data: {
                    number: `TKT-${createdAt.getFullYear()}-${String(count + 1).padStart(4, "0")}`,
                    clientId: client.id,
                    projectId: project?.id ?? null,
                    subject,
                    description,
                    priority: priority === "Critica" ? "Crítica" : priority,
                    responseDue: new Date(createdAt.getTime() + 24 * 3600000),
                    resolutionDue: new Date(createdAt.getTime() + 72 * 3600000),
                },
            });
            return { ...ticket, createdAt: ticket.createdAt.toISOString(), responseDue: ticket.responseDue?.toISOString(), resolutionDue: ticket.resolutionDue?.toISOString() };
        },
    }),
    };
}

export const tools = createTools();
