"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoState, SeoSubnav, projectSeoNav } from "@/components/seo/SeoChrome";

type Payload = {
  competitor: { domain: string };
  rows: Array<{ keyword: string; us: number | null; them: number | null; usUrl: string | null; themUrl: string | null }>;
};

export default function CompetitorDetailPage({ params }: { params: Promise<{ projectId: string; competitorId: string }> }) {
  const { projectId, competitorId } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/seo/projects/${projectId}/competitors/${competitorId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) setError(payload.error);
        else setData(payload);
      });
  }, [projectId, competitorId]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader kicker="Competitor" title={data?.competitor.domain || "Competidor"} description="Posiciones observadas en las mismas keywords trackeadas. No hay un 'ganador'." />
      <SeoSubnav items={[{ href: "/seo", label: "Portafolio" }, ...projectSeoNav(projectId)]} />
      <Link href={`/seo/proyectos/${projectId}/competitors`} className="text-[12px] text-neutral-500 hover:underline">← Competitors</Link>
      {error && <SeoState tone="error" title="Error" description={error} />}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-4 py-3">Keyword</th>
              <th className="px-4 py-3 text-right">Us</th>
              <th className="px-4 py-3 text-right">Them</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => (
              <tr key={row.keyword} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 text-sm text-white">{row.keyword}</td>
                <td className="px-4 py-3 text-right text-sm">{row.us == null ? "—" : `#${row.us}`}</td>
                <td className="px-4 py-3 text-right text-sm">{row.them == null ? "—" : `#${row.them}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
