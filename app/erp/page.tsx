import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ErpWorkspace from "@/components/ErpWorkspace";

export default async function ErpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return <ErpWorkspace currentUser={{ id: user.id, name: user.name, role: user.role }} />;
}
