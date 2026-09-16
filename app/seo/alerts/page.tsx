"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SeoHeader, SeoState, SeoSubnav } from "@/components/seo/SeoChrome";
import { formatDateTime } from "@/lib/seo/format";

export default function SeoAlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const payload = await fetch("/api/seo/alerts").then((response) => response.json());
    if (payload.error) setError(payload.error);
    setAlerts(payload.alerts || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(id: string, status: string) {
    await fetch(`/api/seo/alerts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }
  async function createTask(id: string) {
    const response = await fetch(`/api/seo/alerts/${id}/task`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "No se pudo crear la tarea.");
    await load();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <SeoHeader kicker="SEO" title="Alerts" description="Alertas técnicas con dedupe. No se crean tareas solas." />
      <SeoSubnav items={[{ href: "/seo", label: "Overview" }, { href: "/seo/integraciones", label: "Integraciones" }, { href: "/seo/alerts", label: "Alerts" }]} />
      {error && <SeoState tone="error" title="Error" description={error} />}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-900">
        <table className="w-full min-w-[900px] text-left">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Alert</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Task</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 text-[12px] text-neutral-500">{formatDateTime(alert.createdAt)}</td>
                <td className="px-4 py-3 text-sm"><Link href={`/seo/proyectos/${alert.project.id}/audit`} className="hover:underline">{alert.project.name}</Link></td>
                <td className="px-4 py-3 text-sm">{alert.severity}</td>
                <td className="px-4 py-3 text-sm text-white">{alert.title}<p className="text-[12px] text-neutral-500">{alert.message}</p></td>
                <td className="px-4 py-3">
                  <select value={alert.status} onChange={(event) => void setStatus(alert.id, event.target.value)} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-[12px]">
                    {["open", "acknowledged", "resolved", "ignored"].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-[12px]">
                  {alert.taskId ? <Link href={`/proyectos/${alert.project.id}`} className="text-sky-300">Tarea</Link> : <button type="button" onClick={() => void createTask(alert.id)} className="rounded-md border border-white/10 px-2 py-1">Crear tarea</button>}
                </td>
              </tr>
            ))}
            {!alerts.length && <tr><td colSpan={6} className="px-4 py-8 text-sm text-neutral-500">Sin alertas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
