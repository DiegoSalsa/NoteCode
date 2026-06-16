"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";
import { revealCredential } from "@/app/actions/credentials";

type Credential = {
  id: string;
  projectId: string;
  name: string;
  title: string;
  service: string;
  clientName: string;
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
};

type Project = {
  id: string;
  name: string;
  client: { name: string };
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export default function BovedaPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectId: "", name: "", username: "", password: "" });

  const fetchData = useCallback(async () => {
    const [credentialsRes, projectsRes] = await Promise.all([
      fetch("/api/credentials"),
      fetch("/api/projects"),
    ]);
    const credentialsData = await credentialsRes.json();
    const projectsData = await projectsRes.json();

    const projectItems = asArray<Project>(projectsData);
    setCredentials(asArray<Credential>(credentialsData));
    setProjects(projectItems);
    setForm((current) => ({
      ...current,
      projectId: current.projectId || projectItems[0]?.id || "",
    }));
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setModalOpen(false);
      setForm({ projectId: projects[0]?.id || "", name: "", username: "", password: "" });
      await fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar esta credencial?")) return;
    await fetch(`/api/credentials/${id}`, { method: "DELETE" });
    await fetchData();
  }

  async function toggleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }

    const secret = await revealCredential(id);
    setRevealed((current) => ({ ...current, [id]: secret }));
  }

  async function copyCredential(id: string) {
    const secret = revealed[id] ?? await revealCredential(id);
    setRevealed((current) => ({ ...current, [id]: secret }));
    await navigator.clipboard.writeText(secret);
  }

  const query = search.toLowerCase();
  const filtered = credentials.filter((credential) =>
    credential.name.toLowerCase().includes(query) ||
    credential.service.toLowerCase().includes(query) ||
    credential.clientName.toLowerCase().includes(query) ||
    credential.username.toLowerCase().includes(query)
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-neutral-800" />
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-lg border border-white/10 bg-neutral-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-neutral-100">Boveda</h1>
            <p className="mt-1 text-[13px] text-neutral-500">{credentials.length} credenciales de proyectos</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-white"
          >
            <Plus size={15} strokeWidth={2} />
            Nueva Credencial
          </button>
        </div>
        <div className="relative">
          <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar por proyecto, cliente, usuario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-neutral-900 py-2.5 pl-10 pr-4 text-[14px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-white/20"
          />
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-neutral-900">
        {filtered.map((credential, index) => (
          <div
            key={credential.id}
            className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03] ${
              index !== filtered.length - 1 ? "border-b border-white/5" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-medium text-neutral-200">{credential.name}</h3>
              <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                {credential.service} / {credential.clientName} / {credential.username}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5">
              <span className="max-w-44 truncate font-mono text-[13px] text-neutral-300">
                {revealed[credential.id] ?? "************"}
              </span>
              <button onClick={() => toggleReveal(credential.id)} className="text-neutral-500 hover:text-neutral-300" title="Revelar">
                {revealed[credential.id] ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
              </button>
              <button onClick={() => copyCredential(credential.id)} className="text-neutral-500 hover:text-neutral-300" title="Copiar">
                <Copy size={14} strokeWidth={1.5} />
              </button>
              <button onClick={() => handleDelete(credential.id)} className="text-neutral-500 hover:text-red-400" title="Eliminar">
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
            {search ? "No se encontraron credenciales." : "La boveda esta vacia."}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-neutral-100">Nueva Credencial</h2>
              <button onClick={() => setModalOpen(false)} className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">Proyecto</label>
                <select
                  required
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                >
                  <option value="">Seleccionar proyecto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} / {project.client.name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                placeholder="Nombre, ej: Hosting Produccion"
              />
              <input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                placeholder="Usuario"
              />
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[14px] text-neutral-100 outline-none focus:border-white/20"
                placeholder="Clave"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-[13px] font-medium text-neutral-300 hover:bg-white/5">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-950 hover:bg-white disabled:opacity-50">
                  {saving ? "Guardando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
