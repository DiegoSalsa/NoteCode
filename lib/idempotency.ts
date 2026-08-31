export type IdempotentResult<T> = {
  status: number;
  body: T;
  replayed: boolean;
};

export type StoredIdempotency<T> = {
  status: "pending" | "complete";
  statusCode: number;
  body: T | null;
};

export type IdempotencyStore = {
  begin(userId: string, key: string): Promise<"created" | "exists">;
  get<T>(userId: string, key: string): Promise<StoredIdempotency<T> | null>;
  complete<T>(userId: string, key: string, statusCode: number, body: T): Promise<void>;
  abort(userId: string, key: string): Promise<void>;
};

const memory = new Map<string, StoredIdempotency<unknown>>();
const memoryWaiters = new Map<string, Array<() => void>>();

function memoryKey(userId: string, key: string) {
  return `${userId}::${key}`;
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  return {
    async begin(userId: string, key: string) {
      const id = memoryKey(userId, key);
      if (memory.has(id)) return "exists";
      memory.set(id, { status: "pending", statusCode: 0, body: null });
      return "created";
    },
    async get<T>(userId: string, key: string) {
      return (memory.get(memoryKey(userId, key)) as StoredIdempotency<T> | undefined) ?? null;
    },
    async complete<T>(userId: string, key: string, statusCode: number, body: T) {
      const id = memoryKey(userId, key);
      memory.set(id, { status: "complete", statusCode, body });
      const waiters = memoryWaiters.get(id) ?? [];
      memoryWaiters.delete(id);
      waiters.forEach((resolve) => resolve());
    },
    async abort(userId: string, key: string) {
      memory.delete(memoryKey(userId, key));
    },
  };
}

export function resetMemoryIdempotencyStore() {
  memory.clear();
  memoryWaiters.clear();
}

async function waitForCompletion<T>(store: IdempotencyStore, userId: string, key: string): Promise<StoredIdempotency<T>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await store.get<T>(userId, key);
    if (current?.status === "complete" && current.body !== null) return current;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("La operación original sigue en curso. Reintenta en unos segundos.");
}

export function isValidIdempotencyKey(value: string | null | undefined) {
  if (!value) return false;
  return value.length >= 4 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export async function runIdempotent<T>(
  store: IdempotencyStore,
  input: { userId: string; key: string | null | undefined },
  execute: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  if (!input.key) {
    const result = await execute();
    return { ...result, replayed: false };
  }
  if (!isValidIdempotencyKey(input.key)) {
    throw Object.assign(new Error("Idempotency-Key inválida."), { status: 400 });
  }

  const began = await store.begin(input.userId, input.key);
  if (began === "exists") {
    const existing = await waitForCompletion<T>(store, input.userId, input.key);
    return { status: existing.statusCode, body: existing.body as T, replayed: true };
  }

  try {
    const result = await execute();
    await store.complete(input.userId, input.key, result.status, result.body);
    return { ...result, replayed: false };
  } catch (error) {
    await store.abort(input.userId, input.key);
    throw error;
  }
}
