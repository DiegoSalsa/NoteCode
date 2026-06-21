"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  Coins,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Mail,
  MoreHorizontal,
  NotebookPen,
  ShieldCheck,
  User,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { prefetchJson } from "@/lib/client-cache";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Gilberto", href: "/gilberto", icon: Bot },
  { label: "Proyectos", href: "/proyectos", icon: FolderKanban, cacheKey: "projects:init::0:25", api: "/api/projects/init?q=&skip=0&take=25" },
  { label: "Notas", href: "/notas", icon: NotebookPen, cacheKey: "notes:::0:30", api: "/api/notes?q=&folder=&skip=0&take=30" },
  { label: "Correos", href: "/correos", icon: Mail },
  { label: "Documentos", href: "/documentos", icon: FileText, cacheKey: "documents:::0:50", api: "/api/documents?q=&category=&skip=0&take=50" },
  { label: "Boveda", href: "/boveda", icon: ShieldCheck, cacheKey: "vault::0:50", api: "/api/vault?q=&skip=0&take=50" },
  { label: "Finanzas", href: "/finanzas", icon: Coins, cacheKey: "invoices::0:30", api: "/api/invoices?q=&skip=0&take=30" },
  { label: "Perfil", href: "/perfil", icon: User },
];

const mobilePrimaryItems = navItems.slice(0, 4);
const mobileMoreItems = navItems.slice(4);

type Me = {
  displayName: string;
  email: string;
};

export default function Sidebar({ me }: { me: Me | null }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function prefetchItem(item: (typeof navItems)[number]) {
    if (item.cacheKey && item.api) {
      prefetchJson(item.cacheKey, item.api);
    }
  }

  return (
    <>
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-white/10 bg-neutral-950 md:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5">
        <img
          src="/brand/notecode-logo-horizontal-white.svg"
          alt="NoteCode"
          className="h-7 w-auto max-w-[150px]"
        />
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-4">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => prefetchItem(item)}
              onTouchStart={() => prefetchItem(item)}
              className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={1.5}
                className={active ? "text-neutral-100" : "text-neutral-500 group-hover:text-neutral-300"}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-white/10 px-5 py-4">
        <Link
          href="/perfil"
          className="flex items-center gap-3 rounded-lg border border-white/10 bg-neutral-900 px-3 py-3 transition-colors hover:bg-neutral-800/80"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[12px] font-bold text-neutral-950">
            {(me?.displayName || "P").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-neutral-100">
              {me?.displayName || "Sesion activa"}
            </p>
            <p className="truncate text-[11px] text-neutral-500">{me?.email || "notecode"}</p>
          </div>
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200"
          >
            <LogOut size={14} strokeWidth={1.5} />
            Cerrar sesion
          </button>
        </form>
        <p className="text-[11px] text-neutral-500">
          &copy; {new Date().getFullYear()} PuroCode
        </p>
      </div>
    </aside>

    {moreOpen && (
      <button
        type="button"
        aria-label="Cerrar menu"
        onClick={() => setMoreOpen(false)}
        className="fixed inset-0 z-40 bg-black/20 md:hidden"
      />
    )}

    {moreOpen && (
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-50 overflow-hidden rounded-lg border border-white/10 bg-neutral-950 shadow-2xl md:hidden">
        <div className="grid grid-cols-2 gap-1 p-2">
          {mobileMoreItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                onTouchStart={() => prefetchItem(item)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-3 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} className={active ? "text-neutral-100" : "text-neutral-500"} />
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    )}

    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-neutral-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-1.5 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {mobilePrimaryItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              onTouchStart={() => prefetchItem(item)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-medium transition-colors ${
                active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              <Icon
                size={17}
                strokeWidth={1.5}
                className={active ? "text-neutral-100" : "text-neutral-500"}
              />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-medium transition-colors ${
            moreOpen || mobileMoreItems.some((item) => isActive(item.href))
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          }`}
        >
          <MoreHorizontal
            size={17}
            strokeWidth={1.5}
            className={moreOpen || mobileMoreItems.some((item) => isActive(item.href)) ? "text-neutral-100" : "text-neutral-500"}
          />
          <span>Mas</span>
        </button>
      </div>
    </nav>
    </>
  );
}
