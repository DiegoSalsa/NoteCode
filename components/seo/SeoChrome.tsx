"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { SeoRangeKey } from "@/lib/seo/dates";

const RANGES: Array<{ key: SeoRangeKey; label: string }> = [
  { key: "7d", label: "7 días" },
  { key: "28d", label: "28 días" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
];

export function SeoHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{kicker}</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function projectSeoNav(projectId: string) {
  return [
    { href: `/seo/proyectos/${projectId}`, label: "Dashboard" },
    { href: `/seo/proyectos/${projectId}/search-console`, label: "Search Console" },
    { href: `/seo/proyectos/${projectId}/analytics`, label: "Analytics" },
    { href: `/seo/proyectos/${projectId}/rankings`, label: "Rankings" },
    { href: `/seo/proyectos/${projectId}/competitors`, label: "Competitors" },
  ];
}

export function SeoSubnav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  const match = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-white/10">
      {items.map((item) => {
        const active = match?.href === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative shrink-0 px-3 py-2.5 text-[13px] font-medium transition-colors ${
              active ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {item.label}
            {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-neutral-100" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function SeoRangePills({
  value,
  onChange,
}: {
  value: string;
  onChange: (range: SeoRangeKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-neutral-900 p-1">
      {RANGES.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
            value === item.key ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function SeoKpi({
  label,
  value,
  detail,
  delta,
  inverted,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: number | null;
  inverted?: boolean;
}) {
  const positive = inverted ? (delta ?? 0) < 0 : (delta ?? 0) > 0;
  const deltaClass = delta == null || Math.abs(delta) < 0.05
    ? "text-neutral-500"
    : positive
      ? "text-emerald-300"
      : "text-red-300";
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
        {delta != null && (
          <span className={deltaClass}>
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
        {detail && <span>{detail}</span>}
      </div>
    </div>
  );
}

export function SeoState({
  title,
  description,
  action,
  tone = "empty",
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: "empty" | "error" | "warning" | "disconnected";
}) {
  const border = tone === "error"
    ? "border-red-500/20 bg-red-500/10 text-red-100"
    : tone === "warning"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
      : "border-white/10 bg-neutral-900 text-neutral-200";
  return (
    <div className={`rounded-xl border px-5 py-8 ${border}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm opacity-80">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function useSeoRange() {
  const searchParams = useSearchParams();
  return (searchParams.get("range") || "28d") as SeoRangeKey;
}
