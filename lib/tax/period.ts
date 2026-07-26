import { fromZonedTime } from "date-fns-tz";
import { isValidTaxPeriod } from "@/lib/tax/f29";

export const CHILE_TIME_ZONE = "America/Santiago";

function nextPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function taxPeriodRange(period: string) {
  if (!isValidTaxPeriod(period)) throw new Error("Periodo tributario invalido.");
  return {
    start: fromZonedTime(`${period}-01T00:00:00`, CHILE_TIME_ZONE),
    end: fromZonedTime(`${nextPeriod(period)}-01T00:00:00`, CHILE_TIME_ZONE),
  };
}

export function previousTaxPeriod(period: string) {
  if (!isValidTaxPeriod(period)) throw new Error("Periodo tributario invalido.");
  const [year, month] = period.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function f29DueDate(period: string, day = 20) {
  if (!isValidTaxPeriod(period)) throw new Error("Periodo tributario invalido.");
  const [year, month] = period.split("-").map(Number);
  const dueMonth = new Date(Date.UTC(year, month, 1));
  const duePeriod = `${dueMonth.getUTCFullYear()}-${String(dueMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  return fromZonedTime(`${duePeriod}-${String(Math.min(28, Math.max(1, day))).padStart(2, "0")}T23:59:59`, CHILE_TIME_ZONE);
}

export function f29DueDateChile(period: string, day = 20) {
  if (!isValidTaxPeriod(period)) throw new Error("Periodo tributario invalido.");
  const [year, month] = period.split("-").map(Number);
  const dueMonth = new Date(Date.UTC(year, month, 1));
  return `${dueMonth.getUTCFullYear()}-${String(dueMonth.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(28, Math.max(1, day))).padStart(2, "0")}`;
}
