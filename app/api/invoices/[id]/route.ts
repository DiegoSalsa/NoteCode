import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { updateInvoiceSchema } from "@/lib/validation/invoice";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageFinance(user)) return NextResponse.json({ error: "No tienes permiso para modificar facturas." }, { status: 403 });
    try {
        const { id } = await params;
        const parsed = updateInvoiceSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Factura invalida." }, { status: 400 });
        }
        const body = parsed.data;
        const current = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
        if (!current) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
        const amount = body.amount ?? current.amount;
        const taxRate = body.taxRate ?? current.taxRate;
        const invoice = await prisma.invoice.update({
            where: { id },
            data: {
                number: body.number,
                client: body.client,
                amount: body.amount,
                projectId: body.projectId === undefined ? undefined : body.projectId || null,
                clientId: body.clientId === undefined ? undefined : body.clientId || null,
                taxRate: body.taxRate === undefined ? undefined : Number(body.taxRate),
                netAmount: body.amount === undefined && body.taxRate === undefined ? undefined : Number(amount) / (1 + Number(taxRate) / 100),
                status: body.status,
                dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
                paidAt: body.paidAt === undefined ? undefined : body.paidAt ? new Date(body.paidAt) : null,
                notes: body.notes === undefined ? undefined : body.notes || null,
            },
        });
        await recordAudit({
            action: "UPDATE",
            entityType: "Invoice",
            entityId: invoice.id,
            summary: `Factura ${invoice.number} actualizada`,
            metadata: { before: { amount: current.amount, status: current.status }, after: { amount: invoice.amount, status: invoice.status } },
        });
        invalidateCache("invoices");
        invalidateCache("erp:");
        invalidateCache("project:");
        invalidateCache("dashboard:");
        invalidateCache("reports:");
        invalidateCache("tax:");
        invalidateCache("gilberto:today:");
        return NextResponse.json(invoice);
    } catch (error) {
        console.error("[invoices:update]", error);
        return NextResponse.json({ error: "No se pudo actualizar la factura." }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageFinance(user)) return NextResponse.json({ error: "No tienes permiso para eliminar facturas." }, { status: 403 });
    try {
        const { id } = await params;
        const invoice = await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
        await recordAudit({
            action: "DELETE",
            entityType: "Invoice",
            entityId: invoice.id,
            summary: `Factura ${invoice.number} enviada a papelera`,
        });
        invalidateCache("invoices");
        invalidateCache("erp:");
        invalidateCache("project:");
        invalidateCache("dashboard:");
        invalidateCache("reports:");
        invalidateCache("tax:");
        invalidateCache("gilberto:today:");
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[invoices:delete]", error);
        return NextResponse.json({ error: "No se pudo eliminar la factura." }, { status: 500 });
    }
}
