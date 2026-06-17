"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

type ShellUser = {
  displayName: string;
  email: string;
};

export default function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser | null;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar me={user} />
      <main className="min-h-screen pb-20 md:ml-60 md:pb-0">{children}</main>
    </>
  );
}
