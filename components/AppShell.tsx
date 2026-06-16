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
      <main className="ml-60 min-h-screen">{children}</main>
    </>
  );
}
