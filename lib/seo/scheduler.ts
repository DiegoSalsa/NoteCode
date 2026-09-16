/**
 * Single effective SEO scheduler.
 * HTTP entrypoints (cron SEO, leftover automations, manual POST) all call
 * claimSeoSchedule(). Cron runs skip if this UTC day already started.
 * Idempotency of individual GSC/GA4/ranking jobs is separate and does not
 * replace this lease.
 */
export type SeoScheduleTrigger = "cron" | "manual";

export type SeoScheduleClaim = {
  existing: {
    status: string;
    startedAt: Date | null;
    createdAt: Date;
  } | null;
  trigger: SeoScheduleTrigger;
  now?: Date;
};

export function seoSchedulerKey(day: string) {
  return `seo-scheduler:${day}`;
}

export function shouldSkipScheduledRun(input: SeoScheduleClaim) {
  if (input.trigger === "manual") return { skip: false as const };
  const existing = input.existing;
  if (!existing) return { skip: false as const };
  const now = input.now ?? new Date();
  if (existing.status === "running" && existing.startedAt && now.getTime() - existing.startedAt.getTime() < 30 * 60_000) {
    return { skip: true as const, reason: "already-running" };
  }
  if (existing.status === "success") {
    return { skip: true as const, reason: "already-ran-today" };
  }
  if (existing.status === "budget_exceeded") {
    return { skip: true as const, reason: "budget-already-exceeded-today" };
  }
  return { skip: false as const };
}
