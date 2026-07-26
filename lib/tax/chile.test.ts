import { describe, expect, it } from "vitest";
import { cleanRut, formatChileanRut, isValidChileanRut } from "@/lib/tax/chile";

describe("RUT chileno", () => {
  it("limpia y formatea un RUT", () => {
    expect(cleanRut("76.123.456-k")).toBe("76123456K");
    expect(formatChileanRut("76123456k")).toBe("76.123.456-K");
  });

  it("valida el digito verificador", () => {
    expect(isValidChileanRut("76.123.456-0")).toBe(true);
    expect(isValidChileanRut("76.123.456-K")).toBe(false);
  });
});
