import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { canManageFinance, getCurrentUser } from "@/lib/auth";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user || !canManageFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
        const { id } = await params;
        const body = await request.json();
        const invoice = await prisma.invoice.update({
            where: { id },
            data: {
                number: body.number,
                client: body.client,
                amount: body.amount,
                projectId: body.projectId === undefined ? undefined : body.projectId || null,
                clientId: body.clientId === undefined ? undefined : body.clientId || null,
                taxRate: body.taxRate === undefined ? undefined : Number(body.taxRate),
                netAmount: body.amount === undefined ? undefined : Number(body.amount) / (1 + (Number(body.taxRate) || 19) / 100),
                status: body.status,
                dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
                paidAt: body.paidAt ? new Date(body.paidAt) : null,
            },
        });
        invalidateCache("invoices");
        return NextResponse.json(invoice);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user || !canManageFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
        const { id } = await params;
        await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
        invalidateCache("invoices");
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
    }
}
