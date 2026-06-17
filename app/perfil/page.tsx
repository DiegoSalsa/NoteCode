import { redirect } from "next/navigation";
import { savePersonalSecret, updateProfile } from "@/app/actions/profile";
import PersonalSecretCard from "@/components/PersonalSecretCard";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  let profile;

  try {
    profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        email: user.email,
        displayName: user.name,
      },
      include: {
        personalSecrets: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            username: true,
            notes: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Failed to load profile", error);

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-5 py-4">
          <h1 className="text-[17px] font-semibold text-red-200">No se pudo cargar el perfil</h1>
          <p className="mt-2 text-[13px] text-red-200/80">
            Revisa la conexion de base de datos en las variables de entorno de Vercel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="space-y-1">
        <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">Perfil</h1>
        <p className="text-[14px] text-neutral-400">
          Personaliza tu sesion y guarda claves personales separadas de PuroCode.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <form action={updateProfile} className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-5">
            <h2 className="text-[16px] font-semibold text-neutral-100">Datos personales</h2>
            <p className="mt-1 text-[13px] text-neutral-500">{profile.email}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="displayName" className="mb-1.5 block text-[13px] font-medium text-neutral-300">
                Nombre
              </label>
              <input
                id="displayName"
                name="displayName"
                defaultValue={profile.displayName}
                required
                className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
              />
            </div>

            <div>
              <label htmlFor="age" className="mb-1.5 block text-[13px] font-medium text-neutral-300">
                Edad
              </label>
              <input
                id="age"
                name="age"
                type="number"
                min="1"
                max="120"
                defaultValue={profile.age ?? ""}
                className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                placeholder="28"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white sm:w-auto"
            >
              Guardar perfil
            </button>
          </div>
        </form>

        <form action={savePersonalSecret} className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-5">
            <h2 className="text-[16px] font-semibold text-neutral-100">Nueva clave personal</h2>
            <p className="mt-1 text-[13px] text-neutral-500">Solo visible para tu usuario.</p>
          </div>

          <div className="space-y-3">
            <input
              name="name"
              required
              placeholder="Ej: Gmail personal"
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
            <input
              name="username"
              placeholder="Usuario o email"
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Clave"
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
            <input
              name="notes"
              placeholder="Nota opcional"
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white"
            >
              Guardar clave
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-neutral-100">Boveda personal</h2>
            <p className="mt-1 text-[13px] text-neutral-500">{profile.personalSecrets.length} claves guardadas</p>
          </div>
        </div>

        <div className="space-y-2">
          {profile.personalSecrets.map((secret) => (
            <PersonalSecretCard key={secret.id} secret={secret} />
          ))}
          {profile.personalSecrets.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-neutral-900 px-5 py-10 text-center text-[13px] text-neutral-500">
              Aun no tienes claves personales guardadas.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
