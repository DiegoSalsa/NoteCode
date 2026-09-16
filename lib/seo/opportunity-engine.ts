import { opportunityConfidence, opportunityScore } from "@/lib/seo/opportunity-score";
import { pageKey } from "@/lib/seo/domain";

export type OpportunityDraft = {
  type: string;
  identityKey: string;
  title: string;
  summary: string;
  url?: string | null;
  pageKey?: string | null;
  keyword?: string | null;
  score: number;
  confidence: string;
  evidence: Record<string, unknown>;
  recommendation: string;
};

const EXPECTED_CTR: Array<{ maxPos: number; ctr: number }> = [
  { maxPos: 1, ctr: 0.28 },
  { maxPos: 2, ctr: 0.15 },
  { maxPos: 3, ctr: 0.11 },
  { maxPos: 4, ctr: 0.08 },
  { maxPos: 5, ctr: 0.06 },
  { maxPos: 10, ctr: 0.04 },
  { maxPos: 20, ctr: 0.02 },
];

export function expectedCtr(position: number) {
  const row = EXPECTED_CTR.find((item) => position <= item.maxPos);
  return row?.ctr ?? 0.01;
}

export function detectNearWins(rows: Array<{ keyword: string; position: number | null; impressions?: number; url?: string | null; source: string }>, host?: string | null) {
  return rows.flatMap((row) => {
    if (row.position == null || row.position < 4 || row.position > 20) return [];
    if ((row.impressions ?? 0) < 50 && row.source === "gsc") return [];
    const key = pageKey(row.url, host);
    const signals = { impressions: row.impressions ?? 0, position: row.position };
    return [{
      type: "NEAR_WIN",
      identityKey: `NEAR_WIN|${row.keyword}|${key || ""}`,
      title: `Near win: ${row.keyword}`,
      summary: `Posición ${row.position} (4–20). Oportunidad cercana a primera página / Top 10. No implica que subirá al Top 3.`,
      url: row.url,
      pageKey: key,
      keyword: row.keyword,
      score: opportunityScore("NEAR_WIN", signals),
      confidence: opportunityConfidence(signals),
      evidence: { position: row.position, impressions: row.impressions ?? null, source: row.source },
      recommendation: "Revisar relevancia de la página para esta query y analizar resultados superiores.",
    } satisfies OpportunityDraft];
  });
}

export function detectLowCtr(rows: Array<{ keyword: string; position: number; impressions: number; clicks: number; ctr: number; url?: string | null }>, host?: string | null) {
  return rows.flatMap((row) => {
    if (row.impressions < 200 || row.position > 15) return [];
    const expected = expectedCtr(row.position);
    const shortfall = expected * row.impressions - row.clicks;
    if (row.ctr >= expected * 0.5 || shortfall < 10) return [];
    const key = pageKey(row.url, host);
    const signals = { impressions: row.impressions, position: row.position, clicks: row.clicks };
    return [{
      type: "LOW_CTR",
      identityKey: `LOW_CTR|${row.keyword}|${key || ""}`,
      title: `CTR bajo: ${row.keyword}`,
      summary: `CTR ${(row.ctr * 100).toFixed(2)}% vs referencia interna ${(expected * 100).toFixed(1)}% en posición ${row.position}. Baseline NoteCode, no CTR de Google.`,
      url: row.url,
      pageKey: key,
      keyword: row.keyword,
      score: opportunityScore("LOW_CTR", signals),
      confidence: opportunityConfidence(signals),
      evidence: { position: row.position, impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, expectedCtr: expected, source: "gsc" },
      recommendation: "Revisar title/snippet e intención de búsqueda.",
    } satisfies OpportunityDraft];
  });
}

export function detectDecay(rows: Array<{ url: string; clicksNow: number; clicksPrev: number; impressionsNow: number; impressionsPrev: number; sessionsNow?: number; sessionsPrev?: number }>, host?: string | null) {
  return rows.flatMap((row) => {
    const prevClicks = row.clicksPrev;
    const prevImpr = row.impressionsPrev;
    if (prevClicks < 50 && prevImpr < 500) return [];
    const dropClicks = prevClicks === 0 ? 0 : (row.clicksNow - prevClicks) / prevClicks;
    const absDrop = prevClicks - row.clicksNow;
    if (!(dropClicks <= -0.3 && absDrop >= 20)) return [];
    const key = pageKey(row.url, host);
    const dropPct = dropClicks * 100;
    const signals = { impressions: row.impressionsPrev, clicks: row.clicksPrev, dropPct: Math.abs(dropPct) };
    return [{
      type: "CONTENT_DECAY",
      identityKey: `CONTENT_DECAY|${key || row.url}`,
      title: `Possible content decay: ${key || row.url}`,
      summary: `Clicks ${Math.round(prevClicks)} → ${Math.round(row.clicksNow)} (${dropPct.toFixed(0)}%). No afirma la causa.`,
      url: row.url,
      pageKey: key,
      score: opportunityScore("CONTENT_DECAY", signals),
      confidence: opportunityConfidence(signals),
      evidence: { clicksNow: row.clicksNow, clicksPrev: row.clicksPrev, impressionsNow: row.impressionsNow, impressionsPrev: row.impressionsPrev, dropPct },
      recommendation: "Comparar cambios de ranking, demanda y contenido antes de modificar la página.",
    } satisfies OpportunityDraft];
  });
}

export function detectCannibalization(rows: Array<{ query: string; pages: Array<{ page: string; days: number; impressions: number; clicks: number }> }>, host?: string | null) {
  return rows.flatMap((row) => {
    const contenders = row.pages.filter((page) => page.days >= 5 && page.impressions >= 10);
    if (contenders.length < 2) return [];
    const key = pageKey(contenders[0]?.page, host);
    const demand = contenders.reduce((sum, page) => sum + page.impressions, 0);
    const signals = { impressions: demand };
    return [{
      type: "CANNIBALIZATION",
      identityKey: `CANNIBALIZATION|${row.query}`,
      title: `Possible cannibalization: ${row.query}`,
      summary: `${contenders.length} URLs reciben impresiones de la misma query durante ≥5 días. No implica intenciones distintas ni que haya que redirigir.`,
      url: contenders[0]?.page,
      pageKey: key,
      keyword: row.query,
      score: opportunityScore("CANNIBALIZATION", signals),
      confidence: demand >= 500 ? "MEDIUM" : "LOW",
      evidence: { query: row.query, pages: contenders, kind: "multiple_urls_impressions" },
      recommendation: "Revisar si ambas URLs responden a la misma intención.",
    } satisfies OpportunityDraft];
  });
}

export function detectKeywordGaps(rows: Array<{ keyword: string; competitor: string; competitorPosition: number; ours: number | null; volume?: number | null }>) {
  return rows.flatMap((row) => {
    if (row.ours != null && row.ours <= row.competitorPosition) return [];
    const missing = row.ours == null;
    const type = missing ? "KEYWORD_GAP" : "KEYWORD_GAP";
    const signals = { volume: row.volume ?? 0, position: row.competitorPosition };
    return [{
      type,
      identityKey: `KEYWORD_GAP|${row.keyword}|${row.competitor}`,
      title: missing ? `Keyword gap: ${row.keyword}` : `Competidor delante: ${row.keyword}`,
      summary: missing
        ? `${row.competitor} aparece (#${row.competitorPosition}) y nosotros no, en el dataset trackeado. No es un mapa global de Google.`
        : `${row.competitor} #${row.competitorPosition} vs nosotros #${row.ours}. Dataset trackeado únicamente.`,
      keyword: row.keyword,
      score: opportunityScore(missing ? "POTENTIAL_NEW_CONTENT" : "KEYWORD_GAP", signals),
      confidence: "MEDIUM",
      evidence: { competitor: row.competitor, competitorPosition: row.competitorPosition, ours: row.ours, volume: row.volume ?? null, dataset: "tracked_serps" },
      recommendation: missing
        ? "Oportunidad de contenido potencial. No implica crear la página automáticamente."
        : "Comparar la página propia con el resultado del competidor.",
    } satisfies OpportunityDraft];
  });
}

export function detectTechnicalHighTraffic(rows: Array<{ url: string; clicks: number; severity: string; ruleKey: string }>, host?: string | null) {
  return rows.flatMap((row) => {
    if (row.clicks < 20) return [];
    if (row.severity !== "HIGH" && row.severity !== "CRITICAL") return [];
    const key = pageKey(row.url, host);
    const signals = { clicks: row.clicks, technicalHigh: true };
    return [{
      type: "TECHNICAL_HIGH_TRAFFIC",
      identityKey: `TECHNICAL_HIGH_TRAFFIC|${key || row.url}|${row.ruleKey}`,
      title: `Issue técnico en URL con tráfico: ${row.ruleKey}`,
      summary: `${row.clicks} clicks/28d y un issue ${row.severity}. La severidad técnica no cambia; esto es prioridad de trabajo.`,
      url: row.url,
      pageKey: key,
      score: opportunityScore("TECHNICAL_HIGH_TRAFFIC", signals),
      confidence: opportunityConfidence({ impressions: row.clicks * 5, clicks: row.clicks }),
      evidence: { clicks: row.clicks, severity: row.severity, ruleKey: row.ruleKey },
      recommendation: "Corregir el issue técnico en una URL que ya recibe tráfico.",
    } satisfies OpportunityDraft];
  });
}

export function detectTargetMismatch(rows: Array<{ keyword: string; targetUrl: string; rankedUrl: string; position: number | null }>, host?: string | null) {
  return rows.map((row) => {
    const signals = { position: row.position };
    return {
      type: "TARGET_URL_MISMATCH",
      identityKey: `TARGET_URL_MISMATCH|${row.keyword}`,
      title: `Target mismatch: ${row.keyword}`,
      summary: `Google posiciona ${row.rankedUrl} y el target es ${row.targetUrl}. Señal, no diagnóstico de canibalización por sí sola.`,
      url: row.rankedUrl,
      pageKey: pageKey(row.rankedUrl, host),
      keyword: row.keyword,
      score: opportunityScore("TARGET_URL_MISMATCH", signals),
      confidence: "MEDIUM",
      evidence: { targetUrl: row.targetUrl, rankedUrl: row.rankedUrl, position: row.position },
      recommendation: "Revisar si el target sigue siendo la URL correcta para esa intención.",
    } satisfies OpportunityDraft;
  });
}
