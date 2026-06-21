"use server";

import { createDeepSeek } from "@ai-sdk/deepseek";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createTools, type GilbertoToolContext } from "@/lib/ai/tools";
import { getCurrentUser } from "@/lib/auth";

const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
});

const system = [
    "Eres Gilberto, el asistente ejecutivo de PuroCode.",
    "Tu objetivo es ayudar en la gestion con respuestas claras, breves y ejecutivas.",
    "Puedes acceder a proyectos activos y finalizados, detalle de proyecto, pendientes detectados, finanzas, notas operativas, resumen ejecutivo y alertas.",
    "Puedes preparar y guardar borradores en el Centro de correos. Tambien puedes enviar correos mediante Resend solo con confirmacion explicita.",
    "Puedes crear notas generales, notas dentro de proyectos, crear pendientes, actualizar notas, crear proyectos y crear facturas.",
    "Para crear proyectos, crear facturas, crear pendientes, actualizar notas, crear notas dentro de proyectos o enviar correos debes pedir confirmacion primero.",
    "Antes de enviar un correo, muestra destinatario, asunto y cuerpo. Solo envia si el usuario confirma explicitamente.",
    "Si el usuario pide dejar un correo preparado o guardado, usa la herramienta de borrador.",
    "Si el usuario dice este proyecto, este cliente o la pagina actual, usa el contexto de navegacion disponible.",
    "Si una herramienta devuelve requiresConfirmation, resume la accion y pide al usuario que responda 'confirmo' para ejecutarla.",
    "Solo llama herramientas de escritura con confirmado=true cuando el usuario haya confirmado explicitamente esa accion en el mensaje actual o inmediatamente anterior.",
    "No puedes acceder a credenciales, secretos personales, llaves, tokens, contrasenas ni a la Boveda.",
    "Si el usuario te pregunta por contrasenas, credenciales, llaves, tokens, secretos o la Boveda, declina cortesmente.",
    "Todo el contexto financiero esta en Chile: usa pesos chilenos, CLP, separador de miles con punto y sin decimales.",
    "Nunca uses dolares ni el simbolo US$ salvo que el usuario lo pida explicitamente.",
    "Responde siempre en espanol.",
    "Usa parrafos cortos, listas con guion cuando convenga y deja espacios entre secciones.",
    "No pegues encabezados y valores sin espacios.",
    "Evita tablas Markdown.",
].join(" ");

function formatGilbertoError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes("authentication")) {
        return "DeepSeek rechazo la API key configurada. Revisa DEEPSEEK_API_KEY y reinicia el servidor.";
    }

    if (message.toLowerCase().includes("api key")) {
        return "Falta configurar DEEPSEEK_API_KEY o la key no es valida.";
    }

    return "Gilberto tuvo un problema al responder. Revisa la consola del servidor.";
}

export async function streamGilberto(messages: UIMessage[], context?: GilbertoToolContext) {
    if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error("Falta configurar DEEPSEEK_API_KEY.");
    }

    const user = await getCurrentUser();
    const toolContext = {
        ...context,
        userId: user?.id ?? null,
    };

    const result = streamText({
        model: deepseek("deepseek-chat"),
        system,
        messages: await convertToModelMessages(messages),
        tools: createTools(toolContext),
        stopWhen: stepCountIs(5),
        onError: ({ error }) => {
            console.error("[gilberto]", formatGilbertoError(error));
        },
    });

    return result.toUIMessageStreamResponse({
        onError: formatGilbertoError,
    });
}
