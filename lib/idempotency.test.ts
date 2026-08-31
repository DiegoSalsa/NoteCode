import { describe, expect, it } from "vitest";
import { createMemoryIdempotencyStore, runIdempotent } from "@/lib/idempotency";

describe("idempotency", () => {
  it("replays the original result for the same key", async () => {
    const store = createMemoryIdempotencyStore();
    let created = 0;
    const execute = async () => {
      created += 1;
      return { status: 201, body: { id: "rec-1", n: created } };
    };

    const first = await runIdempotent(store, { userId: "u1", key: "op-1" }, execute);
    const second = await runIdempotent(store, { userId: "u1", key: "op-1" }, execute);

    expect(created).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);
    expect(second.status).toBe(201);
  });

  it("does not duplicate concurrent creates with the same key", async () => {
    const store = createMemoryIdempotencyStore();
    let created = 0;
    const execute = async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      created += 1;
      return { status: 201, body: { id: `rec-${created}` } };
    };

    const [a, b] = await Promise.all([
      runIdempotent(store, { userId: "u1", key: "op-concurrent" }, execute),
      runIdempotent(store, { userId: "u1", key: "op-concurrent" }, execute),
    ]);

    expect(created).toBe(1);
    expect(a.body).toEqual(b.body);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
  });

  it("allows a retry after a failed attempt using the same key", async () => {
    const store = createMemoryIdempotencyStore();
    let attempts = 0;
    const execute = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("boom");
      return { status: 201, body: { id: "ok" } };
    };

    await expect(runIdempotent(store, { userId: "u1", key: "op-fail" }, execute)).rejects.toThrow("boom");
    const recovered = await runIdempotent(store, { userId: "u1", key: "op-fail" }, execute);
    expect(attempts).toBe(2);
    expect(recovered.body).toEqual({ id: "ok" });
    expect(recovered.replayed).toBe(false);
  });
});
