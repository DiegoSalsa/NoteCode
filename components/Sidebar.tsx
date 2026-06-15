"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    FolderKanban,
    ShieldCheck,
    Coins,
    NotebookPen,
} from "lucide-react";

const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Proyectos", href: "/proyectos", icon: FolderKanban },
    { label: "Notas", href: "/notas", icon: NotebookPen },
    { label: "Bóveda", href: "/boveda", icon: ShieldCheck },
    { label: "Finanzas", href: "/finanzas", icon: Coins },
];

export default function Sidebar() {
    const pathname = usePathname();

    function isActive(href: string) {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    }

    return (
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-white/10 bg-neutral-950">
            {/* Brand */}
            <div className="flex h-14 items-center gap-2.5 px-5 border-b border-white/10">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-neutral-100">
                    <span className="text-sm font-extrabold text-neutral-950">P</span>
                </div>
                <span className="text-[15px] font-semibold tracking-tight text-neutral-100">
                    PuroCode
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col gap-0.5 px-3 py-4">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors
                ${active
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

            {/* Footer */}
            <div className="mt-auto px-5 py-4 border-t border-white/10">
                <p className="text-[11px] text-neutral-500">
                    &copy; {new Date().getFullYear()} PuroCode
                </p>
            </div>
        </aside>
    );
}