import { deltaPct, weightedAverage } from "@/lib/seo/dates";

export function summarizeGsc(rows: Array<{ clicks: number; impressions: number; ctr: number; position: number }>) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const position = weightedAverage(rows.map((row) => ({ weight: row.impressions, value: row.position })));
  return { clicks, impressions, ctr, position };
}

export function summarizeGa4(rows: Array<{
  users: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  organicSessions: number;
  keyEvents: number;
}>) {
  const users = rows.reduce((sum, row) => sum + row.users, 0);
  const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
  const engagedSessions = rows.reduce((sum, row) => sum + row.engagedSessions, 0);
  const organicSessions = rows.reduce((sum, row) => sum + row.organicSessions, 0);
  const keyEvents = rows.reduce((sum, row) => sum + row.keyEvents, 0);
  const engagementRate = sessions > 0 ? engagedSessions / sessions : 0;
  return { users, sessions, engagedSessions, engagementRate, organicSessions, keyEvents };
}

export function withDelta<T extends Record<string, number>>(current: T, previous: T) {
  return Object.fromEntries(
    Object.entries(current).map(([key, value]) => [key, { value, previous: previous[key] ?? 0, deltaPct: deltaPct(value, previous[key] ?? 0) }]),
  ) as { [K in keyof T]: { value: T[K]; previous: number; deltaPct: number } };
}

export function makeSyncIdempotencyKey(type: string, seoProjectId: string, from: string, to: string, mode: string) {
  return [type, seoProjectId, from, to, mode].filter(Boolean).join(":");
}
