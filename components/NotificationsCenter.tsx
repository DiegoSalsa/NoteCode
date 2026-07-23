"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import PushNotificationSettings from "@/components/PushNotificationSettings";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  severity: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/erp/notifications");
    if (response.ok) setItems(await response.json());
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mark(item: Notification) {
    await fetch(`/api/erp/notifications/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: !item.readAt }),
    });
    await load();
  }

  async function runRules() {
    setRunning(true);
    await fetch("/api/automations/run", { method: "POST" });
    await load();
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-7 sm:px-6 lg:py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Centro de actividad</h1>
          <p className="mt-1 text-sm text-neutral-500">Alertas comerciales, financieras y operativas.</p>
        </div>
        <button onClick={runRules} disabled={running} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50">
          <RefreshCw size={14} className={running ? "animate-spin" : ""} /> Revisar ahora
        </button>
      </header>

      <PushNotificationSettings />

      <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
        {items.length ? items.map((item, index) => (
          <div key={item.id} className={`flex items-start gap-3 p-4 ${index ? "border-t border-white/5" : ""} ${item.readAt ? "opacity-55" : ""}`}>
            <div className={`mt-0.5 rounded-lg p-2 ${item.severity === "critical" ? "bg-red-500/10 text-red-300" : item.severity === "success" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
              <Bell size={15} />
            </div>
            <div className="min-w-0 flex-1">
              {item.href
                ? <Link href={item.href} className="text-sm font-medium text-white hover:underline">{item.title}</Link>
                : <p className="text-sm font-medium text-white">{item.title}</p>}
              <p className="mt-1 text-xs text-neutral-400">{item.message}</p>
              <p className="mt-2 text-[10px] text-neutral-600">{new Date(item.createdAt).toLocaleString("es-CL")}</p>
            </div>
            <button onClick={() => mark(item)} title={item.readAt ? "Marcar no leída" : "Marcar leída"} className="rounded-md p-2 text-neutral-600 hover:bg-white/5 hover:text-white">
              <Check size={14} />
            </button>
          </div>
        )) : (
          <div className="p-12 text-center text-sm text-neutral-500">No hay notificaciones. Todo en orden.</div>
        )}
      </div>
    </div>
  );
}
