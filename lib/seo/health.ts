/**
 * SEO Health = clamp(0, 100, round(100 - penalty))
 *
 * For each distinct ruleKey:
 *   coverage = affected / max(1, indexablePages)
 *   impact  = 0.35 + 0.65 * coverage
 *   repeat  = min(1, log2(1 + affected) / log2(1 + 50))
 *   raw     = weight[severity] * impact * repeat
 *   penalty += min(cap[severity], raw)
 *
 * Weights: CRITICAL 18, HIGH 8, MEDIUM 3, LOW 0.8, INFO 0
 * Caps:    CRITICAL 35, HIGH 20, MEDIUM 12, LOW 4, INFO 0
 *
 * Repeated copies of the same rule cannot dump the score below 0.
 * This is a NoteCode score, not a Google metric.
 */
export const HEALTH_WEIGHTS = { CRITICAL: 18, HIGH: 8, MEDIUM: 3, LOW: 0.8, INFO: 0 } as const;
export const HEALTH_CAPS = { CRITICAL: 35, HIGH: 20, MEDIUM: 12, LOW: 4, INFO: 0 } as const;

export type HealthSeverity = keyof typeof HEALTH_WEIGHTS;

export function healthScore(
  issues: Array<{ ruleKey: string; severity: string; count?: number }>,
  indexablePages: number,
) {
  const grouped = new Map<string, { severity: HealthSeverity; count: number }>();
  for (const issue of issues) {
    const severity = (issue.severity in HEALTH_WEIGHTS ? issue.severity : "INFO") as HealthSeverity;
    const current = grouped.get(issue.ruleKey) ?? { severity, count: 0 };
    current.count += issue.count ?? 1;
    grouped.set(issue.ruleKey, current);
  }
  let penalty = 0;
  const breakdown = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const item of grouped.values()) {
    breakdown[item.severity] += item.count;
    const coverage = item.count / Math.max(1, indexablePages);
    const impact = 0.35 + 0.65 * Math.min(1, coverage);
    const repeat = Math.min(1, Math.log2(1 + item.count) / Math.log2(51));
    const raw = HEALTH_WEIGHTS[item.severity] * impact * repeat;
    penalty += Math.min(HEALTH_CAPS[item.severity], raw);
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  return { score, penalty, breakdown };
}
