import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const clients = await prisma.client.findMany({
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { projects: true } } },
        });
        return NextResponse.json(clients);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const client = await prisma.client.create({
            data: {
                name: body.name,
                email: body.email || null,
                phone: body.phone || null,
                company: body.company || null,
            },
        });
        return NextResponse.json(client, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
    }
}