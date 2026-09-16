export type SeoRangeKey = "7d" | "28d" | "3m" | "6m" | "custom";

export type SeoPeriod = {
  range: SeoRangeKey;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  days: number;
};

const DAY_MS = 86_400_000;

export function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatDateUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseDateUTC(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Fecha inválida: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function parseGoogleDate(value: string) {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (compact) {
    return new Date(Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3])));
  }
  return parseDateUTC(value.includes("-") ? value.slice(0, 10) : value);
}

export function gscSafeEndDate(now = utcToday()) {
  return addUtcDays(now, -2);
}

export function inclusiveDays(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

export function previousPeriod(from: Date, to: Date) {
  const days = inclusiveDays(from, to);
  const previousTo = addUtcDays(from, -1);
  const previousFrom = addUtcDays(previousTo, -(days - 1));
  return { previousFrom, previousTo };
}

export function resolvePeriod(range: string | null | undefined, from?: string | null, to?: string | null): SeoPeriod {
  const key = (["7d", "28d", "3m", "6m", "custom"].includes(range ?? "") ? range : "28d") as SeoRangeKey;
  const end = gscSafeEndDate();

  if (key === "custom") {
    if (!from || !to) throw new Error("El rango personalizado requiere from y to.");
    const startDate = parseDateUTC(from);
    const endDate = parseDateUTC(to);
    if (endDate.getTime() < startDate.getTime()) throw new Error("El rango de fechas es inválido.");
    const prev = previousPeriod(startDate, endDate);
    return {
      range: key,
      from: formatDateUTC(startDate),
      to: formatDateUTC(endDate),
      previousFrom: formatDateUTC(prev.previousFrom),
      previousTo: formatDateUTC(prev.previousTo),
      days: inclusiveDays(startDate, endDate),
    };
  }

  const days = key === "7d" ? 7 : key === "28d" ? 28 : key === "3m" ? 90 : 180;
  const startDate = addUtcDays(end, -(days - 1));
  const prev = previousPeriod(startDate, end);
  return {
    range: key,
    from: formatDateUTC(startDate),
    to: formatDateUTC(end),
    previousFrom: formatDateUTC(prev.previousFrom),
    previousTo: formatDateUTC(prev.previousTo),
    days,
  };
}

export function deltaPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export function weightedAverage(values: Array<{ weight: number; value: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function truncateDimension(value: string, max = 512) {
  const normalized = value.trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max);
}
