"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Mail, Pencil, Plus, Send, Trash2 } from "lucide-react";

type EmailMessage = {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: "draft" | "sending" | "sent" | "failed";
  source: string;
  resendId: string | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const tabs = [
  { id: "all", label: "Todos" },
  { id: "draft", label: "Borradores" },
  { id: "sent", label: "Enviados" },
  { id: "failed", label: "Fallidos" },
];

const emptyForm = { to: "", subject: "", body: "" };

function statusLabel(status: EmailMessage["status"]) {
  if (status === "sent") return "Enviado";
  if (status === "draft") return "Borrador";
  if (status === "failed") return "Fallido";
  return "Enviando";
}

export default function CorreosPage() {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = selectedId ? messages.find((message) => message.id === selectedId) ?? null : null;
  const canEditSelected = selected?.status === "draft" || selected?.status === "failed";

  const counts = useMemo(() => ({
    all: messages.length,
    draft: messages.filter((message) => message.status === "draft").length,
    sent: messages.filter((message) => message.status === "sent").length,
    failed: messages.filter((message) => message.status === "failed").length,
  }), [messages]);

  async function loadMessages(nextStatus = status) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: nextStatus, q: query });
      const response = await fetch(`/api/emails?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar los correos.");
      setMessages(data.items ?? []);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudieron cargar los correos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [status]);

  function newDraft() {
    setEditingId(null);
    setForm(emptyForm);
    setSelectedId(null);
  }

  function editMessage(message: EmailMessage) {
    setEditingId(message.id);
    setForm({ to: message.to, subject: message.subject, body: message.body });
  }

  async function submit(intent: "draft" | "send") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingId ? `/api/emails/${editingId}` : "/api/emails", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, intent }),
      });
      const message = await response.json();
      if (!response.ok) throw new Error(message.error ?? "No se pudo guardar el correo.");

      setMessages((current) => {
        const exists = current.some((item) => item.id === message.id);
        return exists ? current.map((item) => item.id === message.id ? message : item) : [message, ...current];
      });
      setSelectedId(message.id);
      setEditingId(intent === "draft" ? message.id : null);
      if (intent === "send") setForm(emptyForm);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar el correo.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Eliminar este correo del centro?")) return;
    await fetch(`/api/emails/${id}`, { method: "DELETE" });
    setMessages((current) => current.filter((message) => message.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) newDraft();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("draft");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-neutral-100 sm:text-[28px]">Centro de correos</h1>
          <p className="mt-1 text-[14px] text-neutral-400">Borradores, enviados y correos preparados por Gilberto.</p>
        </div>
        <button
          type="button"
          onClick={newDraft}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white"
        >
          <Plus size={15} />
          Nuevo correo
        </button>
      </header>

      {error && <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_minmax(340px,420px)]">
        <aside className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadMessages();
              }}
              placeholder="Buscar correo..."
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2 lg:block lg:space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatus(tab.id)}
                className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-[13px] lg:w-full ${
                  status === tab.id ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[11px] text-neutral-500">{counts[tab.id as keyof typeof counts]}</span>
              </button>
            ))}
          </div>
          <div className="max-h-[420px] overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
            {loading ? (
              <p className="p-4 text-[13px] text-neutral-500">Cargando...</p>
            ) : messages.length === 0 ? (
              <p className="p-4 text-[13px] text-neutral-500">No hay correos.</p>
            ) : (
              messages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => setSelectedId(message.id)}
                  className={`w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/[0.03] ${
                    selectedId === message.id ? "bg-neutral-800" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-neutral-200">{message.subject}</p>
                    <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {statusLabel(message.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-neutral-500">{message.to}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-h-[360px] rounded-lg border border-white/10 bg-neutral-900 p-5">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-neutral-500">{statusLabel(selected.status)} / {selected.source}</p>
                  <h2 className="mt-1 text-[19px] font-semibold text-neutral-100">{selected.subject}</h2>
                  <p className="mt-1 text-[13px] text-neutral-400">Para: {selected.to}</p>
                </div>
                <div className="flex gap-1">
                  {canEditSelected && (
                    <button onClick={() => editMessage(selected)} className="rounded-md p-2 text-neutral-400 hover:bg-white/5 hover:text-neutral-100" title="Editar">
                      <Pencil size={15} />
                    </button>
                  )}
                  <button onClick={() => deleteMessage(selected.id)} className="rounded-md p-2 text-neutral-400 hover:bg-red-500/10 hover:text-red-300" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {selected.error && <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{selected.error}</p>}
              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-neutral-300">{selected.body}</pre>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-neutral-500">
              <Mail size={24} strokeWidth={1.5} />
              <p className="mt-3 text-[14px]">Selecciona un correo o redacta uno nuevo.</p>
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-[16px] font-semibold text-neutral-100">{editingId ? "Editar borrador" : "Redactar correo"}</h2>
          <div className="mt-5 space-y-3">
            <input
              value={form.to}
              onChange={(event) => setForm({ ...form, to: event.target.value })}
              placeholder="destinatario@empresa.com"
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
            <input
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              placeholder="Asunto"
              className="w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
            <textarea
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
              rows={14}
              placeholder="Escribe el correo..."
              className="w-full resize-none rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/20"
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md border border-white/10 px-4 py-2 text-[13px] font-medium text-neutral-300 hover:bg-white/5 disabled:opacity-60"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit("send")}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white disabled:opacity-60"
            >
              <Send size={14} />
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
