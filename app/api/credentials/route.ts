import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const credentials = await prisma.credential.findMany({
            orderBy: { updatedAt: "desc" },
        });
        // Mask passwords in the response
        const safe = credentials.map((c) => ({
            ...c,
            password: "••••••••",
        }));
        return NextResponse.json(safe);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const credential = await prisma.credential.create({
            data: {
                title: body.title,
                service: body.service,
                username: body.username,
                password: body.password,
                url: body.url || null,
                notes: body.notes || null,
            },
        });
        return NextResponse.json({ ...credential, password: "••••••••" }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create credential" }, { status: 500 });
    }
}