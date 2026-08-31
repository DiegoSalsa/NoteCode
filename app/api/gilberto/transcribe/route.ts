import { getCurrentUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type DeepgramTranscription = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
  };
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  const limited = rateLimit(clientKey({ headers: req.headers }, `transcribe:${user.id}`), 20, 60_000);
  if (!limited.ok) return Response.json({ error: "Demasiadas transcripciones." }, { status: 429 });
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Falta configurar DEEPGRAM_API_KEY." }, { status: 500 });
  }

  const audio = await req.arrayBuffer();
  if (!audio.byteLength) {
    return Response.json({ error: "No se recibio audio." }, { status: 400 });
  }
  if (audio.byteLength > 8 * 1024 * 1024) {
    return Response.json({ error: "El audio supera el máximo de 8 MB." }, { status: 413 });
  }

  const contentType = req.headers.get("content-type") || "audio/webm";
  const deepgramUrl = new URL("https://api.deepgram.com/v1/listen");
  deepgramUrl.searchParams.set("model", "nova-3");
  deepgramUrl.searchParams.set("language", "es");
  deepgramUrl.searchParams.set("smart_format", "true");
  deepgramUrl.searchParams.set("punctuate", "true");

  const response = await fetch(deepgramUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": contentType,
    },
    body: audio,
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[gilberto:deepgram:transcribe]", response.status, detail.slice(0, 500));
    return Response.json({ error: "Deepgram no pudo transcribir el audio." }, { status: response.status });
  }

  const data = (await response.json()) as DeepgramTranscription;
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  const text = alternative?.transcript?.trim() || "";

  if (!text) {
    return Response.json({ error: "No pude detectar texto en el audio." }, { status: 422 });
  }

  return Response.json({
    text,
    confidence: alternative?.confidence ?? null,
  });
}
