import { streamGilberto } from "@/app/actions/gilberto";
import type { UIMessage } from "ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { messages } = (await req.json()) as { messages?: UIMessage[] };

        return streamGilberto(Array.isArray(messages) ? messages : []);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado en Gilberto.";
        console.error("[gilberto]", message);

        return Response.json({ error: message }, { status: 500 });
    }
}
