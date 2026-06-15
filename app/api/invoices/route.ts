import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const invoices = await prisma.invoice.findMany({
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(invoices);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const invoice = await prisma.invoice.create({
            data: {
                number: body.number,
                client: body.client,
                amount: body.amount,
                status: body.status || "Pendiente",
                dueDate: new Date(body.dueDate),
            },
        });
        return NextResponse.json(invoice, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
    }
}