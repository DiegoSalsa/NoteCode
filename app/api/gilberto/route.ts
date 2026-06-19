import { streamGilberto } from "@/app/actions/gilberto";
import type { UIMessage } from "ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { messages, context } = (await req.json()) as {
            messages?: UIMessage[];
            context?: {
                pathname?: string;
                currentProjectId?: string | null;
            };
        };

        return streamGilberto(Array.isArray(messages) ? messages : [], context);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado en Gilberto.";
        console.error("[gilberto]", message);

        return Response.json({ error: message }, { status: 500 });
    }
}
