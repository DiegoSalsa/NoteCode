import { redactValue } from "@/lib/redact";

export function correlationIdFrom(request?: { headers: Headers } | null) {
  return request?.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();
}

export function logEvent(level: "info" | "error" | "warn", event: string, payload: Record<string, unknown> = {}) {
  const safe = redactValue({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  });
  const line = JSON.stringify(safe);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
