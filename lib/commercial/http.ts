import { MoneyError } from "./money";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CommercialError } from "./transaction";

export function commercialFailure(error: unknown) {
  if (error instanceof MoneyError)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof CommercialError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  console.error("[commercial]", error);
  return NextResponse.json(
    { error: "No se pudo completar la operación comercial." },
    { status: 500 },
  );
}
