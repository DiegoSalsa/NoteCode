export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function apiJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("X-Correlation-Id")) headers.set("X-Correlation-Id", crypto.randomUUID());
  const response = await fetch(input, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.error || "No se pudo completar la operación.", response.status);
  }
  return payload as T;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
