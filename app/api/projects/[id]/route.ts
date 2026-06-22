import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { cached, invalidateCache } from "@/lib/server-cache";

const MASKED_SECRET = "************";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const data = await cached(`project:${id}`, 30_000, async () => {
            const project = await prisma.project.findUnique({
                where: { id },
                include: {
                    client: { select: { id: true, name: true } },
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
                    notes: { orderBy: { updatedAt: "desc" } },
                    documents: {
                        orderBy: { updatedAt: "desc" },
                        select: { id: true, name: true, category: true, size: true, updatedAt: true, createdAt: true },
                    },
                    invoice: {
                        select: { id: true, number: true, amount: true, status: true, dueDate: true, paidAt: true, createdAt: true, updatedAt: true },
                    },
                },
            });

            if (!project) return null;

            const { statusLogs, requirements, tasks, techs, vaultCredentials, notes, documents, invoice } = project;
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
                ...(invoice
                    ? [{
                        id: `invoice:${invoice.id}`,
                        type: "invoice",
                        title: `Factura ${invoice.number}: ${invoice.status}`,
                        description: `$${invoice.amount.toLocaleString("es-CL")} / vence ${invoice.dueDate.toISOString().slice(0, 10)}`,
                        at: invoice.updatedAt,
                    }]
                    : []),
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
                invoice,
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
    try {
        const { id } = await params;
        const body = await request.json();
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
                clientId,
            },
            include: { client: { select: { id: true, name: true } } },
        });
        await syncProjectInvoice(project.id);
        invalidateCache(`project:${id}`);
        invalidateCache("projects:");
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
    try {
        const { id } = await params;
        await prisma.$transaction([
            prisma.invoice.updateMany({
                where: { projectId: id },
                data: { projectId: null },
            }),
            prisma.auditLog.updateMany({
                where: { credential: { projectId: id } },
                data: { credentialId: null },
            }),
            prisma.credential.deleteMany({ where: { projectId: id } }),
            prisma.projectCredential.deleteMany({ where: { projectId: id } }),
            prisma.projectNote.deleteMany({ where: { projectId: id } }),
            prisma.projectTask.deleteMany({ where: { projectId: id } }),
            prisma.projectTech.deleteMany({ where: { projectId: id } }),
            prisma.projectRequirement.deleteMany({ where: { projectId: id } }),
            prisma.projectStatusLog.deleteMany({ where: { projectId: id } }),
            prisma.document.updateMany({ where: { projectId: id }, data: { projectId: null } }),
            prisma.project.delete({ where: { id } }),
        ]);
        invalidateCache(`project:${id}`);
        invalidateCache("projects:");
        invalidateCache("invoices");
        invalidateCache("vault");
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[projects:delete]", error);
        return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
    }
}
