import { redirect } from "next/navigation";
import GilbertoClient from "./GilbertoClient";
import { getCurrentUser } from "@/lib/auth";

export default async function GilbertoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="md:hidden">
        <GilbertoClient />
      </div>
      <div className="hidden min-h-[50vh] items-center justify-center text-center md:flex">
        <p className="max-w-sm text-[14px] text-neutral-500">
          Gilberto esta disponible en el boton flotante de la esquina inferior derecha.
        </p>
      </div>
    </div>
  );
}
