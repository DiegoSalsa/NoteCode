import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        const project = await prisma.project.create({
            data: {
                name: body.name,
                description: body.description || null,
                status: body.status || "En progreso",
                clientId: body.clientId,
            },
            include: { client: { select: { id: true, name: true } } },
        });
        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }
}