import SetPasswordForm from "@/app/establecer-clave/SetPasswordForm";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return <SetPasswordForm token={params.token ?? ""} />;
}
