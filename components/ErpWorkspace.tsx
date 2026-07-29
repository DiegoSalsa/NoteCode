"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowUpRight, BadgeDollarSign, Bell, BookOpenCheck, Box, BriefcaseBusiness, Building2, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock3, FileCheck2, FileSignature, Gauge,
  FolderKanban, Headphones, LayoutGrid, Plus, ReceiptText, RefreshCw, Search, Settings2,
  ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, UserRound, UsersRound, WalletCards, X,
} from "lucide-react";

type Item = Record<string, unknown> & { id: string };
type Option = { id: string; name?: string; number?: string; client?: string; amount?: number; status?: string };
type Options = {
  clients: Option[];
  projects: Option[];
  team: Option[];
  suppliers: Option[];
  invoices: Option[];
  opportunities: Option[];
  accounts: Array<Option & { code?: string }>;
  payrollPeriods: Option[];
};
type Field = {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "textarea" | "select" | "checkbox";
  required?: boolean;
  placeholder?: string;
  options?: string[];
  source?: keyof Options;
  defaultValue?: string | number | boolean;
};
type Module = {
  id: string;
  label: string;
  resource: string;
  description: string;
  icon: typeof LayoutGrid;
  fields: Field[];
};

const EMPTY_OPTIONS: Options = { clients: [], projects: [], team: [], suppliers: [], invoices: [], opportunities: [], accounts: [], payrollPeriods: [] };
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

const modules: Module[] = [
  {
    id: "proyectos", label: "Proyectos", resource: "projects", description: "Portafolio real del ERP con ejecución, equipo, costos, cobros y pendientes.", icon: FolderKanban,
    fields: [],
  },
  {
    id: "clientes", label: "Clientes", resource: "clients", description: "Ficha comercial, contactos y actividad.", icon: Building2,
    fields: [
      { key: "name", label: "Nombre", required: true }, { key: "company", label: "Empresa" },
      { key: "taxId", label: "RUT" }, { key: "email", label: "Correo", type: "email" },
      { key: "phone", label: "Teléfono" }, { key: "website", label: "Sitio web" },
      { key: "address", label: "Dirección" }, { key: "status", label: "Estado", type: "select", options: ["Activo", "Prospecto", "Inactivo"], defaultValue: "Activo" },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "crm", label: "CRM", resource: "opportunities", description: "Pipeline comercial y próximas acciones.", icon: BriefcaseBusiness,
    fields: [
      { key: "name", label: "Oportunidad", required: true }, { key: "clientId", label: "Cliente", type: "select", source: "clients" },
      { key: "company", label: "Empresa" }, { key: "contactName", label: "Contacto" },
      { key: "email", label: "Correo", type: "email" }, { key: "phone", label: "Teléfono" },
      { key: "stage", label: "Etapa", type: "select", options: ["Nuevo", "Contactado", "Reunión", "Propuesta", "Negociación", "Ganado", "Perdido"], defaultValue: "Nuevo" },
      { key: "source", label: "Origen", type: "select", options: ["Directo", "Referido", "Web", "Redes", "Evento", "Otro"], defaultValue: "Directo" },
      { key: "value", label: "Valor estimado", type: "number" }, { key: "probability", label: "Probabilidad (%)", type: "number", defaultValue: 10 },
      { key: "expectedClose", label: "Cierre esperado", type: "date" }, { key: "nextAction", label: "Próxima acción" },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "contactos", label: "Contactos", resource: "contacts", description: "Personas de contacto y responsables por cliente.", icon: UserRound,
    fields: [
      { key: "clientId", label: "Cliente", type: "select", source: "clients", required: true },
      { key: "name", label: "Nombre", required: true }, { key: "position", label: "Cargo" },
      { key: "email", label: "Correo", type: "email" }, { key: "phone", label: "Teléfono" },
      { key: "isPrimary", label: "Contacto principal", type: "checkbox" }, { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "cotizaciones", label: "Cotizaciones", resource: "quotes", description: "Propuestas, aprobaciones y conversión a proyecto.", icon: FileSignature,
    fields: [
      { key: "clientId", label: "Cliente", type: "select", source: "clients", required: true },
      { key: "projectId", label: "Proyecto", type: "select", source: "projects" },
      { key: "opportunityId", label: "Oportunidad", type: "select", source: "opportunities" },
      { key: "title", label: "Título", required: true }, { key: "validUntil", label: "Válida hasta", type: "date" },
      { key: "taxRate", label: "IVA (%)", type: "number", defaultValue: 19 }, { key: "discount", label: "Descuento (%)", type: "number", defaultValue: 0 },
      { key: "terms", label: "Condiciones", type: "textarea" }, { key: "notes", label: "Notas internas", type: "textarea" },
    ],
  },
  {
    id: "equipo", label: "Equipo", resource: "team", description: "Capacidad, costos y tarifas del equipo.", icon: UsersRound,
    fields: [
      { key: "name", label: "Nombre", required: true }, { key: "email", label: "Correo", type: "email" },
      { key: "role", label: "Rol", type: "select", options: ["Dirección", "Project Manager", "Diseñador", "Desarrollador", "QA", "DevOps", "Comercial"], defaultValue: "Desarrollador" },
      { key: "skills", label: "Habilidades (separadas por coma)" }, { key: "weeklyCapacity", label: "Capacidad semanal", type: "number", defaultValue: 40 },
      { key: "hourlyCost", label: "Costo por hora", type: "number" }, { key: "billableRate", label: "Tarifa facturable", type: "number" },
      { key: "monthlySalary", label: "Sueldo base mensual", type: "number" },
    ],
  },
  {
    id: "horas", label: "Horas", resource: "time-entries", description: "Tiempo, facturabilidad y costo real por proyecto.", icon: Clock3,
    fields: [
      { key: "projectId", label: "Proyecto", type: "select", source: "projects", required: true },
      { key: "teamMemberId", label: "Persona", type: "select", source: "team", required: true },
      { key: "date", label: "Fecha", type: "date", required: true }, { key: "hours", label: "Horas", type: "number", required: true },
      { key: "description", label: "Descripción", type: "textarea", required: true }, { key: "billable", label: "Facturable", type: "checkbox", defaultValue: true },
    ],
  },
  {
    id: "asignaciones", label: "Asignaciones", resource: "assignments", description: "Personas, proyectos y porcentaje de dedicación.", icon: UsersRound,
    fields: [
      { key: "projectId", label: "Proyecto", type: "select", source: "projects", required: true },
      { key: "teamMemberId", label: "Persona", type: "select", source: "team", required: true },
      { key: "role", label: "Rol en el proyecto" }, { key: "allocation", label: "Dedicación (%)", type: "number", defaultValue: 100 },
      { key: "startDate", label: "Inicio", type: "date" }, { key: "endDate", label: "Término", type: "date" },
    ],
  },
  {
    id: "ausencias", label: "Ausencias", resource: "absences", description: "Vacaciones, permisos y disponibilidad.", icon: Clock3,
    fields: [
      { key: "teamMemberId", label: "Persona", type: "select", source: "team", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["Vacaciones", "Permiso", "Licencia", "Capacitación", "Otro"], defaultValue: "Vacaciones" },
      { key: "startDate", label: "Inicio", type: "date", required: true }, { key: "endDate", label: "Término", type: "date", required: true },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "gastos", label: "Gastos", resource: "expenses", description: "Costos internos y atribuibles a proyectos.", icon: ReceiptText,
    fields: [
      { key: "description", label: "Descripción", required: true }, { key: "supplierId", label: "Proveedor", type: "select", source: "suppliers" },
      { key: "projectId", label: "Proyecto", type: "select", source: "projects" }, { key: "category", label: "Categoría", type: "select", options: ["Software", "Infraestructura", "Servicios", "Marketing", "Administración", "Impuestos", "General"], defaultValue: "General" },
      { key: "amount", label: "Monto", type: "number", required: true }, { key: "taxAmount", label: "IVA crédito", type: "number" },
      { key: "date", label: "Fecha", type: "date", required: true }, { key: "status", label: "Estado", type: "select", options: ["Pendiente", "Pagado"], defaultValue: "Pagado" },
      { key: "recurring", label: "Recurrente", type: "checkbox" }, { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "proveedores", label: "Proveedores", resource: "suppliers", description: "Directorio y clasificación de proveedores.", icon: WalletCards,
    fields: [
      { key: "name", label: "Nombre", required: true }, { key: "taxId", label: "RUT" },
      { key: "email", label: "Correo", type: "email" }, { key: "phone", label: "Teléfono" },
      { key: "category", label: "Categoría", type: "select", options: ["Servicios", "Software", "Infraestructura", "Marketing", "Administración"], defaultValue: "Servicios" },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "pagos", label: "Pagos", resource: "payments", description: "Abonos y conciliación de facturas.", icon: CircleDollarSign,
    fields: [
      { key: "invoiceId", label: "Factura", type: "select", source: "invoices", required: true },
      { key: "amount", label: "Monto", type: "number", required: true }, { key: "paidAt", label: "Fecha", type: "date", required: true },
      { key: "method", label: "Método", type: "select", options: ["Transferencia", "Tarjeta", "Efectivo", "Cheque", "Otro"], defaultValue: "Transferencia" },
      { key: "reference", label: "Referencia" }, { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "contratos", label: "Contratos", resource: "contracts", description: "Mantenimiento, bolsas de horas y renovaciones.", icon: FileCheck2,
    fields: [
      { key: "clientId", label: "Cliente", type: "select", source: "clients", required: true },
      { key: "projectId", label: "Proyecto", type: "select", source: "projects" }, { key: "name", label: "Contrato", required: true },
      { key: "billingCycle", label: "Facturación", type: "select", options: ["Mensual", "Trimestral", "Semestral", "Anual"], defaultValue: "Mensual" },
      { key: "monthlyAmount", label: "Monto mensual", type: "number" }, { key: "includedHours", label: "Horas incluidas", type: "number" },
      { key: "responseHours", label: "SLA respuesta (h)", type: "number", defaultValue: 24 }, { key: "resolutionHours", label: "SLA resolución (h)", type: "number", defaultValue: 72 },
      { key: "startDate", label: "Inicio", type: "date", required: true }, { key: "endDate", label: "Término", type: "date" },
      { key: "autoRenew", label: "Renovación automática", type: "checkbox", defaultValue: true }, { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "soporte", label: "Soporte", resource: "tickets", description: "Tickets, responsables y cumplimiento de SLA.", icon: Headphones,
    fields: [
      { key: "clientId", label: "Cliente", type: "select", source: "clients", required: true },
      { key: "projectId", label: "Proyecto", type: "select", source: "projects" }, { key: "subject", label: "Asunto", required: true },
      { key: "description", label: "Descripción", type: "textarea", required: true }, { key: "priority", label: "Prioridad", type: "select", options: ["Baja", "Media", "Alta", "Crítica"], defaultValue: "Media" },
      { key: "category", label: "Categoría", type: "select", options: ["Soporte", "Incidente", "Solicitud", "Mejora", "Consulta"], defaultValue: "Soporte" },
      { key: "assignee", label: "Responsable" }, { key: "requester", label: "Solicitante" },
    ],
  },
  {
    id: "aprobaciones", label: "Aprobaciones", resource: "approvals", description: "Decisiones y feedback formal del cliente.", icon: CheckCircle2,
    fields: [
      { key: "projectId", label: "Proyecto", type: "select", source: "projects", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["Entregable", "Requisito", "Diseño", "Cambio", "Hito"], defaultValue: "Entregable" },
      { key: "title", label: "Título", required: true }, { key: "description", label: "Descripción", type: "textarea" },
    ],
  },
  {
    id: "automatizaciones", label: "Automatizaciones", resource: "automations", description: "Reglas para alertas y tareas recurrentes.", icon: Settings2,
    fields: [
      { key: "name", label: "Nombre", required: true },
      { key: "trigger", label: "Disparador", type: "select", options: ["Factura vencida", "Tarea vencida", "Proyecto inactivo", "Contrato por vencer", "SLA próximo", "Cotización por vencer"], required: true },
      { key: "action", label: "Acción", type: "select", options: ["Crear notificación", "Crear tarea", "Preparar correo", "Actualizar estado"], required: true },
      { key: "active", label: "Activa", type: "checkbox", defaultValue: true },
    ],
  },
  {
    id: "compras", label: "Compras", resource: "purchase-orders", description: "Órdenes, aprobaciones, recepción y costos.", icon: ShoppingCart,
    fields: [
      { key: "supplierId", label: "Proveedor", type: "select", source: "suppliers", required: true },
      { key: "projectId", label: "Proyecto", type: "select", source: "projects" },
      { key: "expectedAt", label: "Entrega esperada", type: "date" },
      { key: "taxRate", label: "IVA (%)", type: "number", defaultValue: 19 },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "activos", label: "Activos", resource: "assets", description: "Hardware, licencias, asignaciones y renovaciones.", icon: Box,
    fields: [
      { key: "name", label: "Activo o licencia", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["Hardware", "Software", "Licencia", "Dominio", "Servicio"], defaultValue: "Hardware" },
      { key: "category", label: "Categoría" }, { key: "serialNumber", label: "Serie / identificador" },
      { key: "licenseKey", label: "Clave (se almacenará cifrada)" }, { key: "vendor", label: "Proveedor / marca" },
      { key: "assignedToId", label: "Asignado a", type: "select", source: "team" },
      { key: "status", label: "Estado", type: "select", options: ["Disponible", "Asignado", "En reparación", "Retirado"], defaultValue: "Disponible" },
      { key: "purchaseDate", label: "Fecha de compra", type: "date" }, { key: "purchaseCost", label: "Costo de compra", type: "number" },
      { key: "renewalDate", label: "Renovación", type: "date" }, { key: "monthlyCost", label: "Costo mensual", type: "number" },
      { key: "location", label: "Ubicación" }, { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  {
    id: "remuneraciones", label: "Remuneraciones", resource: "payroll", description: "Períodos, liquidaciones y pagos internos.", icon: CircleDollarSign,
    fields: [
      { key: "name", label: "Período", required: true }, { key: "startDate", label: "Inicio", type: "date", required: true },
      { key: "endDate", label: "Término", type: "date", required: true }, { key: "paymentDate", label: "Fecha de pago", type: "date" },
    ],
  },
  {
    id: "cuentas", label: "Plan de cuentas", resource: "accounts", description: "Estructura contable interna.", icon: BookOpenCheck,
    fields: [
      { key: "code", label: "Código", required: true }, { key: "name", label: "Cuenta", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["Activo", "Pasivo", "Patrimonio", "Ingreso", "Gasto"], required: true },
    ],
  },
  {
    id: "contabilidad", label: "Contabilidad", resource: "journal", description: "Asientos balanceados y libro diario.", icon: BookOpenCheck,
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      { key: "description", label: "Glosa", required: true }, { key: "reference", label: "Referencia" },
    ],
  },
  { id: "papelera", label: "Papelera", resource: "trash", description: "Restaura elementos eliminados por error.", icon: Trash2, fields: [] },
  { id: "auditoria", label: "Auditoría", resource: "audit", description: "Trazabilidad de acciones sensibles.", icon: ShieldCheck, fields: [] },
  { id: "usuarios", label: "Usuarios", resource: "users", description: "Roles y acceso de usuarios internos.", icon: UserRound, fields: [] },
];

const stages = ["Nuevo", "Contactado", "Reunión", "Propuesta", "Negociación", "Ganado", "Perdido"];

const primaryModuleIds = new Set(["proyectos", "clientes", "crm", "cotizaciones", "horas", "asignaciones", "soporte", "aprobaciones"]);
const projectScopedResources = new Set([
  "clients", "opportunities", "contacts", "quotes", "team", "time-entries", "assignments",
  "suppliers", "expenses", "payments", "contracts", "tickets", "approvals", "purchase-orders",
]);

function value(item: Item, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, item);
}

function labelForOption(option: Option) {
  return option.name ?? (option.number ? `${option.number}${option.client ? ` · ${option.client}` : ""}` : option.id);
}

function statusClass(status: string) {
  if (["Ganado", "Pagado", "Aprobada", "Aprobado", "Resuelto", "Activo", "Completado"].includes(status)) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (["Perdido", "Rechazada", "Rechazado", "Vencido", "Crítica", "Cerrado"].includes(status)) return "border-red-500/20 bg-red-500/10 text-red-300";
  if (["Pendiente", "Enviada", "Negociación", "Alta", "Parcial"].includes(status)) return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-white/10 bg-white/5 text-neutral-300";
}

function Status({ children }: { children: unknown }) {
  const status = String(children ?? "—");
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(status)}`}>{status}</span>;
}

export default function ErpWorkspace({ currentUser }: { currentUser: { id: string; name: string; role: string } }) {
  const [tab, setTab] = useState("proyectos");
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [quoteLines, setQuoteLines] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [journalLines, setJournalLines] = useState([
    { accountId: "", description: "", debit: 0, credit: 0 },
    { accountId: "", description: "", debit: 0, credit: 0 },
  ]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [generatedPortal, setGeneratedPortal] = useState("");
  const dataCache = useRef(new Map<string, { savedAt: number; data: Item[] | Record<string, number> }>());
  const optionsCache = useRef<{ savedAt: number; data: Options } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const module = modules.find((entry) => entry.id === tab);
  const projectScoped = Boolean(module && projectScopedResources.has(module.resource));
  const visibleModules = useMemo(() => modules.filter((entry) => {
    const financial = ["gastos", "proveedores", "pagos", "compras", "remuneraciones", "cuentas", "contabilidad"].includes(entry.id);
    const adminOnly = ["auditoria", "usuarios", "papelera"].includes(entry.id);
    if (adminOnly) return currentUser.role === "ADMIN";
    if (financial) return ["ADMIN", "MANAGER", "FINANCE"].includes(currentUser.role);
    return true;
  }), [currentUser.role]);
  const primaryModules = visibleModules.filter((entry) => primaryModuleIds.has(entry.id));
  const utilityModules = visibleModules.filter((entry) => !primaryModuleIds.has(entry.id));

  const loadOptions = useCallback(async (force = false) => {
    if (!force && optionsCache.current && Date.now() - optionsCache.current.savedAt < 120_000) {
      setOptions(optionsCache.current.data);
      return;
    }
    const response = await fetch("/api/erp/options");
    if (response.ok) {
      const data = await response.json() as Options;
      optionsCache.current = { savedAt: Date.now(), data };
      setOptions(data);
    }
  }, []);

  const load = useCallback(async (force = false) => {
    const cacheKey = `${tab}:${projectId}:${query.trim().toLowerCase()}`;
    const cached = dataCache.current.get(cacheKey);
    if (!force && cached && Date.now() - cached.savedAt < 30_000) {
      if (tab === "resumen") setOverview(cached.data as Record<string, number>);
      else setItems(cached.data as Item[]);
      setLoading(false);
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      if (tab === "resumen") {
        const response = await fetch("/api/erp/overview", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setOverview(data);
        setItems([]);
        dataCache.current.set(cacheKey, { savedAt: Date.now(), data });
      } else if (tab === "portal") {
        const response = await fetch(`/api/erp/portal-tokens?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setItems(data);
        dataCache.current.set(cacheKey, { savedAt: Date.now(), data });
      } else if (module) {
        const params = new URLSearchParams({ q: query });
        if (projectScoped && projectId) params.set("projectId", projectId);
        const response = await fetch(`/api/erp/${module.resource}?${params.toString()}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const nextItems = Array.isArray(data) ? data : [];
        setItems(nextItems);
        dataCache.current.set(cacheKey, { savedAt: Date.now(), data: nextItems });
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los datos.");
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, [module, projectId, projectScoped, query, tab]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const requestedProject = new URLSearchParams(window.location.search).get("projectId");
    if (requestedTab && (modules.some((entry) => entry.id === requestedTab) || requestedTab === "portal")) setTab(requestedTab);
    if (requestedProject) setProjectId(requestedProject);
    const onHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const nextTab = params.get("tab") || "proyectos";
      setProjectId(params.get("projectId") || "");
      if (modules.some((entry) => entry.id === nextTab) || nextTab === "portal" || nextTab === "resumen") setTab(nextTab);
    };
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);
  useEffect(() => { void load(); }, [tab, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (projectScoped || tab === "proyectos") void loadOptions();
  }, [loadOptions, projectScoped, tab]);

  function selectTab(nextTab: string) {
    setQuery("");
    setTab(nextTab);
    const url = new URL(window.location.href);
    if (nextTab === "proyectos") url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextTab);
    const nextProjectScoped = projectScopedResources.has(modules.find((entry) => entry.id === nextTab)?.resource ?? "");
    if (nextProjectScoped && projectId) url.searchParams.set("projectId", projectId);
    else url.searchParams.delete("projectId");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function selectProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    const url = new URL(window.location.href);
    if (nextProjectId) url.searchParams.set("projectId", nextProjectId);
    else url.searchParams.delete("projectId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function openCreate() {
    if (!module) return;
    if (module.fields.some((field) => field.source)) await loadOptions();
    const initial: Record<string, string | number | boolean> = {};
    for (const field of module.fields) {
      if (field.defaultValue !== undefined) initial[field.key] = field.defaultValue;
      if (field.type === "date" && ["date", "paidAt", "startDate"].includes(field.key)) initial[field.key] = new Date().toISOString().slice(0, 10);
    }
    if (projectScoped && projectId && module.fields.some((field) => field.key === "projectId")) {
      initial.projectId = projectId;
    }
    setForm(initial);
    setQuoteLines([{ description: "", quantity: 1, unitPrice: 0 }]);
    setJournalLines([
      { accountId: "", description: "", debit: 0, credit: 0 },
      { accountId: "", description: "", debit: 0, credit: 0 },
    ]);
    setModal(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!module) return;
    setSaving(true);
    setError("");
    try {
      const payload = ["quotes", "purchase-orders"].includes(module.resource)
        ? { ...form, items: quoteLines }
        : module.resource === "journal"
          ? { ...form, lines: journalLines }
          : form;
      const response = await fetch(`/api/erp/${module.resource}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setModal(false);
      dataCache.current.clear();
      await Promise.all([load(true), loadOptions(true)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function update(resource: string, id: string, payload: Record<string, unknown>) {
    setError("");
    const response = await fetch(`/api/erp/${resource}/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "No se pudo actualizar.");
      return;
    }
    dataCache.current.clear();
    await Promise.all([load(true), loadOptions(true)]);
  }

  async function remove(resource: string, id: string) {
    if (!confirm("¿Enviar este registro a la papelera?")) return;
    const response = await fetch(`/api/erp/${resource}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "No se pudo eliminar.");
      return;
    }
    dataCache.current.clear();
    await load(true);
  }

  async function createPortal(clientId: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/erp/portal-tokens", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const url = `${window.location.origin}${data.portalUrl}`;
      setGeneratedPortal(url);
      await navigator.clipboard?.writeText(url);
      dataCache.current.clear();
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo crear el acceso.");
    } finally {
      setSaving(false);
    }
  }

  async function managePortalToken(id: string, action: "rotate" | "revoke" | "restore") {
    if (action === "rotate" && !confirm("Se invalidará el enlace anterior. ¿Quieres generar uno nuevo?")) return;
    const response = await fetch(`/api/erp/portal-tokens/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "No se pudo actualizar el acceso.");
      return;
    }
    if (data.portalUrl) {
      const url = `${window.location.origin}${data.portalUrl}`;
      setGeneratedPortal(url);
      await navigator.clipboard?.writeText(url);
    }
    dataCache.current.clear();
    await load(true);
  }

  async function addActivity(opportunityId: string) {
    const subject = prompt("¿Qué actividad quieres registrar?");
    if (!subject?.trim()) return;
    const response = await fetch("/api/erp/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId, subject, type: "Nota" }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "No se pudo registrar la actividad.");
      return;
    }
    dataCache.current.clear();
    await load(true);
  }

  async function addTicketComment(ticketId: string) {
    const body = prompt("Escribe la respuesta al cliente");
    if (!body?.trim()) return;
    const response = await fetch("/api/erp/ticket-comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, body, author: currentUser.name, isPublic: true }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "No se pudo responder.");
      return;
    }
    dataCache.current.clear();
    await load(true);
  }

  const filtered = useMemo(() => {
    if (!query) return items;
    const normalized = query.toLowerCase();
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(normalized));
  }, [items, query]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            <Gauge size={14} /> Sistema operativo
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Gestión integral</h1>
          <p className="mt-1 text-sm text-neutral-400">Ventas, ejecución, rentabilidad, cobranza y soporte en un solo flujo.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2">
          <UserRound size={15} className="text-neutral-500" />
          <div>
            <p className="text-xs font-medium text-neutral-200">{currentUser.name}</p>
            <p className="text-[10px] uppercase tracking-wide text-neutral-600">{currentUser.role}</p>
          </div>
        </div>
      </header>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 scrollbar-hide lg:flex-wrap lg:overflow-visible lg:pb-0">
        {primaryModules.map((entry) => {
          const Icon = entry.icon;
          return (
            <button key={entry.id} onClick={() => selectTab(entry.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === entry.id ? "bg-white text-neutral-950" : "border border-white/10 bg-neutral-900 text-neutral-400 hover:text-neutral-200"}`}>
              <Icon size={14} /> {entry.label}
            </button>
          );
        })}
        <button onClick={() => selectTab("resumen")} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === "resumen" ? "bg-white text-neutral-950" : "border border-white/10 bg-neutral-900 text-neutral-400"}`}>
          <LayoutGrid size={14} /> Resumen
        </button>
        {["ADMIN", "MANAGER"].includes(currentUser.role) && (
          <button onClick={() => selectTab("portal")} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === "portal" ? "bg-white text-neutral-950" : "border border-white/10 bg-neutral-900 text-neutral-400"}`}>
            <ShieldCheck size={14} /> Portales
          </button>
        )}
        <label className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${utilityModules.some((entry) => entry.id === tab) ? "border-white bg-white text-neutral-950" : "border-white/10 bg-neutral-900 text-neutral-400"}`}>
          <SlidersHorizontal size={14} />
          <select
            aria-label="Más herramientas de gestión"
            value={utilityModules.some((entry) => entry.id === tab) ? tab : ""}
            onChange={(event) => event.target.value && selectTab(event.target.value)}
            className="bg-transparent text-inherit outline-none"
          >
            <option value="" className="bg-neutral-900 text-neutral-300">Más herramientas</option>
            {utilityModules.map((entry) => <option key={entry.id} value={entry.id} className="bg-neutral-900 text-neutral-300">{entry.label}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {tab === "resumen" ? (
        <Overview data={overview} loading={loading} onRefresh={load} />
      ) : (
        <section className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{tab === "portal" ? "Portal de clientes" : module?.label}</h2>
              <p className="mt-0.5 text-sm text-neutral-500">{tab === "portal" ? "Genera accesos seguros para cada cliente." : module?.description}</p>
            </div>
            <div className="flex gap-2">
              {projectScoped && (
                <select
                  aria-label="Filtrar por proyecto"
                  value={projectId}
                  onChange={(event) => selectProject(event.target.value)}
                  className="min-w-0 max-w-56 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 outline-none focus:border-white/20"
                >
                  <option value="">Todos los proyectos</option>
                  {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              )}
              <div className="relative flex-1 sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="Buscar..." className="w-full rounded-lg border border-white/10 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-white/20" />
              </div>
              {module && module.fields.length > 0 && (
                <button onClick={() => void openCreate()} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950">
                  <Plus size={14} /> Nuevo
                </button>
              )}
            </div>
          </div>

          {loading ? <LoadingRows /> : tab === "crm" ? (
            <Pipeline items={filtered} onUpdate={(id, payload) => update("opportunities", id, payload)} onRemove={(id) => remove("opportunities", id)} onActivity={addActivity} />
          ) : tab === "proyectos" ? (
            <ProjectPortfolio items={filtered} onOpenModule={(nextTab, nextProjectId) => {
              selectProject(nextProjectId);
              selectTab(nextTab);
            }} />
          ) : tab === "portal" ? (
            <PortalList items={filtered} generated={generatedPortal} onGenerate={createPortal} onManage={managePortalToken} />
          ) : tab === "remuneraciones" ? (
            <PayrollList items={filtered} onUpdate={update} onRemove={remove} />
          ) : (
            <ModuleList module={module!} items={filtered} onUpdate={update} onRemove={remove} onTicketComment={addTicketComment} />
          )}
        </section>
      )}

      {modal && module && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-neutral-500">Nuevo registro</p><h3 className="text-lg font-semibold text-white">{module.label}</h3></div>
              <button type="button" onClick={() => setModal(false)} className="rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><X size={16} /></button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {module.fields.map((field) => <FormField key={field.key} field={field} form={form} options={options} onChange={(next) => setForm((current) => ({ ...current, [field.key]: next }))} />)}
            </div>
            {["quotes", "purchase-orders"].includes(module.resource) && (
              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">Ítems</p><button type="button" onClick={() => setQuoteLines((current) => [...current, { description: "", quantity: 1, unitPrice: 0 }])} className="text-xs text-neutral-400 hover:text-white">+ Agregar línea</button></div>
                <div className="mt-3 space-y-2">
                  {quoteLines.map((line, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_70px_110px_32px] gap-2">
                      <input required value={line.description} onChange={(event) => setQuoteLines((current) => current.map((entry, position) => position === index ? { ...entry, description: event.target.value } : entry))} placeholder="Descripción" className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white" />
                      <input required type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => setQuoteLines((current) => current.map((entry, position) => position === index ? { ...entry, quantity: Number(event.target.value) } : entry))} className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-2 text-sm text-white" />
                      <input required type="number" min="0" value={line.unitPrice} onChange={(event) => setQuoteLines((current) => current.map((entry, position) => position === index ? { ...entry, unitPrice: Number(event.target.value) } : entry))} className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-2 text-sm text-white" />
                      <button type="button" onClick={() => setQuoteLines((current) => current.filter((_, position) => position !== index))} className="text-neutral-600 hover:text-red-300"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {module.resource === "journal" && (
              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Debe y haber</p>
                  <button type="button" onClick={() => setJournalLines((current) => [...current, { accountId: "", description: "", debit: 0, credit: 0 }])} className="text-xs text-neutral-400 hover:text-white">+ Agregar línea</button>
                </div>
                <div className="mt-3 space-y-2 overflow-x-auto">
                  {journalLines.map((line, index) => (
                    <div key={index} className="grid min-w-[650px] grid-cols-[minmax(150px,1fr)_minmax(120px,1fr)_100px_100px_30px] gap-2">
                      <select required value={line.accountId} onChange={(event) => setJournalLines((current) => current.map((entry, position) => position === index ? { ...entry, accountId: event.target.value } : entry))} className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-2 text-xs text-white">
                        <option value="">Cuenta...</option>
                        {options.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                      </select>
                      <input value={line.description} onChange={(event) => setJournalLines((current) => current.map((entry, position) => position === index ? { ...entry, description: event.target.value } : entry))} placeholder="Detalle" className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-2 text-xs text-white" />
                      <input type="number" min="0" value={line.debit} onChange={(event) => setJournalLines((current) => current.map((entry, position) => position === index ? { ...entry, debit: Number(event.target.value) } : entry))} placeholder="Debe" className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-2 text-xs text-white" />
                      <input type="number" min="0" value={line.credit} onChange={(event) => setJournalLines((current) => current.map((entry, position) => position === index ? { ...entry, credit: Number(event.target.value) } : entry))} placeholder="Haber" className="rounded-lg border border-white/10 bg-neutral-950 px-2 py-2 text-xs text-white" />
                      <button type="button" onClick={() => setJournalLines((current) => current.filter((_, position) => position !== index))} className="text-neutral-600 hover:text-red-300"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-right text-xs text-neutral-500">Debe {money.format(journalLines.reduce((sum, line) => sum + line.debit, 0))} · Haber {money.format(journalLines.reduce((sum, line) => sum + line.credit, 0))}</p>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
              <button type="button" onClick={() => setModal(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-neutral-300">Cancelar</button>
              <button disabled={saving} className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FormField({ field, form, options, onChange }: { field: Field; form: Record<string, string | number | boolean>; options: Options; onChange: (value: string | number | boolean) => void }) {
  const current = form[field.key] ?? (field.type === "checkbox" ? false : "");
  const wide = field.type === "textarea" || ["notes", "description", "terms"].includes(field.key);
  const base = "w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-white/25";
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-medium text-neutral-400">{field.label}{field.required ? " *" : ""}</span>
      {field.type === "textarea" ? <textarea required={field.required} rows={3} value={String(current)} onChange={(event) => onChange(event.target.value)} className={base} placeholder={field.placeholder} />
        : field.type === "select" ? (
          <select required={field.required} value={String(current)} onChange={(event) => onChange(event.target.value)} className={base}>
            <option value="">Seleccionar...</option>
            {field.source ? options[field.source].map((option) => <option key={option.id} value={option.id}>{labelForOption(option)}</option>) : field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : field.type === "checkbox" ? (
          <button type="button" onClick={() => onChange(!Boolean(current))} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${current ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-neutral-950 text-neutral-500"}`}><span>{current ? "Sí" : "No"}</span><CheckCircle2 size={15} /></button>
        ) : <input required={field.required} type={field.type ?? "text"} step={field.type === "number" ? "any" : undefined} value={String(current)} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)} className={base} placeholder={field.placeholder} />}
    </label>
  );
}

function Overview({ data, loading, onRefresh }: { data: Record<string, number>; loading: boolean; onRefresh: () => void }) {
  const cards = [
    ["Pipeline", money.format(data.pipelineValue ?? 0), `${data.opportunities ?? 0} oportunidades`, BriefcaseBusiness],
    ["Facturado este mes", money.format(data.invoicedThisMonth ?? 0), `${data.overdueInvoices ?? 0} vencidas`, BadgeDollarSign],
    ["Cobrado este mes", money.format(data.collectedThisMonth ?? 0), "Ingresos registrados", CircleDollarSign],
    ["Flujo neto", money.format(data.grossCashFlow ?? 0), `${money.format(data.expensesThisMonth ?? 0)} en gastos`, Activity],
    ["Proyectos activos", numberFormat.format(data.activeProjects ?? 0), `${numberFormat.format(data.hoursThisMonth ?? 0)} h registradas`, Gauge],
    ["Soporte", numberFormat.format(data.openTickets ?? 0), `${data.pendingApprovals ?? 0} aprobaciones pendientes`, Headphones],
  ] as const;
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Pulso del negocio</h2><p className="text-sm text-neutral-500">Indicadores del mes y pendientes operativos.</p></div><button onClick={onRefresh} className="rounded-lg border border-white/10 p-2 text-neutral-500 hover:text-white"><RefreshCw size={15} /></button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, metric, subtitle, Icon]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-neutral-900 p-5">
            <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p><Icon size={17} className="text-neutral-600" /></div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{loading ? "—" : metric}</p>
            <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5">
        <div className="flex items-start gap-3"><Bell size={18} className="mt-0.5 text-amber-300" /><div><p className="text-sm font-semibold text-white">Centro de decisiones</p><p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-400">Prioriza facturas vencidas, aprobaciones pendientes, contratos próximos a vencer y tickets fuera de SLA. Las reglas de automatización pueden convertir estas señales en notificaciones y borradores de seguimiento.</p></div></div>
      </div>
    </section>
  );
}

function ProjectPortfolio({ items, onOpenModule }: { items: Item[]; onOpenModule: (tab: string, projectId: string) => void }) {
  if (!items.length) return <EmptyState label="Proyectos" />;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-neutral-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{items.length} proyectos conectados</p>
          <p className="mt-1 text-xs text-neutral-500">Esta es la misma cartera de Proyectos; horas, equipo, costos, cobros y soporte se calculan desde sus registros reales.</p>
        </div>
        <Link href="/proyectos" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/5 hover:text-white">
          Administrar proyectos <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((project) => {
          const financials = project.financials && typeof project.financials === "object"
            ? project.financials as Record<string, number>
            : null;
          const assignments = Array.isArray(project.assignments) ? project.assignments as Array<Item> : [];
          const count = project._count && typeof project._count === "object" ? project._count as Record<string, number> : {};
          return (
            <article key={project.id} className="rounded-xl border border-white/10 bg-neutral-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-neutral-500">{String(value(project, "client.name") ?? "Sin cliente")}</p>
                  <Link href={`/proyectos/${project.id}`} className="mt-1 block truncate text-lg font-semibold text-white hover:underline">{String(project.name)}</Link>
                  {Boolean(project.description) && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{String(project.description)}</p>}
                </div>
                <Status>{project.status}</Status>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SmallProjectMetric label="Horas" value={numberFormat.format(Number(project.hours ?? 0))} />
                <SmallProjectMetric label="Equipo" value={String(assignments.length)} />
                <SmallProjectMetric label="Tickets abiertos" value={String(project.openTickets ?? 0)} tone={Number(project.openTickets) > 0 ? "warning" : undefined} />
                <SmallProjectMetric label="Aprobaciones" value={String(project.pendingApprovals ?? 0)} tone={Number(project.pendingApprovals) > 0 ? "warning" : undefined} />
              </div>
              {financials && (
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-white/5 bg-neutral-950 p-3">
                  <div><p className="text-[10px] uppercase tracking-wide text-neutral-600">Costos</p><p className="mt-1 text-xs font-medium text-neutral-300">{money.format(financials.totalCost ?? 0)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-neutral-600">Cobrado</p><p className="mt-1 text-xs font-medium text-neutral-300">{money.format(financials.collected ?? 0)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-neutral-600">Margen</p><p className={`mt-1 text-xs font-medium ${(financials.margin ?? 0) < 0 ? "text-red-300" : "text-emerald-300"}`}>{money.format(financials.margin ?? 0)}</p></div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {assignments.slice(0, 4).map((assignment) => (
                  <span key={assignment.id} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-400">
                    {String(value(assignment, "teamMember.name"))}
                  </span>
                ))}
                {assignments.length === 0 && <span className="text-[11px] text-amber-300">Sin equipo asignado</span>}
                <span className="ml-auto text-[10px] text-neutral-600">{count.tasks ?? 0} tareas · {count.documents ?? 0} archivos</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                <Link href={`/proyectos/${project.id}`} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5">Abrir proyecto</Link>
                <button onClick={() => onOpenModule("horas", project.id)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white">Horas</button>
                {financials && <button onClick={() => onOpenModule("gastos", project.id)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white">Costos</button>}
                <button onClick={() => onOpenModule("soporte", project.id)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white">Soporte</button>
                <button onClick={() => onOpenModule("aprobaciones", project.id)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white">Aprobaciones</button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SmallProjectMetric({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return <div className="rounded-lg bg-neutral-950 p-3"><p className={`text-base font-semibold ${tone === "warning" ? "text-amber-300" : "text-white"}`}>{value}</p><p className="mt-1 text-[9px] uppercase tracking-wide text-neutral-600">{label}</p></div>;
}

function Pipeline({ items, onUpdate, onRemove, onActivity }: { items: Item[]; onUpdate: (id: string, payload: Record<string, unknown>) => void; onRemove: (id: string) => void; onActivity: (id: string) => void }) {
  return (
    <div className="mt-4 grid min-w-[1100px] grid-cols-7 gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageItems = items.filter((item) => item.stage === stage);
        return (
          <div key={stage} className="rounded-xl border border-white/10 bg-neutral-900/60 p-2">
            <div className="flex items-center justify-between px-1 py-2"><p className="text-xs font-semibold text-neutral-300">{stage}</p><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-500">{stageItems.length}</span></div>
            <div className="space-y-2">
              {stageItems.map((item) => (
                <article key={item.id} className="group rounded-lg border border-white/10 bg-neutral-950 p-3">
                  <p className="text-sm font-medium text-white">{String(item.name)}</p>
                  <p className="mt-1 truncate text-xs text-neutral-500">{String(item.company ?? value(item, "client.name") ?? "Sin empresa")}</p>
                  <p className="mt-3 text-sm font-semibold text-neutral-200">{money.format(Number(item.value ?? 0))}</p>
                  <p className="mt-1 text-[11px] text-neutral-600">{Number(item.probability ?? 0)}% · {String(item.nextAction ?? "Sin próxima acción")}</p>
                  <div className="mt-3 flex items-center gap-1">
                    <select value={stage} onChange={(event) => onUpdate(item.id, { stage: event.target.value, probability: event.target.value === "Ganado" ? 100 : item.probability })} className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-900 px-1 py-1 text-[10px] text-neutral-400">{stages.map((entry) => <option key={entry}>{entry}</option>)}</select>
                    {stage !== "Ganado" && stage !== "Perdido" && <button onClick={() => onUpdate(item.id, { action: "convert" })} title="Convertir en proyecto" className="rounded p-1.5 text-neutral-600 hover:bg-emerald-500/10 hover:text-emerald-300"><ChevronRight size={13} /></button>}
                    <button onClick={() => onActivity(item.id)} title="Registrar actividad" className="rounded p-1.5 text-neutral-600 hover:bg-sky-500/10 hover:text-sky-300"><Activity size={13} /></button>
                    <button onClick={() => onRemove(item.id)} className="rounded p-1.5 text-neutral-700 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={12} /></button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModuleList({ module, items, onUpdate, onRemove, onTicketComment }: { module: Module; items: Item[]; onUpdate: (resource: string, id: string, payload: Record<string, unknown>) => void; onRemove: (resource: string, id: string) => void; onTicketComment?: (id: string) => void }) {
  if (!items.length) return <EmptyState label={module.label} />;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
      {items.map((item, index) => (
        <div key={item.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${index ? "border-t border-white/5" : ""}`}>
          <ModuleIdentity resource={module.resource} item={item} />
          <ModuleActions resource={module.resource} item={item} onUpdate={onUpdate} onRemove={onRemove} onTicketComment={onTicketComment} />
        </div>
      ))}
    </div>
  );
}

function PayrollList({ items, onUpdate, onRemove }: { items: Item[]; onUpdate: (resource: string, id: string, payload: Record<string, unknown>) => void; onRemove: (resource: string, id: string) => void }) {
  if (!items.length) return <EmptyState label="Remuneraciones" />;
  return <div className="mt-4 space-y-4">{items.map((period) => {
    const entries = Array.isArray(period.entries) ? period.entries as Array<Item> : [];
    return <section key={period.id} className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900"><div className="flex items-center justify-between gap-3 p-4"><ModuleIdentity resource="payroll" item={period} /><ModuleActions resource="payroll" item={period} onUpdate={onUpdate} onRemove={onRemove} /></div><div className="border-t border-white/10 bg-neutral-950/50">{entries.map((entry, index) => <div key={entry.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${index ? "border-t border-white/5" : ""}`}><div><p className="text-sm font-medium text-neutral-200">{String(value(entry, "teamMember.name"))}</p><p className="mt-1 text-[11px] text-neutral-600">Base {money.format(Number(entry.baseSalary))} · bonos {money.format(Number(entry.bonuses))} · descuentos {money.format(Number(entry.deductions))}</p></div><div className="flex items-center gap-3"><p className="text-sm font-semibold text-neutral-200">{money.format(Number(entry.netPay))}</p><button onClick={() => { const bonuses = prompt("Bonos", String(entry.bonuses ?? 0)); const deductions = prompt("Descuentos", String(entry.deductions ?? 0)); if (bonuses !== null && deductions !== null) void onUpdate("payroll-entries", entry.id, { bonuses: Number(bonuses), deductions: Number(deductions) }); }} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">Ajustar</button></div></div>)}</div></section>;
  })}</div>;
}

function ModuleIdentity({ resource, item }: { resource: string; item: Item }) {
  if (resource === "clients") return <Identity title={String(item.name)} subtitle={String(item.company ?? item.email ?? "Cliente")} meta={`${value(item, "_count.projects") ?? 0} proyectos · ${value(item, "_count.opportunities") ?? 0} oportunidades`} status={String(item.status)} />;
  if (resource === "contacts") return <Identity title={String(item.name)} subtitle={`${String(value(item, "client.name"))} · ${String(item.position ?? "Contacto")}`} meta={`${String(item.email ?? "sin correo")} · ${String(item.phone ?? "sin teléfono")}`} status={item.isPrimary ? "Principal" : undefined} />;
  if (resource === "quotes") return <Identity title={`${String(item.number)} · ${String(item.title)}`} subtitle={String(value(item, "client.name") ?? "")} meta={`${money.format(Number(value(item, "totals.total") ?? 0))} · válida ${item.validUntil ? new Date(String(item.validUntil)).toLocaleDateString("es-CL") : "sin vencimiento"}`} status={String(item.status)} />;
  if (resource === "team") {
    const weekHours = Array.isArray(item.timeEntries) ? item.timeEntries.reduce((sum, entry) => sum + Number((entry as Record<string, unknown>).hours ?? 0), 0) : 0;
    return <Identity title={String(item.name)} subtitle={String(item.role)} meta={`${weekHours}/${item.weeklyCapacity} h esta semana · costo ${money.format(Number(item.hourlyCost ?? 0))}/h`} status={item.active ? "Activo" : "Inactivo"} />;
  }
  if (resource === "time-entries") return <Identity title={String(item.description)} subtitle={`${String(value(item, "project.name"))} · ${String(value(item, "teamMember.name"))}`} meta={`${item.hours} h · ${new Date(String(item.date)).toLocaleDateString("es-CL")} · costo ${money.format(Number(item.hours) * Number(value(item, "teamMember.hourlyCost") ?? 0))}`} status={item.approved ? "Aprobado" : "Pendiente"} />;
  if (resource === "assignments") return <Identity title={`${String(value(item, "teamMember.name"))} → ${String(value(item, "project.name"))}`} subtitle={String(item.role)} meta={`${item.allocation}% de dedicación`} />;
  if (resource === "absences") return <Identity title={String(value(item, "teamMember.name"))} subtitle={String(item.type)} meta={`${new Date(String(item.startDate)).toLocaleDateString("es-CL")} — ${new Date(String(item.endDate)).toLocaleDateString("es-CL")}`} />;
  if (resource === "expenses") return <Identity title={String(item.description)} subtitle={`${String(value(item, "supplier.name") ?? "Sin proveedor")} · ${String(value(item, "project.name") ?? "Gasto general")}`} meta={`${money.format(Number(item.amount))} · ${new Date(String(item.date)).toLocaleDateString("es-CL")}`} status={String(item.status)} />;
  if (resource === "suppliers") return <Identity title={String(item.name)} subtitle={String(item.category)} meta={`${value(item, "_count.expenses") ?? 0} gastos · ${String(item.email ?? "sin correo")}`} />;
  if (resource === "payments") return <Identity title={`${money.format(Number(item.amount))} · ${String(value(item, "invoice.number"))}`} subtitle={String(value(item, "invoice.client"))} meta={`${String(item.method)} · ${new Date(String(item.paidAt)).toLocaleDateString("es-CL")}`} status={String(value(item, "invoice.status"))} />;
  if (resource === "contracts") return <Identity title={String(item.name)} subtitle={`${String(value(item, "client.name"))} · ${String(item.billingCycle)}`} meta={`${money.format(Number(item.monthlyAmount))}/mes · ${item.includedHours} h · SLA ${item.responseHours}/${item.resolutionHours} h`} status={String(item.status)} />;
  if (resource === "tickets") return <Identity title={`${String(item.number)} · ${String(item.subject)}`} subtitle={`${String(value(item, "client.name"))} · ${String(item.category)}`} meta={`Responsable: ${String(item.assignee ?? "Sin asignar")} · vence ${item.resolutionDue ? new Date(String(item.resolutionDue)).toLocaleString("es-CL") : "—"}`} status={String(item.status)} />;
  if (resource === "approvals") return <Identity title={String(item.title)} subtitle={`${String(value(item, "project.name"))} · ${String(item.type)}`} meta={String(item.description ?? "Sin descripción")} status={String(item.status)} />;
  if (resource === "automations") return <Identity title={String(item.name)} subtitle={`${String(item.trigger)} → ${String(item.action)}`} meta={item.lastRunAt ? `Última ejecución ${new Date(String(item.lastRunAt)).toLocaleString("es-CL")}` : "Aún no ejecutada"} status={item.active ? "Activo" : "Inactivo"} />;
  if (resource === "users") return <Identity title={String(item.displayName)} subtitle={String(item.email)} meta={`Creado ${new Date(String(item.createdAt)).toLocaleDateString("es-CL")}`} status={item.active ? String(item.role) : "Inactivo"} />;
  if (resource === "purchase-orders") return <Identity title={`${String(item.number)} · ${String(value(item, "supplier.name"))}`} subtitle={String(value(item, "project.name") ?? "Compra general")} meta={`${money.format(Number(item.total ?? 0))} · ${Array.isArray(item.items) ? item.items.length : 0} ítems`} status={String(item.status)} />;
  if (resource === "assets") return <Identity title={String(item.name)} subtitle={`${String(item.type)} · ${String(item.category)}`} meta={`${String(value(item, "assignedTo.name") ?? item.location ?? "Sin asignar")} · ${item.renewalDate ? `renueva ${new Date(String(item.renewalDate)).toLocaleDateString("es-CL")}` : "sin renovación"}`} status={String(item.status)} />;
  if (resource === "payroll") {
    const entries = Array.isArray(item.entries) ? item.entries as Array<Record<string, unknown>> : [];
    const total = entries.reduce((sum, entry) => sum + Number(entry.netPay ?? 0), 0);
    return <Identity title={String(item.name)} subtitle={`${new Date(String(item.startDate)).toLocaleDateString("es-CL")} — ${new Date(String(item.endDate)).toLocaleDateString("es-CL")}`} meta={`${entries.length} personas · líquido ${money.format(total)}`} status={String(item.status)} />;
  }
  if (resource === "accounts") return <Identity title={`${String(item.code)} · ${String(item.name)}`} subtitle={String(item.type)} status={item.active ? "Activo" : "Inactivo"} />;
  if (resource === "journal") return <Identity title={`${String(item.number)} · ${String(item.description)}`} subtitle={`${new Date(String(item.date)).toLocaleDateString("es-CL")} · ${String(item.reference ?? "sin referencia")}`} meta={`Debe ${money.format(Number(item.debit ?? 0))} · Haber ${money.format(Number(item.credit ?? 0))}`} status={String(item.status)} />;
  if (resource === "trash") return <Identity title={String(item.displayName ?? item.originalId)} subtitle={String(item.entityType)} meta={`Eliminado ${new Date(String(item.deletedAt)).toLocaleString("es-CL")}`} />;
  if (resource === "audit") return <Identity title={`${String(item.action)} · ${String(item.entityType)}`} subtitle={String(item.summary ?? item.entityId)} meta={new Date(String(item.createdAt)).toLocaleString("es-CL")} />;
  return <Identity title={String(item.name ?? item.title ?? item.id)} />;
}

function Identity({ title, subtitle, meta, status }: { title: string; subtitle?: string; meta?: string; status?: string }) {
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-white">{title}</p>{status && <Status>{status}</Status>}</div>{subtitle && <p className="mt-1 text-xs text-neutral-400">{subtitle}</p>}{meta && <p className="mt-1 truncate text-[11px] text-neutral-600">{meta}</p>}</div>;
}

function ModuleActions({ resource, item, onUpdate, onRemove, onTicketComment }: { resource: string; item: Item; onUpdate: (resource: string, id: string, payload: Record<string, unknown>) => void; onRemove: (resource: string, id: string) => void; onTicketComment?: (id: string) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {resource === "quotes" && <>
        <select value={String(item.status)} onChange={(event) => onUpdate(resource, item.id, { status: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option>Borrador</option><option>Enviada</option><option>Aprobada</option><option>Rechazada</option><option>Vencida</option></select>
        {!item.projectId && <button onClick={() => onUpdate(resource, item.id, { action: "convert" })} className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300">Crear proyecto</button>}
        <a href={`/cotizaciones/${item.id}`} target="_blank" className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">Ver propuesta</a>
      </>}
      {resource === "time-entries" && <button onClick={() => onUpdate(resource, item.id, { approved: !item.approved })} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">{item.approved ? "Desaprobar" : "Aprobar"}</button>}
      {resource === "tickets" && <select value={String(item.status)} onChange={(event) => onUpdate(resource, item.id, { status: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option>Abierto</option><option>En progreso</option><option>Esperando cliente</option><option>Resuelto</option><option>Cerrado</option></select>}
      {resource === "tickets" && onTicketComment && <button onClick={() => onTicketComment(item.id)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">Responder</button>}
      {resource === "approvals" && <select value={String(item.status)} onChange={(event) => onUpdate(resource, item.id, { status: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option>Pendiente</option><option>Aprobado</option><option>Cambios solicitados</option><option>Rechazado</option></select>}
      {resource === "contracts" && <button onClick={() => onUpdate(resource, item.id, { status: item.status === "Activo" ? "Pausado" : "Activo" })} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">{item.status === "Activo" ? "Pausar" : "Activar"}</button>}
      {resource === "automations" && <button onClick={() => onUpdate(resource, item.id, { active: !item.active })} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">{item.active ? "Desactivar" : "Activar"}</button>}
      {resource === "users" && <><select value={String(item.role)} onChange={(event) => onUpdate(resource, item.id, { role: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option value="ADMIN">Administrador</option><option value="MANAGER">Gestión</option><option value="FINANCE">Finanzas</option><option value="MEMBER">Miembro</option></select><button onClick={() => onUpdate(resource, item.id, { active: !item.active })} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">{item.active ? "Desactivar" : "Activar"}</button></>}
      {resource === "purchase-orders" && <select value={String(item.status)} onChange={(event) => onUpdate(resource, item.id, { status: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option>Borrador</option><option>Solicitada</option><option>Aprobada</option><option>Recibida</option><option>Cancelada</option></select>}
      {resource === "assets" && <select value={String(item.status)} onChange={(event) => onUpdate(resource, item.id, { status: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option>Disponible</option><option>Asignado</option><option>En reparación</option><option>Retirado</option></select>}
      {resource === "payroll" && <select value={String(item.status)} onChange={(event) => onUpdate(resource, item.id, { status: event.target.value })} className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-400"><option>Borrador</option><option>En revisión</option><option>Aprobada</option><option>Pagada</option></select>}
      {resource === "accounts" && <button onClick={() => onUpdate(resource, item.id, { active: !item.active })} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">{item.active ? "Desactivar" : "Activar"}</button>}
      {resource === "journal" && item.status !== "Contabilizado" && <button onClick={() => onUpdate(resource, item.id, { status: "Contabilizado" })} className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300">Contabilizar</button>}
      {resource === "trash" && <button onClick={() => onUpdate(resource, item.id, { action: "restore" })} className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300">Restaurar</button>}
      {!["audit", "trash", "users"].includes(resource) && <button onClick={() => onRemove(resource, item.id)} className="rounded-md p-2 text-neutral-600 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={14} /></button>}
    </div>
  );
}

function PortalList({ items, generated, onGenerate, onManage }: { items: Item[]; generated: string; onGenerate: (clientId: string) => void; onManage: (id: string, action: "rotate" | "revoke" | "restore") => void }) {
  async function copyPath(path: string) {
    await navigator.clipboard?.writeText(`${window.location.origin}${path}`);
  }
  return (
    <div className="mt-4 space-y-3">
      {generated && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200"><p className="font-semibold">Acceso listo y copiado</p><p className="mt-1 break-all text-xs">{generated}</p><p className="mt-2 text-[11px] text-emerald-300/70">El enlace queda guardado aquí para volver a copiarlo o previsualizarlo.</p></div>}
      <div className="space-y-3">
        {items.map((client) => {
          const portals = Array.isArray(client.portals) ? client.portals as Array<Item> : [];
          return (
            <article key={client.id} className="rounded-xl border border-white/10 bg-neutral-900 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Identity
                  title={String(client.company ?? client.name)}
                  subtitle={String(client.name)}
                  meta={`${value(client, "_count.projects") ?? 0} proyectos · ${value(client, "_count.quotes") ?? 0} cotizaciones · ${value(client, "_count.tickets") ?? 0} tickets`}
                />
                {portals.length === 0 && <button onClick={() => onGenerate(client.id)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950">Crear portal</button>}
              </div>
              {portals.length > 0 && <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                {portals.map((portal) => {
                  const revoked = Boolean(portal.revokedAt);
                  const expired = portal.expiresAt ? new Date(String(portal.expiresAt)) < new Date() : false;
                  const active = !revoked && !expired;
                  const path = typeof portal.portalPath === "string" ? portal.portalPath : null;
                  return (
                    <div key={portal.id} className="rounded-lg border border-white/5 bg-neutral-950 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-neutral-200">{String(portal.label)}</p><Status>{active ? "Activo" : revoked ? "Revocado" : "Vencido"}</Status></div>
                          <p className="mt-1 text-[11px] text-neutral-600">
                            {portal.lastUsedAt ? `Último acceso ${new Date(String(portal.lastUsedAt)).toLocaleString("es-CL")}` : "Aún no utilizado"}
                            {portal.expiresAt ? ` · vence ${new Date(String(portal.expiresAt)).toLocaleDateString("es-CL")}` : " · sin vencimiento"}
                          </p>
                          {!path && <p className="mt-1 text-[11px] text-amber-300">Enlace antiguo: regenéralo una vez para poder consultarlo siempre.</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {path && active && <a href={path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300">Ver como cliente <ArrowUpRight size={12} /></a>}
                          {path && active && <button onClick={() => void copyPath(path)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">Copiar</button>}
                          <button onClick={() => onManage(portal.id, "rotate")} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-400">{path ? "Regenerar" : "Recuperar enlace"}</button>
                          {active ? <button onClick={() => onManage(portal.id, "revoke")} className="rounded-md border border-red-500/20 px-2.5 py-1.5 text-xs text-red-300">Revocar</button> : <button onClick={() => onManage(portal.id, "restore")} className="rounded-md border border-emerald-500/20 px-2.5 py-1.5 text-xs text-emerald-300">Reactivar</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => onGenerate(client.id)} className="text-xs text-neutral-500 hover:text-white">+ Crear otro acceso</button>
              </div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-neutral-900/40 text-center"><Plus size={20} className="text-neutral-700" /><p className="mt-3 text-sm text-neutral-400">No hay registros en {label.toLowerCase()}.</p><p className="mt-1 text-xs text-neutral-600">Crea el primero para comenzar.</p></div>;
}

function LoadingRows() {
  return <div className="mt-4 space-y-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl border border-white/5 bg-neutral-900" />)}</div>;
}
