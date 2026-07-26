import { NextRequest, NextResponse } from "next/server";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { cached } from "@/lib/server-cache";
import { isValidTaxPeriod, periodForPreviousMonth } from "@/lib/tax/f29";
import { buildF29Snapshot } from "@/lib/tax/f29-service";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const requestedPeriod = searchParams.get("period") || periodForPreviousMonth();
  if (!isValidTaxPeriod(requestedPeriod)) {
    return NextResponse.json({ error: "Periodo tributario invalido. Usa AAAA-MM." }, { status: 400 });
  }

  const snapshot = await cached(
    `tax:f29:${requestedPeriod}`,
    60_000,
    () => buildF29Snapshot(requestedPeriod),
    { fresh: searchParams.get("fresh") === "1" },
  );
  return NextResponse.json(snapshot);
}
