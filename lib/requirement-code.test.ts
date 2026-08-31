import { describe, expect, it } from "vitest";
import { formatRequirementCode, nextRequirementCode, parseRequirementNumber } from "@/lib/requirement-code";

describe("requirement codes", () => {
  it("assigns RF-01 and the next unused number", () => {
    expect(nextRequirementCode([])).toBe("RF-01");
    expect(nextRequirementCode(["RF-01", "RF-02", "RF-09"])).toBe("RF-10");
    expect(formatRequirementCode(3)).toBe("RF-03");
    expect(parseRequirementNumber("RF-07")).toBe(7);
  });
});
