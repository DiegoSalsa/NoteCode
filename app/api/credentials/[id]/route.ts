import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const credential = await prisma.credential.update({
            where: { id },
            data: {
                title: body.title,
                service: body.service,
                username: body.username,
                password: body.password,
                url: body.url,
                notes: body.notes,
            },
        });
        return NextResponse.json({ ...credential, password: "••••••••" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.credential.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
    }
}