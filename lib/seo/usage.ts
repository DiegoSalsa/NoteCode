import { prisma } from "@/lib/prisma";
import { utcToday, formatDateUTC, addUtcDays } from "@/lib/seo/dates";

export async function recordSeoApiUsage(input: {
  provider: string;
  endpoint: string;
  operation?: string;
  requests?: number;
  units?: number;
  estimatedCost?: number;
  responseStatus?: string | null;
  durationMs?: number | null;
  seoProjectId?: string | null;
}) {
  return prisma.seoApiUsage.create({
    data: {
      provider: input.provider,
      endpoint: input.endpoint,
      operation: input.operation ?? "request",
      requests: input.requests ?? 1,
      units: input.units ?? 0,
      estimatedCost: input.estimatedCost ?? 0,
      responseStatus: input.responseStatus ?? null,
      durationMs: input.durationMs ?? null,
      seoProjectId: input.seoProjectId ?? null,
    },
  });
}

export async function loadProviderSpend(provider: string, now = utcToday()) {
  const dayStart = now;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [daily, monthly] = await Promise.all([
    prisma.seoApiUsage.aggregate({
      where: { provider, createdAt: { gte: dayStart } },
      _sum: { estimatedCost: true, requests: true, units: true },
    }),
    prisma.seoApiUsage.aggregate({
      where: { provider, createdAt: { gte: monthStart } },
      _sum: { estimatedCost: true, requests: true, units: true },
    }),
  ]);
  return {
    dailyUsd: daily._sum.estimatedCost ?? 0,
    dailyRequests: daily._sum.requests ?? 0,
    monthlyUsd: monthly._sum.estimatedCost ?? 0,
    monthlyRequests: monthly._sum.requests ?? 0,
    day: formatDateUTC(dayStart),
    month: formatDateUTC(monthStart),
    nextMonth: formatDateUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))),
    tomorrow: formatDateUTC(addUtcDays(dayStart, 1)),
  };
}
