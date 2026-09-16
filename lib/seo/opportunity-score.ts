/**
 * Operational priority 0–100. Not SEO Health.
 *
 * demand     = min(100, log10(1 + impressions|volume) / log10(10001) * 100)
 * proximity  = pos 4–10 → 100; 11–20 → 70; 1–3 → 40; else 20
 * traffic    = min(100, (clicks|sessions) / 2)
 * conversion = min(100, conversions * 10)
 * decline    = min(100, |dropPct| * 1.5)
 * technical  = 80 if high/critical issue else 0
 *
 * Type weights:
 * NEAR_WIN                demand 0.40 proximity 0.40 traffic 0.20
 * LOW_CTR                 demand 0.50 traffic 0.30 proximity 0.20
 * CONTENT_DECAY           decline 0.50 traffic 0.30 demand 0.20
 * CANNIBALIZATION         demand 0.50 traffic 0.30 proximity 0.20
 * KEYWORD_GAP             demand 0.60 proximity 0.40
 * POTENTIAL_NEW_CONTENT   demand 0.70 proximity 0.30
 * TECHNICAL_HIGH_TRAFFIC  traffic 0.50 technical 0.50
 * TARGET_URL_MISMATCH     demand 0.50 proximity 0.50
 */
export type OpportunitySignals = {
  impressions?: number | null;
  volume?: number | null;
  position?: number | null;
  clicks?: number | null;
  sessions?: number | null;
  conversions?: number | null;
  dropPct?: number | null;
  technicalHigh?: boolean;
};

const WEIGHTS: Record<string, Partial<Record<keyof ReturnType<typeof components>, number>>> = {
  NEAR_WIN: { demand: 0.4, proximity: 0.4, traffic: 0.2 },
  LOW_CTR: { demand: 0.5, traffic: 0.3, proximity: 0.2 },
  CONTENT_DECAY: { decline: 0.5, traffic: 0.3, demand: 0.2 },
  CANNIBALIZATION: { demand: 0.5, traffic: 0.3, proximity: 0.2 },
  KEYWORD_GAP: { demand: 0.6, proximity: 0.4 },
  POTENTIAL_NEW_CONTENT: { demand: 0.7, proximity: 0.3 },
  TECHNICAL_HIGH_TRAFFIC: { traffic: 0.5, technical: 0.5 },
  TARGET_URL_MISMATCH: { demand: 0.5, proximity: 0.5 },
};

export function components(signals: OpportunitySignals) {
  const demandRaw = signals.impressions || signals.volume || 0;
  const demand = Math.min(100, (Math.log10(1 + demandRaw) / Math.log10(10001)) * 100);
  const position = signals.position;
  const proximity = position == null || position > 20 ? 20 : position <= 3 ? 40 : position <= 10 ? 100 : 70;
  const traffic = Math.min(100, (signals.clicks || signals.sessions || 0) / 2);
  const conversion = Math.min(100, (signals.conversions || 0) * 10);
  const decline = Math.min(100, Math.abs(signals.dropPct || 0) * 1.5);
  const technical = signals.technicalHigh ? 80 : 0;
  return { demand, proximity, traffic, conversion, decline, technical };
}

export function opportunityScore(type: string, signals: OpportunitySignals) {
  const parts = components(signals);
  const weights = WEIGHTS[type] ?? { demand: 0.5, traffic: 0.5 };
  let total = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (parts[key as keyof typeof parts] ?? 0) * (weight ?? 0);
    used += weight ?? 0;
  }
  const score = used > 0 ? total / used * used : total;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function opportunityConfidence(signals: OpportunitySignals, extra?: { days?: number; minImpressions?: number }) {
  const impressions = signals.impressions || 0;
  const days = extra?.days ?? 28;
  if (impressions >= 500 && days >= 21) return "HIGH";
  if (impressions >= 80 && days >= 14) return "MEDIUM";
  return "LOW";
}
