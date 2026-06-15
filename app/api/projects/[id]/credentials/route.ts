import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const items = await prisma.projectCredential.findMany({
            where: { projectId: id },
            orderBy: { createdAt: "desc" },
        });
        const safe = items.map((c) => ({ ...c, password: "••••••••" }));
        return NextResponse.json(safe);
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const item = await prisma.projectCredential.create({
            data: {
                projectId: id,
                title: body.title,
                service: body.service,
                username: body.username,
                password: body.password,
                url: body.url || null,
                notes: body.notes || null,
            },
        });
        return NextResponse.json({ ...item, password: "••••••••" }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}