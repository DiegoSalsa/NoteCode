import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { invalidateCache } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = searchParams.get("limit");
        const projects = await prisma.project.findMany({
            where: { deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: limit ? parseInt(limit) : undefined,
            include: { client: { select: { id: true, name: true } } },
        });
        return NextResponse.json(projects);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManage(user)) return NextResponse.json({ error: "Sin permisos para crear proyectos." }, { status: 403 });
    try {
        const body = await request.json();
        const clientId = await resolveClientId({
            clientId: body.clientId,
            clientName: body.clientName,
        });
        const project = await prisma.project.create({
            data: {
                name: body.name,
                description: body.description || null,
                status: body.status || "En progreso",
                agreedAmount: Number(body.agreedAmount) || 0,
                budgetHours: Number(body.budgetHours) || 0,
                budgetCost: Number(body.budgetCost) || 0,
                startDate: body.startDate ? new Date(body.startDate) : null,
                targetDate: body.targetDate ? new Date(body.targetDate) : null,
                ownerId: body.ownerId || null,
                clientId,
                statusLogs: { create: { status: body.status || "En progreso", note: "Proyecto creado" } },
            },
            include: { client: { select: { id: true, name: true } } },
        });
        await syncProjectInvoice(project.id);
        invalidateCache("projects:");
        invalidateCache("erp:");
        invalidateCache("vault");
        invalidateCache("dashboard:");
        invalidateCache("reports:");
        invalidateCache("gilberto:today:");
        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }
}
