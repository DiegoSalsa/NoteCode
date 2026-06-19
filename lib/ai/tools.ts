import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { invalidateCache } from "@/lib/server-cache";

function formatClp(value: number) {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
    }).format(Math.round(value));
}

function confirmationRequired(action: string, details: Record<string, unknown>) {
    return {
        requiresConfirmation: true,
        action,
        details,
        message: "Necesito confirmacion antes de ejecutar esta accion. Responde con 'confirmo' si esta correcto.",
    };
}

export const tools = {
    getProyectos: tool({
        description:
            "Obtiene proyectos de PuroCode con cliente, estado, monto acordado y fechas relevantes. Puede incluir activos, finalizados o todos.",
        inputSchema: z.object({
            estado: z.enum(["todos", "activos", "finalizados"]).default("todos").describe("Filtro de proyectos a consultar."),
        }),
        execute: async ({ estado }) => {
            const where =
                estado === "activos"
                    ? { status: { not: "Completado" } }
                    : estado === "finalizados"
                      ? { status: "Completado" }
                      : {};

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
            const [total, paid, pending, overdue] = await Promise.all([
                prisma.invoice.aggregate({
                    _sum: {
                        amount: true,
                    },
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    where: {
                        status: "Pagado",
                    },
                    _sum: {
                        amount: true,
                    },
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    where: {
                        status: "Pendiente",
                    },
                    _sum: {
                        amount: true,
                    },
                    _count: true,
                }),
                prisma.invoice.aggregate({
                    where: {
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
            const netAmount = totalAmount / 1.19;

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
    getResumenEjecutivo: tool({
        description:
            "Entrega un resumen ejecutivo de proyectos, finanzas, facturas y notas recientes en pesos chilenos.",
        inputSchema: z.object({}),
        execute: async () => {
            const [activeProjects, completedProjects, invoices, recentNotes] = await Promise.all([
                prisma.project.count({ where: { status: { not: "Completado" } } }),
                prisma.project.count({ where: { status: "Completado" } }),
                prisma.invoice.groupBy({
                    by: ["status"],
                    _sum: { amount: true },
                    _count: { id: true },
                }),
                prisma.note.findMany({
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
                return confirmationRequired("actualizarNota", { id, title, content, folder });
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
                return confirmationRequired("crearPendiente", { title, content, folder: "Pendientes" });
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
                return confirmationRequired("crearProyecto", {
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
            if (!confirmado) {
                return confirmationRequired("crearFactura", {
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
};
