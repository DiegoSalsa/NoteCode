"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import FloatingGilberto from "@/components/FloatingGilberto";
import AutomationHeartbeat from "@/components/AutomationHeartbeat";

type ShellUser = {
  displayName: string;
  email: string;
  role: string;
};

export default function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser | null;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/" || pathname.startsWith("/portal/");
  const isDocument = pathname.startsWith("/cotizaciones/");

  if (isLogin || isDocument) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar me={user} />
      <main className="min-h-screen pb-20 md:ml-60 md:pb-0">{children}</main>
      <FloatingGilberto />
      {user && <AutomationHeartbeat />}
    </>
  );
}
