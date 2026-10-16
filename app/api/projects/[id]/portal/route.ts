import { NextRequest, NextResponse } from "next/server";
import { canManage, getCurrentUser } from "@/lib/auth";
import {
  projectPortals,
  ensureProjectPortal,
} from "@/lib/commercial/project-portal";
import { commercialFailure } from "@/lib/commercial/http";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManage(user))
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  try {
    return NextResponse.json(await projectPortals((await params).id));
  } catch (error) {
    return commercialFailure(error);
  }
}
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManage(user))
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  try {
    return NextResponse.json(
      await ensureProjectPortal((await params).id, {
        name: user.name,
        userId: user.id,
        origin: "INTERNAL",
      }),
    );
  } catch (error) {
    return commercialFailure(error);
  }
}
