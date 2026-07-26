"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 15 * 60 * 1000;
const HEARTBEAT_KEY = "notecode:last-automation-heartbeat";

export default function AutomationHeartbeat() {
  useEffect(() => {
    let active = true;

    async function runDue() {
      if (!active || document.visibilityState === "hidden") return;
      const lastRun = Number(window.localStorage.getItem(HEARTBEAT_KEY) || 0);
      if (Date.now() - lastRun < HEARTBEAT_MS) return;

      window.localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
      const response = await fetch("/api/automations/due", { method: "POST", keepalive: true }).catch(() => null);
      if (!response?.ok) window.localStorage.removeItem(HEARTBEAT_KEY);
    }

    void runDue();
    const timer = window.setInterval(() => { void runDue(); }, HEARTBEAT_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") void runDue(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
