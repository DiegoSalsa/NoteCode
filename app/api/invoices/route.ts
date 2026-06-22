import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/server-cache";

const DEFAULT_TAKE = 30;
const MAX_TAKE = 80;

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get("q")?.trim() || "";
        const status = searchParams.get("status")?.trim() || "";
        const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
        const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take") ?? DEFAULT_TAKE) || DEFAULT_TAKE));
        const where = {
            ...(status ? { status } : {}),
            ...(q ? {
                OR: [
                    { number: { contains: q, mode: "insensitive" as const } },
                    { client: { contains: q, mode: "insensitive" as const } },
                ],
            } : {}),
        };
        const invoices = await cached(`invoices:${q}:${status}:${skip}:${take}`, 30_000, async () => {
            const today = new Date();
            const [items, total, summary, overduePending, upcomingDue] = await Promise.all([
                prisma.invoice.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip,
                    take,
                    select: {
                        id: true,
                        projectId: true,
                        number: true,
                        client: true,
                        amount: true,
                        status: true,
                        dueDate: true,
                        paidAt: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                }),
                prisma.invoice.count({ where }),
                prisma.invoice.groupBy({
                    by: ["status"],
                    where,
                    _sum: { amount: true },
                    _count: { id: true },
                }),
                prisma.invoice.aggregate({
                    where: {
                        ...where,
                        status: "Pendiente",
                        dueDate: { lt: today },
                    },
                    _sum: { amount: true },
                    _count: true,
                }),
                prisma.invoice.findMany({
                    where: {
                        ...where,
                        status: "Pendiente",
                        dueDate: { gte: today },
                    },
                    orderBy: { dueDate: "asc" },
                    take: 5,
                    select: {
                        id: true,
                        number: true,
                        client: true,
                        amount: true,
                        dueDate: true,
                    },
                }),
            ]);

            const totalAmount = summary.reduce((sum, item) => sum + (item._sum.amount ?? 0), 0);
            const pendingAmount = summary.find((item) => item.status === "Pendiente")?._sum.amount ?? 0;
            const paidAmount = summary.find((item) => item.status === "Pagado")?._sum.amount ?? 0;
            const canceledAmount = summary.find((item) => item.status === "Cancelado")?._sum.amount ?? 0;
            const overdueAmount = (summary.find((item) => item.status === "Vencido")?._sum.amount ?? 0) + (overduePending._sum.amount ?? 0);
            const collectibleAmount = totalAmount - canceledAmount;

            return {
                items,
                nextSkip: skip + items.length,
                hasMore: skip + items.length < total,
                total,
                summary: {
                    totalAmount,
                    netAmount: totalAmount / 1.19,
                    vatAmount: totalAmount - totalAmount / 1.19,
                    pendingAmount,
                    paidAmount,
                    overdueAmount,
                    canceledAmount,
                    collectibleAmount,
                    collectionRate: collectibleAmount > 0 ? paidAmount / collectibleAmount : 0,
                    overdueCount: (summary.find((item) => item.status === "Vencido")?._count.id ?? 0) + overduePending._count,
                    byStatus: summary.map((item) => ({
                        status: item.status,
                        amount: item._sum.amount ?? 0,
                        count: item._count.id,
                    })),
                    upcomingDue,
                },
            };
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
        invalidateCache("invoices");
        return NextResponse.json(invoice, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
    }
}
