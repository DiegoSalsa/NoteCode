import { describe, expect, it } from "vitest";
import { seoSchedulerKey, shouldSkipScheduledRun } from "@/lib/seo/scheduler";

describe("seo scheduler lease", () => {
  it("uses one key per UTC day", () => {
    expect(seoSchedulerKey("2026-09-15")).toBe("seo-scheduler:2026-09-15");
  });

  it("lets a manual run through even if cron already succeeded", () => {
    const decision = shouldSkipScheduledRun({
      trigger: "manual",
      existing: { status: "success", startedAt: new Date(), createdAt: new Date() },
    });
    expect(decision.skip).toBe(false);
  });

  it("skips a second cron after a successful run the same day", () => {
    const decision = shouldSkipScheduledRun({
      trigger: "cron",
      existing: { status: "success", startedAt: new Date(), createdAt: new Date() },
    });
    expect(decision.skip).toBe(true);
    expect(decision.reason).toBe("already-ran-today");
  });

  it("skips cron if a scheduler job is still running", () => {
    const decision = shouldSkipScheduledRun({
      trigger: "cron",
      existing: { status: "running", startedAt: new Date(), createdAt: new Date() },
    });
    expect(decision.skip).toBe(true);
    expect(decision.reason).toBe("already-running");
  });
});
