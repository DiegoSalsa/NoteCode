/**
 * NoteCode visibility for tracked SERPs.
 * This is NOT a Google metric and is not "domain authority".
 *
 * CTR-weight(position) uses a documented organic CTR curve:
 *  1: 0.30, 2: 0.16, 3: 0.11, 4: 0.08, 5: 0.06,
 *  6: 0.05, 7: 0.04, 8: 0.03, 9: 0.025, 10: 0.02
 *  11–20: 0.01, 21–100: 0.004, else 0
 *
 * Visibility = 100 * Σ CTR-weight(competitor position)
 *              / (trackedKeywordsWithSerp * CTR-weight(1))
 *
 * A competitor absent from a SERP contributes 0 to the numerator
 * and still counts in the denominator.
 */
const TOP = [0, 0.3, 0.16, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02];

export function ctrWeight(position: number | null | undefined) {
  if (position == null || position < 1) return 0;
  if (position <= 10) return TOP[position] ?? 0;
  if (position <= 20) return 0.01;
  if (position <= 100) return 0.004;
  return 0;
}

export function visibilityScore(positions: Array<number | null>, trackedSerps: number) {
  const denom = trackedSerps * ctrWeight(1);
  if (denom <= 0) return 0;
  const numer = positions.reduce<number>((sum, position) => sum + ctrWeight(position), 0);
  return (100 * numer) / denom;
}
