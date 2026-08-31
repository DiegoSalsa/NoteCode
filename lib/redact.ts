const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|apikey|api_key|private_key|credential|secret_data)/i;
const SECRET_LIKE = /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;
const PASSWORD_ASSIGNMENT = /(password|contraseña|passwd|secret)\s*[:=]\s*\S+/gi;

export function redactText(value: string) {
  return value.replace(SECRET_LIKE, "[REDACTED]").replace(PASSWORD_ASSIGNMENT, "$1=[REDACTED]");
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(nested),
      ]),
    );
  }
  return value;
}

export function looksLikeSecret(value: string) {
  return SECRET_LIKE.test(value) || PASSWORD_ASSIGNMENT.test(value);
}

export function scanNotesForSecrets(notes: Array<{ id: string; content: string }>) {
  let flagged = 0;
  for (const note of notes) {
    if (looksLikeSecret(note.content)) flagged += 1;
  }
  return { scanned: notes.length, flagged };
}
