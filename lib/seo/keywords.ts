import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeKeyword } from "@/lib/seo/domain";

export function normalizeKeywordInput(body: {
  keyword?: string;
  targetUrl?: string | null;
  country?: string;
  language?: string;
  device?: string;
  location?: string | null;
  group?: string | null;
  active?: boolean;
}) {
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword) throw new Error("La keyword es obligatoria.");
  const device = (body.device || "desktop").toLowerCase();
  if (device !== "desktop" && device !== "mobile") throw new Error("device debe ser desktop o mobile.");
  const country = (body.country || "CL").trim().toUpperCase();
  const language = (body.language || "es").trim().toLowerCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("country debe ser un código ISO de 2 letras.");
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(language)) throw new Error("language inválido.");
  return {
    keyword,
    normalizedKeyword: normalizeKeyword(keyword),
    targetUrl: body.targetUrl?.trim() || null,
    country,
    language,
    device,
    location: (body.location || "").trim(),
    groupName: body.group?.trim() || null,
    active: body.active !== false,
  };
}

export async function resolveKeywordGroup(seoProjectId: string, name: string | null) {
  if (!name) return null;
  const existing = await prisma.seoKeywordGroup.findUnique({
    where: { seoProjectId_name: { seoProjectId, name } },
  });
  if (existing) return existing;
  return prisma.seoKeywordGroup.create({ data: { seoProjectId, name } });
}

export function isUniqueKeywordError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function keywordStatus(keyword: { active: boolean; lastSyncStatus: string; currentPosition: number | null }) {
  if (!keyword.active) return "inactive";
  if (keyword.lastSyncStatus === "error") return "error";
  if (keyword.currentPosition != null || keyword.lastSyncStatus === "tracking") return "tracking";
  if (keyword.lastSyncStatus === "pending") return "pending";
  return "sin_datos";
}
