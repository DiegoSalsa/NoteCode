const numberEs = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const decimalEs = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const percentEs = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 2 });

export function formatInt(value: number | null | undefined) {
  return numberEs.format(Math.round(value ?? 0));
}

export function formatDecimal(value: number | null | undefined) {
  return decimalEs.format(value ?? 0);
}

export function formatPercent(value: number | null | undefined) {
  return percentEs.format(value ?? 0);
}

export function formatDelta(value: number | null | undefined, inverted = false) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${decimalEs.format(value)}%`;
}

export function deltaClass(value: number | null | undefined, inverted = false) {
  if (value == null || Math.abs(value) < 0.05) return "text-neutral-500";
  const positive = inverted ? value < 0 : value > 0;
  return positive ? "text-emerald-300" : "text-red-300";
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Nunca";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function integrationLabel(status: string | null | undefined) {
  switch (status) {
    case "connected": return "Conectado";
    case "expired": return "Expirado";
    case "revoked": return "Revocado";
    case "error": return "Error";
    case "disconnected": return "Desconectado";
    default: return status || "Sin conectar";
  }
}
