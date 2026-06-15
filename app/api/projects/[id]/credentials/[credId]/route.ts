import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; credId: string }> }
) {
    try {
        const { credId } = await params;
        await prisma.projectCredential.delete({ where: { id: credId } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}