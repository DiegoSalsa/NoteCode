import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { cached, invalidateCache } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";

const MASKED_SECRET = "************";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const data = await cached(`project:${id}`, 30_000, async () => {
            const project = await prisma.project.findUnique({
                where: { id, deletedAt: null },
                include: {
                    client: { select: { id: true, name: true } },
                    owner: { select: { id: true, name: true } },
                    statusLogs: { orderBy: { createdAt: "desc" } },
                    requirements: { orderBy: { createdAt: "desc" } },
                    tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }] },
                    techs: { orderBy: { createdAt: "asc" } },
                    vaultCredentials: {
                        orderBy: { createdAt: "desc" },
                        select: {
                            id: true,
                            name: true,
                            username: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    },
                    notes: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" } },
                    documents: {
                        orderBy: { updatedAt: "desc" },
                        select: { id: true, name: true, category: true, size: true, clientVisible: true, updatedAt: true, createdAt: true },
                    },
                    invoices: {
                      orderBy: { createdAt: "desc" },
                      select: { id: true, number: true, amount: true, status: true, source: true, product: true, dueDate: true, paidAt: true, createdAt: true, updatedAt: true, payments: { select: { amount: true } } },
                    },
                    assignments: {
                      orderBy: { updatedAt: "desc" },
                      include: { teamMember: { select: { id: true, name: true, role: true } } },
                    },
                    timeEntries: {
                      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                      take: 100,
                      include: { teamMember: { select: { id: true, name: true, hourlyCost: true } } },
                    },
                    expenses: {
                      where: { deletedAt: null },
                      orderBy: { date: "desc" },
                      take: 100,
                      select: { id: true, description: true, amount: true, status: true, date: true },
                    },
                    tickets: {
                      where: { deletedAt: null },
                      orderBy: { updatedAt: "desc" },
                      select: { id: true, number: true, subject: true, status: true, priority: true, updatedAt: true },
                    },
                    approvals: {
                      orderBy: { requestedAt: "desc" },
                      select: { id: true, title: true, type: true, status: true, requestedAt: true },
                    },
                    contracts: {
                      where: { deletedAt: null },
                      orderBy: { updatedAt: "desc" },
                      select: { id: true, name: true, status: true, monthlyAmount: true },
                    },
                    quotes: {
                      where: { deletedAt: null },
                      orderBy: [{ createdAt: "desc" }],
                      include: { items: { orderBy: { sortOrder: "asc" } } },
                    },
                },
            });

            if (!project) return null;

            const { statusLogs, requirements, tasks, techs, vaultCredentials, notes, documents, invoices, assignments, timeEntries, expenses, tickets, approvals, contracts, quotes } = project;
            const timeline = [
                ...statusLogs.map((log) => ({
                    id: `status:${log.id}`,
                    type: "status",
                    title: `Estado actualizado a ${log.status}`,
                    description: log.note,
                    at: log.createdAt,
                })),
                ...notes.map((note) => ({
                    id: `note:${note.id}`,
                    type: "note",
                    title: `Nota: ${note.title}`,
                    description: note.content || null,
                    at: note.updatedAt,
                })),
                ...requirements.map((requirement) => ({
                    id: `requirement:${requirement.id}`,
                    type: "requirement",
                    title: `Requisito ${requirement.completed ? "completado" : "registrado"}`,
                    description: requirement.description,
                    at: requirement.updatedAt,
                })),
                ...tasks.map((task) => ({
                    id: `task:${task.id}`,
                    type: "task",
                    title: `Tarea ${task.status}: ${task.title}`,
                    description: task.description,
                    at: task.updatedAt,
                })),
                ...vaultCredentials.map((credential) => ({
                    id: `credential:${credential.id}`,
                    type: "credential",
                    title: `Credencial agregada: ${credential.name}`,
                    description: credential.username,
                    at: credential.createdAt,
                })),
                ...documents.map((document) => ({
                    id: `document:${document.id}`,
                    type: "document",
                    title: `Documento agregado: ${document.name}`,
                    description: document.category,
                    at: document.createdAt,
                })),
                ...invoices.map((invoice) => ({
                        id: `invoice:${invoice.id}`,
                        type: "invoice",
                        title: `Factura ${invoice.number}: ${invoice.status}`,
                        description: `$${invoice.amount.toLocaleString("es-CL")} / vence ${invoice.dueDate.toISOString().slice(0, 10)}`,
                        at: invoice.updatedAt,
                    })),
            ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 80);

            return {
                project,
                statusLogs,
                requirements,
                tasks,
                techs,
                credentials: vaultCredentials.map((credential) => ({
                    ...credential,
                    title: credential.name,
                    service: "Proyecto",
                    password: MASKED_SECRET,
                    url: null,
                    notes: null,
                })),
                notes,
                documents,
                invoice: invoices[0] ?? null,
                invoices,
                operations: {
                    assignments,
                    timeEntries,
                    expenses,
                    tickets,
                    approvals,
                    contracts,
                    quote: quotes[0] ?? null,
                    quotes,
                    totals: {
                        hours: timeEntries.reduce((sum, entry) => sum + entry.hours, 0),
                        approvedHours: timeEntries.reduce((sum, entry) => sum + (entry.approved ? entry.hours : 0), 0),
                        laborCost: timeEntries.reduce((sum, entry) => sum + entry.hours * entry.teamMember.hourlyCost, 0),
                        expenses: expenses.reduce((sum, expense) => sum + expense.amount, 0),
                        invoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
                        collected: invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + payment.amount, 0), 0),
                    },
                },
                timeline: timeline.map((item) => ({ ...item, at: item.at.toISOString() })),
            };
        });

        if (!data) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManage(user)) return NextResponse.json({ error: "Sin permisos para modificar proyectos." }, { status: 403 });
    try {
        const { id } = await params;
        const body = await request.json();
        const existing = await prisma.project.findUnique({ where: { id }, select: { status: true } });
        if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
        const clientId = body.clientId || body.clientName
            ? await resolveClientId({ clientId: body.clientId, clientName: body.clientName })
            : undefined;
        const project = await prisma.project.update({
            where: { id },
            data: {
                name: body.name,
                description: body.description,
                status: body.status,
                agreedAmount: body.agreedAmount === undefined ? undefined : Number(body.agreedAmount) || 0,
                currency: body.currency,
                budgetHours: body.budgetHours === undefined ? undefined : Number(body.budgetHours) || 0,
                budgetCost: body.budgetCost === undefined ? undefined : Number(body.budgetCost) || 0,
                startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
                targetDate: body.targetDate === undefined ? undefined : body.targetDate ? new Date(body.targetDate) : null,
                ownerId: body.ownerId === undefined ? undefined : body.ownerId || null,
                clientId,
                statusLogs: body.status && body.status !== existing.status
                    ? { create: { status: body.status, note: body.statusNote || "Actualizado desde la ficha del proyecto" } }
                    : undefined,
            },
            include: { client: { select: { id: true, name: true } } },
        });
        await syncProjectInvoice(project.id);
        invalidateCache(`project:${id}`);
        invalidateCache("projects:");
        invalidateCache("erp:");
        invalidateCache("vault");
        return NextResponse.json(project);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManage(user)) return NextResponse.json({ error: "Sin permisos para eliminar proyectos." }, { status: 403 });
    try {
        const { id } = await params;
        await prisma.project.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        invalidateCache(`project:${id}`);
        invalidateCache("projects:");
        invalidateCache("erp:");
        invalidateCache("invoices");
        invalidateCache("vault");
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[projects:delete]", error);
        return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
    }
}
