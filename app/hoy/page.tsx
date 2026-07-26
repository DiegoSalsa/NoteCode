import { redirect } from "next/navigation";
import TodayWorkspace from "@/components/TodayWorkspace";
import { getCurrentUser } from "@/lib/auth";

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return <TodayWorkspace displayName={user.name} />;
}
