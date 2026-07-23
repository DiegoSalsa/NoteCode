"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, Send, Smartphone, XCircle } from "lucide-react";

type PushStatus = {
  configured: boolean;
  subscribed: boolean;
  deviceCount: number;
  publicKey: string;
};

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function PushNotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [enabledOnDevice, setEnabledOnDevice] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/push");
    if (!response.ok) return;
    const data = await response.json() as PushStatus;
    setStatus(data);
    if (supported) {
      const registration = await navigator.serviceWorker.ready;
      setEnabledOnDevice(Boolean(await registration.pushManager.getSubscription()));
    }
  }, [supported]);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function enable() {
    if (!supported || !status?.configured) return;
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("El permiso de notificaciones fue rechazado.");

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(status.publicKey),
      });
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo activar push.");
      setEnabledOnDevice(true);
      setMessage("Push activado. Enviaremos una notificación de comprobación.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo activar push.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!supported) return;
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setEnabledOnDevice(false);
      setMessage("Notificaciones desactivadas en este dispositivo.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const result = await response.json();
      setMessage(response.ok ? "Prueba enviada al dispositivo." : result.error ?? "No se pudo enviar la prueba.");
    } catch {
      setMessage("No se pudo conectar con el servicio de notificaciones.");
    } finally {
      setBusy(false);
    }
  }

  const unavailableReason = !supported
    ? "Este navegador no soporta Web Push."
    : status && !status.configured
      ? "Falta configurar las claves VAPID del servidor."
      : "";

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-sky-500/10 p-2 text-sky-300"><Smartphone size={18} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Notificaciones push</h2>
              {enabledOnDevice
                ? <CheckCircle2 size={14} className="text-emerald-400" />
                : <XCircle size={14} className="text-neutral-600" />}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              Recibe alertas de cobros, aprobaciones, tickets, contratos y vencimientos incluso con NoteCode cerrado.
            </p>
            {status && <p className="mt-1 text-[11px] text-neutral-600">{status.deviceCount} dispositivo{status.deviceCount === 1 ? "" : "s"} registrado{status.deviceCount === 1 ? "" : "s"}.</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {enabledOnDevice ? (
            <>
              <button onClick={test} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50">
                <Send size={13} /> Probar
              </button>
              <button onClick={disable} disabled={busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-500 hover:text-white disabled:opacity-50">
                Desactivar
              </button>
            </>
          ) : (
            <button onClick={enable} disabled={busy || !supported || !status?.configured} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />} Activar en este dispositivo
            </button>
          )}
        </div>
      </div>
      {unavailableReason && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{unavailableReason}</p>}
      {message && <p className="mt-3 text-xs text-neutral-300">{message}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">En iPhone, instala NoteCode desde Safari con “Agregar a pantalla de inicio” y activa push desde la app instalada.</p>
    </section>
  );
}
