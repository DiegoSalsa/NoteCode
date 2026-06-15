import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const invoice = await prisma.invoice.update({
            where: { id },
            data: {
                number: body.number,
                client: body.client,
                amount: body.amount,
                status: body.status,
                dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
                paidAt: body.paidAt ? new Date(body.paidAt) : null,
            },
        });
        return NextResponse.json(invoice);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.invoice.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
    }
}