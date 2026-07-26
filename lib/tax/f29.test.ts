import { describe, expect, it } from "vitest";
import {
  calculateF29,
  grossToNetAndVat,
  honorariumWithholdingRate,
  isValidTaxPeriod,
  periodForPreviousMonth,
} from "@/lib/tax/f29";

describe("F29 Chile", () => {
  it("separa un total afecto en neto e IVA sin perder pesos", () => {
    expect(grossToNetAndVat(119_000)).toEqual({ net: 100_000, vat: 19_000 });
    const result = grossToNetAndVat(29_990);
    expect(result.net + result.vat).toBe(29_990);
  });

  it("calcula IVA, remanente, PPM y retenciones", () => {
    const result = calculateF29({
      period: "2026-06",
      sales: [{ netAmount: 1_000_000, vatAmount: 190_000 }],
      purchases: [{ netAmount: 500_000, vatAmount: 95_000, recoverableVatAmount: 80_000 }],
      previousCarryForward: 10_000,
      ppmRate: 0.25,
      withholdings: 15_250,
      otherTaxes: 0,
      hasTaxProfile: true,
      usesTaxDocuments: true,
      hasSiiComparison: false,
    });

    expect(result.vatPayable).toBe(100_000);
    expect(result.ppmAmount).toBe(2_500);
    expect(result.estimatedTotal).toBe(117_750);
    expect(result.nextCarryForward).toBe(0);
    expect(result.confidence).toBe("Media");
  });

  it("arrastra credito cuando supera el debito", () => {
    const result = calculateF29({
      period: "2026-06",
      sales: [{ netAmount: 100_000, vatAmount: 19_000 }],
      purchases: [{ netAmount: 200_000, vatAmount: 38_000, recoverableVatAmount: 38_000 }],
      previousCarryForward: 5_000,
      hasTaxProfile: true,
      usesTaxDocuments: true,
      hasSiiComparison: true,
    });

    expect(result.vatPayable).toBe(0);
    expect(result.nextCarryForward).toBe(24_000);
    expect(result.confidence).toBe("Alta");
  });

  it("versiona la retencion de honorarios por ano", () => {
    expect(honorariumWithholdingRate(2025)).toBe(14.5);
    expect(honorariumWithholdingRate(2026)).toBe(15.25);
    expect(honorariumWithholdingRate(2027)).toBe(16);
    expect(honorariumWithholdingRate(2028)).toBe(17);
  });

  it("valida periodos y obtiene el mes anterior", () => {
    expect(isValidTaxPeriod("2026-07")).toBe(true);
    expect(isValidTaxPeriod("2026-13")).toBe(false);
    expect(periodForPreviousMonth(new Date("2026-07-25T12:00:00Z"))).toBe("2026-06");
    expect(periodForPreviousMonth(new Date("2026-01-10T12:00:00Z"))).toBe("2025-12");
  });
});
