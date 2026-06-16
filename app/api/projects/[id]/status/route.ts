import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProjectInvoice } from "@/lib/projects";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const logs = await prisma.projectStatusLog.findMany({
            where: { projectId: id },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(logs);
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

        const [log] = await prisma.$transaction([
            prisma.projectStatusLog.create({
                data: { projectId: id, status: body.status, note: body.note || null },
            }),
            prisma.project.update({
                where: { id },
                data: { status: body.status },
            }),
        ]);

        await syncProjectInvoice(id);

        return NextResponse.json(log, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
