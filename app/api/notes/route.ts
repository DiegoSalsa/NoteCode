import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const notes = await prisma.note.findMany({
            orderBy: { updatedAt: "desc" },
        });
        return NextResponse.json(notes);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const note = await prisma.note.create({
            data: {
                title: body.title,
                content: body.content || "",
                folder: body.folder || "General",
            },
        });
        return NextResponse.json(note, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
    }
}