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
                },
            });

            if (!project) return null;

            const { statusLogs, requirements, techs, vaultCredentials, notes } = project;

            return {
                project,
                statusLogs,
                requirements,
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
            prisma.projectTech.deleteMany({ where: { projectId: id } }),
            prisma.projectRequirement.deleteMany({ where: { projectId: id } }),
            prisma.projectStatusLog.deleteMany({ where: { projectId: id } }),
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
