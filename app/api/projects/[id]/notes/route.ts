import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const items = await prisma.projectNote.findMany({
            where: { projectId: id },
            orderBy: { updatedAt: "desc" },
        });
        return NextResponse.json(items);
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
        const item = await prisma.projectNote.create({
            data: {
                projectId: id,
                title: body.title,
                content: body.content || "",
            },
        });
        return NextResponse.json(item, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}