import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
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

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type GilbertoToolContext = {
    pathname?: string;
    currentProjectId?: string | null;
    userId?: string | null;
};

async function resolveProjectForTool(input: {
    projectId?: string;
    projectName?: string;
    contextProjectId?: string | null;
}) {
    if (input.projectId || input.contextProjectId) {
        const project = await prisma.project.findUnique({
            where: { id: input.projectId || input.contextProjectId || "" },
            select: { id: true, name: true, status: true, client: { select: { name: true } } },
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
            name: { contains: projectName, mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, status: true, client: { select: { name: true } } },
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

export function createTools(context: GilbertoToolContext = {}) {
    return {
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
            const notes = await prisma.projectNote.findMany({
                where: {
                    projectId: resolved.project.id,
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
                    invoice: {
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

            return {
                ...project,
                agreedAmountClp: formatClp(project.agreedAmount),
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
                notes: project.notes.map((note) => ({ ...note, updatedAt: note.updatedAt.toISOString() })),
                invoice: project.invoice
                    ? {
                          ...project.invoice,
                          amountClp: formatClp(project.invoice.amount),
                          dueDate: project.invoice.dueDate.toISOString(),
                          paidAt: project.invoice.paidAt?.toISOString() ?? null,
                      }
                    : null,
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
                    invoice: {
                        select: { number: true, amount: true, status: true, dueDate: true },
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
                    updatedAt: project.updatedAt.toISOString(),
                },
                incompleteRequirements: project.requirements,
                notesWithPossibleTodos: project.notes.map((note) => ({ ...note, updatedAt: note.updatedAt.toISOString() })),
                invoiceAlert:
                    project.invoice && project.invoice.status !== "Pagado"
                        ? {
                              ...project.invoice,
                              amountClp: formatClp(project.invoice.amount),
                              dueDate: project.invoice.dueDate.toISOString(),
                              overdue: project.invoice.dueDate < today,
                          }
                        : null,
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
                    invoice: { select: { number: true, amount: true, status: true, dueDate: true } },
                },
            });

            if (!project) return { error: "No encontre el proyecto." };

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
                    invoice: project.invoice
                        ? {
                              ...project.invoice,
                              amountClp: formatClp(project.invoice.amount),
                              dueDate: project.invoice.dueDate.toISOString(),
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
                return confirmationRequired("enviarCorreo", {
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
                return confirmationRequired("crearNotaProyecto", {
                    projectId: resolved.project.id,
                    projectName: resolved.project.name,
                    clientName: resolved.project.client.name,
                    title,
                    content,
                });
            }

            const note = await prisma.projectNote.create({
                data: {
                    projectId: resolved.project.id,
                    title,
                    content,
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
}

export const tools = createTools();
