-- NoteCode SEO P1B: crawl/audit/alerts + pending SERP tasks. Additive.

ALTER TABLE seo_projects
  ADD COLUMN IF NOT EXISTS crawl_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS crawl_base_url TEXT,
  ADD COLUMN IF NOT EXISTS crawl_max_pages INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS crawl_max_depth INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS crawl_concurrency INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS crawl_respect_robots BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_audit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_audit_status TEXT,
  ADD COLUMN IF NOT EXISTS last_health_score DOUBLE PRECISION;

ALTER TABLE seo_keywords
  ADD COLUMN IF NOT EXISTS pending_serp_task_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_serp_task_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS seo_crawls (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  pages_queued INTEGER NOT NULL DEFAULT 0,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_succeeded INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0,
  issues_critical INTEGER NOT NULL DEFAULT 0,
  issues_high INTEGER NOT NULL DEFAULT 0,
  issues_medium INTEGER NOT NULL DEFAULT 0,
  issues_low INTEGER NOT NULL DEFAULT 0,
  issues_info INTEGER NOT NULL DEFAULT 0,
  health_score DOUBLE PRECISION,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  robots_status TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_crawls_project_created_idx ON seo_crawls (seo_project_id, created_at);
CREATE INDEX IF NOT EXISTS seo_crawls_status_created_idx ON seo_crawls (status, created_at);

CREATE TABLE IF NOT EXISTS seo_crawl_pages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  crawl_id TEXT NOT NULL REFERENCES seo_crawls(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  final_url TEXT,
  status_code INTEGER,
  content_type TEXT,
  response_time_ms INTEGER,
  size_bytes INTEGER,
  depth INTEGER NOT NULL DEFAULT 0,
  discovered_from TEXT,
  indexable BOOLEAN NOT NULL DEFAULT TRUE,
  indexable_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  robots_index BOOLEAN NOT NULL DEFAULT TRUE,
  robots_follow BOOLEAN NOT NULL DEFAULT TRUE,
  canonical TEXT,
  title TEXT,
  description TEXT,
  h1 TEXT,
  h1_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  structured_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  og_title TEXT,
  og_image TEXT,
  twitter_card TEXT,
  internal_out INTEGER NOT NULL DEFAULT 0,
  external_out INTEGER NOT NULL DEFAULT 0,
  internal_in INTEGER NOT NULL DEFAULT 0,
  redirect_chain TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  content_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crawl_id, normalized_url)
);

CREATE INDEX IF NOT EXISTS seo_crawl_pages_status_idx ON seo_crawl_pages (crawl_id, status_code);
CREATE INDEX IF NOT EXISTS seo_crawl_pages_indexable_idx ON seo_crawl_pages (crawl_id, indexable);

CREATE TABLE IF NOT EXISTS seo_crawl_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  crawl_id TEXT NOT NULL REFERENCES seo_crawls(id) ON DELETE CASCADE,
  from_page_id TEXT REFERENCES seo_crawl_pages(id) ON DELETE SET NULL,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  to_normalized_url TEXT NOT NULL,
  internal BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS seo_crawl_links_to_idx ON seo_crawl_links (crawl_id, to_normalized_url);
CREATE INDEX IF NOT EXISTS seo_crawl_links_from_idx ON seo_crawl_links (from_page_id);

CREATE TABLE IF NOT EXISTS seo_crawl_sitemaps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  crawl_id TEXT NOT NULL REFERENCES seo_crawls(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sitemap',
  url_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS seo_crawl_sitemaps_crawl_idx ON seo_crawl_sitemaps (crawl_id);

CREATE TABLE IF NOT EXISTS seo_crawl_issues (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  crawl_id TEXT NOT NULL REFERENCES seo_crawls(id) ON DELETE CASCADE,
  seo_project_id TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  normalized_url TEXT,
  url TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crawl_id, identity_key)
);

CREATE INDEX IF NOT EXISTS seo_crawl_issues_sev_idx ON seo_crawl_issues (crawl_id, severity);
CREATE INDEX IF NOT EXISTS seo_crawl_issues_rule_idx ON seo_crawl_issues (seo_project_id, rule_key);
CREATE INDEX IF NOT EXISTS seo_crawl_issues_url_idx ON seo_crawl_issues (normalized_url);

CREATE TABLE IF NOT EXISTS seo_alerts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  crawl_id TEXT REFERENCES seo_crawls(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  url TEXT,
  rule_key TEXT,
  task_id TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_alerts_project_status_idx ON seo_alerts (seo_project_id, status, created_at);
CREATE INDEX IF NOT EXISTS seo_alerts_identity_idx ON seo_alerts (seo_project_id, identity_key);
CREATE UNIQUE INDEX IF NOT EXISTS seo_alerts_open_identity_idx ON seo_alerts (seo_project_id, identity_key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS seo_alerts_task_idx ON seo_alerts (task_id);
