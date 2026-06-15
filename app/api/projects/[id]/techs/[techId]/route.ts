import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; techId: string }> }
) {
    try {
        const { techId } = await params;
        await prisma.projectTech.delete({ where: { id: techId } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}