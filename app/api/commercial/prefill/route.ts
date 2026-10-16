import { NextRequest, NextResponse } from "next/server";
import { canManage, getCurrentUser } from "@/lib/auth";
import { proposalPrefill } from "@/lib/commercial/quotes";
import { commercialFailure } from "@/lib/commercial/http";
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManage(user))
    return NextResponse.json(
      { error: "Sin permisos comerciales." },
      { status: 403 },
    );
  try {
    const query = request.nextUrl.searchParams;
    return NextResponse.json(
      await proposalPrefill({
        projectId: query.get("projectId") || undefined,
        opportunityId: query.get("opportunityId") || undefined,
      }),
    );
  } catch (error) {
    return commercialFailure(error);
  }
}
