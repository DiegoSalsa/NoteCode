import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const clients = await prisma.client.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { projects: true } } },
        });
        return NextResponse.json(clients);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        if (!canManage(user)) return NextResponse.json({ error: "Sin permisos para crear clientes." }, { status: 403 });
        const body = await request.json();
        const client = await prisma.client.create({
            data: {
                name: body.name,
                email: body.email || null,
                phone: body.phone || null,
                company: body.company || null,
            },
        });
        invalidateCache("projects:");
        invalidateCache("erp:");
        return NextResponse.json(client, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
    }
}
