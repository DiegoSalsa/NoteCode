"use client";

import { use, useCallback, useEffect, useState } from "react";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";
import SeoSparkline from "@/components/seo/SeoSparkline";
import { formatDateTime, formatInt } from "@/lib/seo/format";

export default function SiteAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [overview, setOverview] = useState<any>(null);
  const [issues, setIssues] = useState<any>(null);
  const [pages, setPages] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [page, setPage] = useState<any>(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      fetch(`/api/seo/projects/${projectId}/audit`).then((r) => r.json()),
      fetch(`/api/seo/projects/${projectId}/audit/issues`).then((r) => r.json()),
      fetch(`/api/seo/projects/${projectId}/audit/pages`).then((r) => r.json()),
    ]);
    if (a.error) setError(a.error);
    setOverview(a);
    setIssues(b);
    setPages(c);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function run() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/seo/projects/${projectId}/audit/run`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo ejecutar la auditoría.");
    setBusy(false);
    await load();
  }

  const latest = overview?.latest;
  const healthSeries = (overview?.crawls ?? []).slice().reverse().map((item: any) => item.healthScore ?? 0);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader
        kicker="Technical"
        title="Site Audit"
        description="Crawler HTTP propio de NoteCode. El Health es una fórmula interna documentada, no una métrica de Google."
        actions={
          <button type="button" disabled={busy} onClick={() => void run()} className="rounded-md bg-neutral-100 px-3 py-2 text-[13px] font-medium text-neutral-950">
            {busy ? "Auditando…" : "Ejecutar auditoría"}
          </button>
        }
      />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId)]} />
      {error && <SeoState tone="error" title="Error" description={error} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-neutral-900 p-5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600">SEO Health</p>
          <p className="mt-3 text-3xl font-semibold text-white">{latest?.healthScore ?? "—"}</p>
        </div>
        {["issuesCritical", "issuesHigh", "issuesMedium", "issuesLow"].map((key) => (
          <div key={key} className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <p className="text-[10px] uppercase tracking-wider text-neutral-600">{key.replace("issues", "")}</p>
            <p className="mt-3 text-xl text-white">{formatInt(latest?.[key] ?? 0)}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-500">{formatInt(latest?.pagesCrawled ?? 0)} URLs crawleadas · {latest?.status || "sin crawl"} · {formatDateTime(latest?.finishedAt || latest?.startedAt)}</p>
      {overview?.diff && (
        <p className="text-sm text-neutral-300">+ {overview.diff.newIssues} nuevos · ✓ {overview.diff.resolvedIssues} resueltos · = {overview.diff.persistingIssues} persisten</p>
      )}
      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-white">Health over time</h2>
        <SeoSparkline values={healthSeries.length > 1 ? healthSeries : [0, latest?.healthScore || 0]} color="#86efac" />
        <p className="mt-2 text-xs text-neutral-500">Fórmula: 100 − penalty por regla (peso × cobertura × repetición, con cap). Weights {JSON.stringify(overview?.formula?.weights || {})}.</p>
      </section>

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-white">Issues</h2>
        <div className="mt-3 space-y-2">
          {(issues?.groups ?? []).map((group: any) => (
            <button key={group.ruleKey} type="button" onClick={() => setOpenRule(openRule === group.ruleKey ? null : group.ruleKey)} className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-white">{group.rule?.title || group.ruleKey}</span>
                <span className="text-neutral-500">{group.severity} · {group.pages} URLs</span>
              </div>
              {openRule === group.ruleKey && (
                <ul className="mt-2 space-y-1 text-[12px] text-neutral-400">
                  <li>{group.rule?.recommendation}</li>
                  {group.urls.slice(0, 20).map((row: any) => (
                    <li key={row.url}>{row.url} {row.clicks ? `· GSC ${row.clicks} clicks/28d` : ""}</li>
                  ))}
                </ul>
              )}
            </button>
          ))}
          {!issues?.groups?.length && <p className="text-sm text-neutral-500">Sin issues. Ejecuta una auditoría.</p>}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
        <table className="w-full min-w-[800px] text-left">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Indexable</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Issues</th>
            </tr>
          </thead>
          <tbody>
            {(pages?.pages ?? []).map((row: any) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <td className="max-w-sm truncate px-4 py-2 text-sm text-white">
                  <button type="button" onClick={() => setPage(row)} className="hover:underline">{row.url}</button>
                </td>
                <td className="px-4 py-2 text-sm">{row.statusCode ?? "—"}</td>
                <td className="px-4 py-2 text-sm">{row.indexable ? "sí" : row.indexableReasons?.join(", ")}</td>
                <td className="max-w-xs truncate px-4 py-2 text-sm text-neutral-400">{row.title || "—"}</td>
                <td className="px-4 py-2 text-sm text-neutral-500">{row.issues?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-white">Crawls</h2>
        <ul className="mt-3 space-y-1 text-[13px] text-neutral-400">
          {(overview?.crawls ?? []).map((item: any) => (
            <li key={item.id}>{formatDateTime(item.createdAt)} · Health {item.healthScore ?? "—"} · {item.pagesCrawled} URLs · C{item.issuesCritical} H{item.issuesHigh} M{item.issuesMedium}</li>
          ))}
        </ul>
      </section>

      {page && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-white/10 bg-neutral-950 p-5 text-sm">
            <h3 className="font-semibold text-white">Page inspector</h3>
            <p className="mt-2 break-all text-neutral-300">{page.url}</p>
            <p className="mt-2 text-neutral-500">HTTP {page.statusCode} · depth {page.depth} · {page.wordCount} words</p>
            <p className="mt-2">Title: {page.title || "—"}</p>
            <p>Description: {page.description || "—"}</p>
            <p>Canonical: {page.canonical || "—"}</p>
            <p>H1: {page.h1 || "—"} ({page.h1Count})</p>
            <p>Indexable: {page.indexable ? "sí" : page.indexableReasons?.join(", ")}</p>
            <p>JSON-LD: {(page.structuredTypes || []).join(", ") || "—"}</p>
            <button type="button" onClick={() => setPage(null)} className="mt-4 rounded-md border border-white/10 px-3 py-2">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
