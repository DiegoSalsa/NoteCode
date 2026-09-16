import { healthScore } from "@/lib/seo/health";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type AuditPage = {
  url: string;
  normalizedUrl: string;
  statusCode: number | null;
  depth: number;
  indexable: boolean;
  indexableReasons: string[];
  canonical: string | null;
  title: string | null;
  description: string | null;
  h1: string | null;
  h1Count: number;
  discoveredFrom: string | null;
  internalIn: number;
  error: string | null;
  structuredTypes: string[];
  ogTitle: string | null;
  twitterCard: string | null;
  contentHash: string | null;
  canonicalBroken?: boolean;
};

export type AuditFinding = {
  ruleKey: string;
  severity: Severity;
  category: string;
  url: string;
  normalizedUrl: string;
  message: string;
};

export type AuditRule = {
  key: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  recommendation: string;
};

export const AUDIT_RULES: AuditRule[] = [
  { key: "HTTP_5XX", title: "Error de servidor", description: "La URL responde 5xx.", category: "http", severity: "HIGH", recommendation: "Revisar logs y disponibilidad del servidor." },
  { key: "HOME_5XX", title: "Home 5xx", description: "La home responde 5xx.", category: "http", severity: "CRITICAL", recommendation: "Priorizar la recuperación de la home." },
  { key: "HTTP_404", title: "404", description: "La URL responde 404.", category: "http", severity: "HIGH", recommendation: "Corregir enlaces internos o redirigir." },
  { key: "TITLE_MISSING", title: "Title ausente", description: "La página no tiene title.", category: "metadata", severity: "MEDIUM", recommendation: "Añadir un title descriptivo (buena práctica ~50–60 caracteres)." },
  { key: "TITLE_DUPLICATE", title: "Title duplicado", description: "Varias URLs indexables comparten el mismo title.", category: "metadata", severity: "MEDIUM", recommendation: "Diferenciar titles." },
  { key: "META_DESCRIPTION_MISSING", title: "Description ausente", description: "No hay meta description.", category: "metadata", severity: "LOW", recommendation: "Añadir description única." },
  { key: "META_DESCRIPTION_DUPLICATE", title: "Description duplicada", description: "Varias URLs indexables comparten description.", category: "metadata", severity: "LOW", recommendation: "Diferenciar descriptions." },
  { key: "H1_MISSING", title: "H1 ausente", description: "La página no tiene H1.", category: "headings", severity: "MEDIUM", recommendation: "Incluir un H1 que describa el contenido." },
  { key: "H1_MULTIPLE", title: "Múltiples H1", description: "Hay más de un H1.", category: "headings", severity: "LOW", recommendation: "Revisar jerarquía; no siempre es un error." },
  { key: "NOINDEX", title: "noindex", description: "La URL está marcada noindex.", category: "indexability", severity: "INFO", recommendation: "Confirmar si el noindex es intencional." },
  { key: "CANONICAL_BROKEN", title: "Canonical inválido", description: "Canonical vacío, múltiple o fuera de contexto.", category: "canonical", severity: "HIGH", recommendation: "Usar un canonical absoluto y alcanzable." },
  { key: "INTERNAL_LINK_BROKEN", title: "Enlace interno roto", description: "Un enlace interno apunta a 4xx/5xx.", category: "links", severity: "HIGH", recommendation: "Actualizar o eliminar el enlace." },
  { key: "SITEMAP_URL_404", title: "URL de sitemap en 404", description: "El sitemap lista una URL que responde 404.", category: "sitemap", severity: "MEDIUM", recommendation: "Limpiar el sitemap." },
  { key: "SITEMAP_FAILED", title: "Sitemap inaccesible", description: "No se pudo leer el sitemap.", category: "sitemap", severity: "HIGH", recommendation: "Publicar un sitemap válido." },
  { key: "ROBOTS_MISSING", title: "robots.txt ausente", description: "No hay robots.txt.", category: "indexability", severity: "INFO", recommendation: "Publicar robots.txt si corresponde." },
  { key: "OG_MISSING", title: "Open Graph incompleto", description: "Falta og:title o twitter:card.", category: "social", severity: "INFO", recommendation: "Completar metadatos sociales." },
  { key: "POSSIBLE_ORPHAN", title: "Posible página huérfana", description: "Aparece en sitemap y es indexable, sin enlaces internos entrantes.", category: "links", severity: "LOW", recommendation: "Enlazar desde el sitio si debe posicionar." },
  { key: "POSSIBLE_DUPLICATE_CONTENT", title: "Posible contenido duplicado", description: "Hash de texto coincidente entre URLs indexables.", category: "metadata", severity: "LOW", recommendation: "Revisar canonical o consolidar contenido. Señal aproximada, no certeza." },
];

export const AUDIT_RULE_MAP = Object.fromEntries(AUDIT_RULES.map((rule) => [rule.key, rule]));

export function evaluatePages(pages: AuditPage[], extras?: { sitemapFailed?: boolean; robotsMissing?: boolean; brokenInternal?: Array<{ from: string; to: string }> }): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const indexable = pages.filter((page) => page.indexable && (page.statusCode ?? 0) < 400);
  const titles = new Map<string, AuditPage[]>();
  const descriptions = new Map<string, AuditPage[]>();
  const hashes = new Map<string, AuditPage[]>();

  for (const page of pages) {
    const code = page.statusCode ?? 0;
    if (code >= 500) {
      findings.push(finding(page.depth === 0 ? "HOME_5XX" : "HTTP_5XX", page, `HTTP ${code}`));
    } else if (code === 404) {
      findings.push(finding("HTTP_404", page, "HTTP 404"));
    }
    if (page.indexable && (code === 200 || code === 0)) {
      if (!page.title) findings.push(finding("TITLE_MISSING", page, "Sin title"));
      if (!page.description) findings.push(finding("META_DESCRIPTION_MISSING", page, "Sin meta description"));
      if (!page.h1) findings.push(finding("H1_MISSING", page, "Sin H1"));
      if (page.h1Count > 1) findings.push(finding("H1_MULTIPLE", page, `${page.h1Count} H1`));
      if (!page.ogTitle || !page.twitterCard) findings.push(finding("OG_MISSING", page, "Open Graph / Twitter incompleto"));
      if (page.title) titles.set(page.title, [...(titles.get(page.title) ?? []), page]);
      if (page.description) descriptions.set(page.description, [...(descriptions.get(page.description) ?? []), page]);
      if (page.contentHash) hashes.set(page.contentHash, [...(hashes.get(page.contentHash) ?? []), page]);
    }
    if (page.indexableReasons.includes("noindex")) findings.push(finding("NOINDEX", page, page.indexableReasons.join(", ")));
    if (page.canonicalBroken) findings.push(finding("CANONICAL_BROKEN", page, "Canonical inválido"));
    if (page.discoveredFrom === "sitemap" && page.indexable && page.internalIn === 0 && (page.statusCode ?? 0) < 400) {
      findings.push(finding("POSSIBLE_ORPHAN", page, "En sitemap, sin enlaces internos detectados"));
    }
  }

  for (const [title, group] of titles) {
    if (group.length > 1 && title) group.forEach((page) => findings.push(finding("TITLE_DUPLICATE", page, `Title repetido (${group.length})`)));
  }
  for (const [description, group] of descriptions) {
    if (group.length > 1 && description) group.forEach((page) => findings.push(finding("META_DESCRIPTION_DUPLICATE", page, `Description repetida (${group.length})`)));
  }
  for (const group of hashes.values()) {
    if (group.length > 1) group.forEach((page) => findings.push(finding("POSSIBLE_DUPLICATE_CONTENT", page, "Texto normalizado coincidente")));
  }
  if (extras?.sitemapFailed) {
    findings.push({ ruleKey: "SITEMAP_FAILED", severity: "HIGH", category: "sitemap", url: "/", normalizedUrl: "/", message: "Sitemap inaccesible" });
  }
  if (extras?.robotsMissing) {
    findings.push({ ruleKey: "ROBOTS_MISSING", severity: "INFO", category: "indexability", url: "/robots.txt", normalizedUrl: "/robots.txt", message: "robots.txt ausente" });
  }
  for (const link of extras?.brokenInternal ?? []) {
    findings.push({
      ruleKey: "INTERNAL_LINK_BROKEN",
      severity: "HIGH",
      category: "links",
      url: link.from,
      normalizedUrl: link.from,
      message: `Enlace interno hacia ${link.to}`,
    });
  }
  return findings;
}

function finding(ruleKey: string, page: AuditPage, message: string): AuditFinding {
  const rule = AUDIT_RULE_MAP[ruleKey];
  return {
    ruleKey,
    severity: rule?.severity ?? "INFO",
    category: rule?.category ?? "http",
    url: page.url,
    normalizedUrl: page.normalizedUrl,
    message,
  };
}

export function identityKey(ruleKey: string, normalizedUrl: string) {
  return `${ruleKey}|${normalizedUrl}`;
}

export function summarizeFindings(findings: AuditFinding[], indexablePages: number) {
  const grouped = findings.map((item) => ({ ruleKey: item.ruleKey, severity: item.severity, count: 1 }));
  return healthScore(grouped, indexablePages);
}
