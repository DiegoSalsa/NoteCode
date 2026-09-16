import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata",
  "instance-data",
]);

export type LookupFn = (hostname: string) => Promise<string[]>;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] ?? 0) << 24) + ((parts[1] ?? 0) << 16) + ((parts[2] ?? 0) << 8) + (parts[3] ?? 0);
}

function inCidr(ip: string, cidr: string) {
  const [base, bitsRaw] = cidr.split("/");
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base || "");
  const bits = Number(bitsRaw);
  if (ipInt == null || baseInt == null || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipInt >>> 0) & mask) === ((baseInt >>> 0) & mask);
}

const IPV4_BLOCK = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

export function isBlockedIPv4(ip: string) {
  return IPV4_BLOCK.some((cidr) => inCidr(ip, cidr));
}

export function isBlockedIPv6(ip: string) {
  const value = ip.toLowerCase().trim();
  if (value === "::1" || value === "::" || value === "0:0:0:0:0:0:0:1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("fe80")) return true;
  if (value.startsWith("ff")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIPv4(mapped[1]);
  return false;
}

export function isBlockedIp(ip: string) {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true;
}

export function isBlockedHostname(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.includes("metadata.google")) return true;
  if (isIP(host)) return isBlockedIp(host);
  return false;
}

export function parseHttpUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UnsafeUrlError("URL inválida.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("Solo se permiten HTTP y HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError("No se permiten credenciales embebidas en la URL.");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new UnsafeUrlError("El hostname no está permitido.");
  }
  return parsed;
}

export async function defaultLookup(hostname: string) {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function assertSafeHttpUrl(value: string, lookup: LookupFn = defaultLookup) {
  const parsed = parseHttpUrl(value);
  if (isIP(parsed.hostname)) {
    if (isBlockedIp(parsed.hostname)) throw new UnsafeUrlError("La IP de destino no está permitida.");
    return parsed;
  }
  const addresses = await lookup(parsed.hostname);
  if (!addresses.length) throw new UnsafeUrlError("No se pudo resolver el hostname.");
  for (const address of addresses) {
    if (isBlockedIp(address)) throw new UnsafeUrlError("El hostname resuelve a una IP privada o reservada.");
  }
  return parsed;
}

export function hostAllowedForProject(url: URL, allowedHost: string) {
  const got = url.hostname.replace(/^www\./i, "").toLowerCase();
  const allowed = allowedHost.replace(/^www\./i, "").toLowerCase();
  return got === allowed;
}
