export const runtime = "nodejs";

const DEFAULT_VOICE = "aura-2-estrella-es";
const ALLOWED_VOICES = new Set([
  "aura-2-estrella-es",
  "aura-2-selena-es",
  "aura-2-celeste-es",
  "aura-2-gloria-es",
  "aura-2-olivia-es",
  "aura-2-antonia-es",
  "aura-2-javier-es",
  "aura-2-sirio-es",
  "aura-2-nestor-es",
  "aura-2-alvaro-es",
  "aura-2-valerio-es",
]);

export async function POST(req: Request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Falta configurar DEEPGRAM_API_KEY." }, { status: 500 });
  }

  const body = (await req.json()) as { text?: string; voice?: string };
  const text = body.text?.trim().slice(0, 1900);
  const voice = body.voice && ALLOWED_VOICES.has(body.voice) ? body.voice : DEFAULT_VOICE;

  if (!text) {
    return Response.json({ error: "No se recibio texto para sintetizar." }, { status: 400 });
  }

  const deepgramUrl = new URL("https://api.deepgram.com/v1/speak");
  deepgramUrl.searchParams.set("model", voice);
  deepgramUrl.searchParams.set("encoding", "mp3");

  const response = await fetch(deepgramUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[gilberto:deepgram:speak]", response.status, detail.slice(0, 500));
    return Response.json({ error: "Deepgram no pudo generar la voz." }, { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
