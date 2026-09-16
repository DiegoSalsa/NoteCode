import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { fetchSafeHtml } from "@/lib/seo/crawl-http";
import { isSkippableHref, normalizeCrawlUrl, sameSiteHost } from "@/lib/seo/crawl-url";
import { extractHtml } from "@/lib/seo/html-extract";
import { isDisallowed, parseRobots } from "@/lib/seo/robots";
import { parseSitemapXml } from "@/lib/seo/sitemap";
import { UnsafeUrlError, assertSafeHttpUrl } from "@/lib/seo/ssrf";
import { mapPool } from "@/lib/seo/pool";

type Checkpoint = { queue: Array<{ url: string; depth: number; from: string }>; seen: string[]; robotsDone: boolean; sitemapsDone: boolean };

function envInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function crawlDefaults() {
  return {
    maxPages: envInt("SEO_CRAWL_MAX_PAGES_DEFAULT", 500),
    concurrency: envInt("SEO_CRAWL_CONCURRENCY_DEFAULT", 5),
    timeoutMs: envInt("SEO_CRAWL_TIMEOUT_MS", 10_000),
    maxBytes: envInt("SEO_CRAWL_MAX_RESPONSE_BYTES", 1_500_000),
    delayMs: Number(process.env.SEO_CRAWL_REQUEST_DELAY_MS || "50") || 50,
    userAgent: process.env.SEO_CRAWL_USER_AGENT || "NoteCodeSEO/1.0 (+PuroCode)",
    batchPages: envInt("SEO_CRAWL_BATCH_PAGES", 20),
    maxMs: envInt("SEO_CRAWL_MAX_MS", 18_000),
  };
}

export async function startProjectCrawl(seoProjectId: string, trigger: "manual" | "cron") {
  const project = await prisma.seoProject.findUnique({ where: { id: seoProjectId } });
  if (!project) throw new Error("Proyecto SEO no encontrado.");
  if (!project.crawlEnabled) throw new Error("El crawl está deshabilitado para este proyecto.");
  const base = project.crawlBaseUrl || (project.primaryDomain ? `https://${project.primaryDomain}` : "");
  if (!base) throw new Error("Configura crawlBaseUrl o primaryDomain.");
  const parsed = await assertSafeHttpUrl(base);
  const allowedHost = parsed.hostname.replace(/^www\./i, "");
  const seed = normalizeCrawlUrl(parsed.toString());

  const active = await prisma.seoCrawl.findFirst({ where: { seoProjectId, status: { in: ["queued", "running"] } } });
  if (active) return active;

  const defaults = crawlDefaults();
  return prisma.seoCrawl.create({
    data: {
      seoProjectId,
      trigger,
      status: "queued",
      startedAt: new Date(),
      config: {
        base: seed,
        allowedHost,
        maxPages: project.crawlMaxPages || defaults.maxPages,
        maxDepth: project.crawlMaxDepth || 10,
        concurrency: project.crawlConcurrency || defaults.concurrency,
        respectRobots: project.crawlRespectRobots,
        userAgent: defaults.userAgent,
      },
      checkpoint: { queue: [{ url: seed, depth: 0, from: "seed" }], seen: [seed], robotsDone: false, sitemapsDone: false },
    },
  });
}

export async function processCrawlBatch(crawlId: string) {
  const crawl = await prisma.seoCrawl.findUnique({ where: { id: crawlId } });
  if (!crawl || ["completed", "failed", "cancelled"].includes(crawl.status)) return crawl;
  const config = crawl.config as {
    base: string;
    allowedHost: string;
    maxPages: number;
    maxDepth: number;
    concurrency: number;
    respectRobots: boolean;
    userAgent: string;
  };
  const checkpoint = crawl.checkpoint as Checkpoint;
  const defaults = crawlDefaults();
  const started = Date.now();

  await prisma.seoCrawl.update({ where: { id: crawlId }, data: { status: "running", startedAt: crawl.startedAt ?? new Date() } });

  if (!checkpoint.robotsDone) {
    try {
      const robotsUrl = new URL("/robots.txt", config.base).toString();
      const robots = await fetchSafeHtml({ url: robotsUrl, allowedHost: config.allowedHost, timeoutMs: defaults.timeoutMs, maxBytes: 200_000, userAgent: config.userAgent });
      const parsed = parseRobots(robots.body, "notecodeseo");
      checkpoint.robotsDone = true;
      for (const sitemap of parsed.sitemaps) {
        if (sameSiteHost(sitemap, config.allowedHost)) checkpoint.queue.push({ url: normalizeCrawlUrl(sitemap), depth: 0, from: "robots" });
      }
      await prisma.seoCrawl.update({
        where: { id: crawlId },
        data: { robotsStatus: robots.status === 200 ? "found" : "absent", checkpoint },
      });
      (crawl as { robotsParsed?: ReturnType<typeof parseRobots> }).robotsParsed = parsed;
    } catch {
      checkpoint.robotsDone = true;
      await prisma.seoCrawl.update({ where: { id: crawlId }, data: { robotsStatus: "error", checkpoint } });
    }
  }

  if (!checkpoint.sitemapsDone) {
    const sitemapUrl = new URL("/sitemap.xml", config.base).toString();
    await ingestSitemap(crawlId, sitemapUrl, config.allowedHost, checkpoint, defaults, config.userAgent);
    checkpoint.sitemapsDone = true;
  }

  const batch = checkpoint.queue.splice(0, defaults.batchPages);
  await mapPool(batch, Math.min(config.concurrency, defaults.concurrency), async (item) => {
    if (checkpoint.seen.filter((url) => !url.endsWith(".xml")).length >= config.maxPages && item.from !== "seed") return;
    if (item.depth > config.maxDepth) return;
    await new Promise((resolve) => setTimeout(resolve, defaults.delayMs));
    try {
      const page = await fetchSafeHtml({
        url: item.url,
        allowedHost: config.allowedHost,
        timeoutMs: defaults.timeoutMs,
        maxBytes: defaults.maxBytes,
        userAgent: config.userAgent,
      });
      const html = /html|xml/i.test(page.contentType) || page.body.includes("<html") || page.body.includes("<urlset") || page.body.includes("<sitemapindex");
      const extracted = html && page.body ? extractHtml(page.body) : null;
      const reasons: string[] = [];
      const robotsMeta = extracted?.robots?.toLowerCase() || "";
      const xrobots = "";
      if (robotsMeta.includes("noindex")) reasons.push("noindex");
      if (page.status >= 400) reasons.push(`http_${page.status}`);
      if (extracted && extracted.canonicalCount > 1) reasons.push("canonical_broken");
      const hash = extracted?.textHashSource ? createHash("sha256").update(extracted.textHashSource).digest("hex") : null;
      const record = await prisma.seoCrawlPage.upsert({
        where: { crawlId_normalizedUrl: { crawlId, normalizedUrl: normalizeCrawlUrl(item.url) } },
        update: {},
        create: {
          crawlId,
          url: item.url,
          normalizedUrl: normalizeCrawlUrl(item.url),
          finalUrl: page.finalUrl,
          statusCode: page.status,
          contentType: page.contentType,
          responseTimeMs: page.ms,
          sizeBytes: page.bytes,
          depth: item.depth,
          discoveredFrom: item.from,
          indexable: reasons.length === 0 && page.status < 400,
          indexableReasons: reasons,
          robotsIndex: !robotsMeta.includes("noindex"),
          robotsFollow: !robotsMeta.includes("nofollow"),
          canonical: extracted?.canonical || null,
          title: extracted?.title || null,
          description: extracted?.description || null,
          h1: extracted?.h1s[0] || null,
          h1Count: extracted?.h1s.length || 0,
          wordCount: extracted?.wordCount || 0,
          structuredTypes: extracted?.jsonLdTypes || [],
          ogTitle: extracted?.ogTitle || null,
          ogImage: extracted?.ogImage || null,
          twitterCard: extracted?.twitterCard || null,
          redirectChain: page.redirectChain,
          contentHash: hash,
        },
      });
      if (extracted) {
        let internal = 0;
        let external = 0;
        for (const href of extracted.links) {
          if (isSkippableHref(href)) continue;
          let absolute: string;
          try { absolute = normalizeCrawlUrl(href, page.finalUrl); } catch { continue; }
          const internalLink = sameSiteHost(absolute, config.allowedHost);
          if (internalLink) {
            internal += 1;
            await prisma.seoCrawlLink.create({
              data: { crawlId, fromPageId: record.id, fromUrl: item.url, toUrl: absolute, toNormalizedUrl: absolute, internal: true },
            });
            if (!checkpoint.seen.includes(absolute) && item.depth + 1 <= config.maxDepth) {
              checkpoint.seen.push(absolute);
              checkpoint.queue.push({ url: absolute, depth: item.depth + 1, from: "link" });
            }
          } else {
            external += 1;
          }
        }
        await prisma.seoCrawlPage.update({ where: { id: record.id }, data: { internalOut: internal, externalOut: external } });
        void xrobots;
      }
    } catch (error) {
      await prisma.seoCrawlPage.upsert({
        where: { crawlId_normalizedUrl: { crawlId, normalizedUrl: normalizeCrawlUrl(item.url) } },
        update: { error: error instanceof Error ? error.message : "error" },
        create: {
          crawlId,
          url: item.url,
          normalizedUrl: normalizeCrawlUrl(item.url),
          depth: item.depth,
          discoveredFrom: item.from,
          error: error instanceof UnsafeUrlError ? error.message : error instanceof Error ? error.message : "error",
          indexable: false,
          indexableReasons: ["fetch_error"],
        },
      });
    }
  });

  const counts = await prisma.seoCrawlPage.aggregate({
    where: { crawlId },
    _count: { _all: true },
  });
  const failed = await prisma.seoCrawlPage.count({ where: { crawlId, OR: [{ error: { not: null } }, { statusCode: { gte: 400 } }] } });
  const done = checkpoint.queue.length === 0 || counts._count._all >= config.maxPages;
  await prisma.seoCrawl.update({
    where: { id: crawlId },
    data: {
      checkpoint,
      pagesQueued: checkpoint.queue.length + counts._count._all,
      pagesCrawled: counts._count._all,
      pagesSucceeded: counts._count._all - failed,
      pagesFailed: failed,
      status: done ? "completed" : Date.now() - started > defaults.maxMs ? "running" : "running",
      durationMs: Date.now() - (crawl.startedAt?.getTime() ?? started),
    },
  });
  logEvent("info", "seo.crawl.batch", { crawlId, crawled: counts._count._all, queued: checkpoint.queue.length, done });
  if (done) return finalizeCrawl(crawlId);
  if (Date.now() - started < defaults.maxMs && checkpoint.queue.length) return processCrawlBatch(crawlId);
  return prisma.seoCrawl.findUnique({ where: { id: crawlId } });
}

async function ingestSitemap(
  crawlId: string,
  url: string,
  allowedHost: string,
  checkpoint: Checkpoint,
  defaults: ReturnType<typeof crawlDefaults>,
  userAgent: string,
  depth = 0,
) {
  if (depth > 3) return;
  try {
    const response = await fetchSafeHtml({ url, allowedHost, timeoutMs: defaults.timeoutMs, maxBytes: defaults.maxBytes, userAgent });
    if (response.status >= 400) {
      await prisma.seoCrawlSitemap.create({ data: { crawlId, url, status: "error", kind: "sitemap", error: `HTTP ${response.status}` } });
      return;
    }
    const parsed = parseSitemapXml(response.body);
    await prisma.seoCrawlSitemap.create({ data: { crawlId, url, status: "ok", kind: parsed.kind, urlCount: parsed.urls.length } });
    for (const entry of parsed.urls) {
      if (!sameSiteHost(entry.url, allowedHost)) continue;
      const normalized = normalizeCrawlUrl(entry.url);
      if (parsed.kind === "index") {
        await ingestSitemap(crawlId, normalized, allowedHost, checkpoint, defaults, userAgent, depth + 1);
      } else if (!checkpoint.seen.includes(normalized)) {
        checkpoint.seen.push(normalized);
        checkpoint.queue.push({ url: normalized, depth: 0, from: "sitemap" });
      }
    }
  } catch (error) {
    await prisma.seoCrawlSitemap.create({
      data: { crawlId, url, status: "error", kind: "sitemap", error: error instanceof Error ? error.message : "error" },
    });
  }
}

export async function finalizeCrawl(crawlId: string) {
  const { evaluatePages, identityKey, summarizeFindings } = await import("@/lib/seo/audit-rules");
  const crawl = await prisma.seoCrawl.findUnique({ where: { id: crawlId }, include: { pages: true, sitemaps: true, links: true } });
  if (!crawl) return null;

  const incoming = new Map<string, number>();
  for (const link of crawl.links) {
    if (!link.internal) continue;
    incoming.set(link.toNormalizedUrl, (incoming.get(link.toNormalizedUrl) ?? 0) + 1);
  }
  await Promise.all(crawl.pages.map((page) => prisma.seoCrawlPage.update({ where: { id: page.id }, data: { internalIn: incoming.get(page.normalizedUrl) ?? 0 } })));

  const pages = crawl.pages.map((page) => ({
    url: page.url,
    normalizedUrl: page.normalizedUrl,
    statusCode: page.statusCode,
    depth: page.depth,
    indexable: page.indexable,
    indexableReasons: page.indexableReasons,
    canonical: page.canonical,
    title: page.title,
    description: page.description,
    h1: page.h1,
    h1Count: page.h1Count,
    discoveredFrom: page.discoveredFrom,
    internalIn: incoming.get(page.normalizedUrl) ?? 0,
    error: page.error,
    structuredTypes: page.structuredTypes,
    ogTitle: page.ogTitle,
    twitterCard: page.twitterCard,
    contentHash: page.contentHash,
    canonicalBroken: page.indexableReasons.includes("canonical_broken"),
  }));

  const brokenInternal: Array<{ from: string; to: string }> = [];
  const byUrl = new Map(crawl.pages.map((page) => [page.normalizedUrl, page]));
  for (const link of crawl.links.filter((item) => item.internal)) {
    const target = byUrl.get(link.toNormalizedUrl);
    if (target && (target.statusCode ?? 0) >= 400) brokenInternal.push({ from: link.fromUrl, to: link.toUrl });
  }

  const sitemapFailed = crawl.sitemaps.length > 0 && crawl.sitemaps.every((item) => item.status === "error");
  const findings = evaluatePages(pages, {
    sitemapFailed,
    robotsMissing: crawl.robotsStatus === "absent" || crawl.robotsStatus === "error",
    brokenInternal,
  });
  await prisma.seoCrawlIssue.deleteMany({ where: { crawlId } });
  if (findings.length) {
    await prisma.seoCrawlIssue.createMany({
      data: findings.map((item) => ({
        crawlId,
        seoProjectId: crawl.seoProjectId,
        ruleKey: item.ruleKey,
        severity: item.severity,
        category: item.category,
        identityKey: identityKey(item.ruleKey, item.normalizedUrl),
        normalizedUrl: item.normalizedUrl,
        url: item.url,
        message: item.message,
      })),
      skipDuplicates: true,
    });
  }
  const indexable = pages.filter((page) => page.indexable).length;
  const summary = summarizeFindings(findings, indexable);
  const finished = await prisma.seoCrawl.update({
    where: { id: crawlId },
    data: {
      status: crawl.pagesFailed > 0 && crawl.pagesSucceeded === 0 ? "failed" : "completed",
      finishedAt: new Date(),
      healthScore: summary.score,
      issuesCritical: summary.breakdown.CRITICAL,
      issuesHigh: summary.breakdown.HIGH,
      issuesMedium: summary.breakdown.MEDIUM,
      issuesLow: summary.breakdown.LOW,
      issuesInfo: summary.breakdown.INFO,
    },
  });
  await prisma.seoProject.update({
    where: { id: crawl.seoProjectId },
    data: { lastAuditAt: new Date(), lastAuditStatus: finished.status, lastHealthScore: summary.score },
  });
  const { generateAlertsForCrawl } = await import("@/lib/seo/alerts");
  await generateAlertsForCrawl(crawlId);
  return finished;
}
