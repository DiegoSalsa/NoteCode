import { describe, expect, it } from "vitest";
import { allocatePlan, quoteTotals } from "./money";
import { canTransition } from "./validation";

describe("commercial money and states", () => {
  it("calculates the acceptance example exactly and allocates two equal milestones", () => {
    const total = quoteTotals([{ quantity: 1, unitPrice: 380000 }]);
    expect(total).toEqual({
      subtotal: 380000,
      discountAmount: 0,
      net: 380000,
      tax: 72200,
      total: 452200,
    });
    expect(
      allocatePlan(total.net, total.tax, "CLP", {
        kind: "DEPOSIT_BALANCE",
        depositPercent: 50,
      }).map((m) => m.amount),
    ).toEqual([226100, 226100]);
  });
  it("rounds line, discount and tax half-up using currency minor units", () => {
    expect(
      quoteTotals([{ quantity: 0.5, unitPrice: 101 }], 10, 19),
    ).toMatchObject({
      subtotal: 51,
      discountAmount: 5,
      net: 46,
      tax: 9,
      total: 55,
    });
    expect(
      quoteTotals([{ quantity: 3, unitPrice: 0.1 }], 0, 0, "USD").total,
    ).toBe(0.3);
  });
  it("preserves legacy calculation without rounding or reinterpretation", () => {
    expect(
      quoteTotals(
        [{ quantity: 1, unitPrice: Number("319327.73109243695") }],
        0,
        19,
        "CLP",
        0,
      ).total,
    ).toBe(379999.99999999994);
  });
  it.each([NaN, Infinity, -1, 0.1])(
    "rejects invalid CLP prices %s",
    (unitPrice) => {
      expect(() => quoteTotals([{ quantity: 1, unitPrice }])).toThrow();
    },
  );
  it("allocates rounding residual to the last milestone, preserving exact net and tax", () => {
    const steps = allocatePlan(101, 19, "CLP", {
      kind: "MILESTONES",
      entries: [
        { title: "A", percent: 33.33 },
        { title: "B", percent: 33.33 },
        { title: "C", percent: 33.34 },
      ],
    });
    expect(steps.reduce((s, m) => s + m.amount, 0)).toBe(120);
    expect(steps.reduce((s, m) => s + m.netAmount, 0)).toBe(101);
    expect(() =>
      allocatePlan(100, 19, "CLP", {
        kind: "MILESTONES",
        entries: [{ title: "A", percent: 50 }],
      }),
    ).toThrow();
  });
  it.each([
    ["Borrador", "Aprobada", false],
    ["Enviada", "Cambios solicitados", true],
    ["Cambios solicitados", "Rechazada", false],
    ["Aprobada", "Borrador", false],
    ["Aprobada", "Enviada", false],
    ["Enviada", "Vencida", true],
  ])("transition %s → %s is %s", (from, to, expected) =>
    expect(canTransition(String(from), String(to))).toBe(expected),
  );
});
