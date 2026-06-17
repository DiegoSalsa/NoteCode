import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { invalidateCache } from "@/lib/server-cache";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = searchParams.get("limit");
        const projects = await prisma.project.findMany({
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
                clientId,
            },
            include: { client: { select: { id: true, name: true } } },
        });
        await syncProjectInvoice(project.id);
        invalidateCache("projects:");
        invalidateCache("vault");
        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }
}
