import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { defaultSerpBudgets } from "@/lib/seo/budget";
import { isSerpProviderConfigured, seoSerpProviderName } from "@/lib/seo/config";
import { canViewSeo } from "@/lib/seo/permissions";
import { loadProviderSpend } from "@/lib/seo/usage";

export async function GET() {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const configured = isSerpProviderConfigured();
  const limits = defaultSerpBudgets();
  const spend = configured ? await loadProviderSpend("dataforseo") : {
    dailyUsd: 0, dailyRequests: 0, monthlyUsd: 0, monthlyRequests: 0, day: "", month: "",
  };
  return NextResponse.json({
    configured,
    provider: seoSerpProviderName(),
    message: configured ? null : "Proveedor SERP no configurado",
    spend,
    limits,
  });
}
