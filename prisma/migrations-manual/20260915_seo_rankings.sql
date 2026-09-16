-- NoteCode SEO P1A: keywords, rankings, SERP snapshots, competitors, usage extras.
-- Additive. Does not drop or alter P0 GSC/GA4 historical tables.

ALTER TABLE seo_projects
  ADD COLUMN IF NOT EXISTS last_rankings_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_rankings_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_rankings_error TEXT;

ALTER TABLE seo_sync_jobs
  ADD COLUMN IF NOT EXISTS keywords_requested INTEGER,
  ADD COLUMN IF NOT EXISTS keywords_skipped INTEGER,
  ADD COLUMN IF NOT EXISTS keywords_success INTEGER,
  ADD COLUMN IF NOT EXISTS keywords_failed INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_cost DOUBLE PRECISION;

ALTER TABLE seo_api_usage
  ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'request',
  ADD COLUMN IF NOT EXISTS response_status TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS seo_api_usage_provider_operation_created_idx
  ON seo_api_usage (provider, operation, created_at);

CREATE TABLE IF NOT EXISTS seo_keyword_groups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seo_project_id, name)
);

CREATE INDEX IF NOT EXISTS seo_keyword_groups_project_idx ON seo_keyword_groups (seo_project_id);

CREATE TABLE IF NOT EXISTS seo_keywords (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES seo_keyword_groups(id) ON DELETE SET NULL,
  keyword TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  target_url TEXT,
  country TEXT NOT NULL DEFAULT 'CL',
  language TEXT NOT NULL DEFAULT 'es',
  device TEXT NOT NULL DEFAULT 'desktop',
  location TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  search_volume DOUBLE PRECISION,
  current_position INTEGER,
  previous_position INTEGER,
  best_position INTEGER,
  worst_position INTEGER,
  current_url TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seo_project_id, normalized_keyword, country, language, device, location)
);

CREATE INDEX IF NOT EXISTS seo_keywords_project_active_idx ON seo_keywords (seo_project_id, active);
CREATE INDEX IF NOT EXISTS seo_keywords_project_group_idx ON seo_keywords (seo_project_id, group_id);
CREATE INDEX IF NOT EXISTS seo_keywords_normalized_idx ON seo_keywords (normalized_keyword);

CREATE TABLE IF NOT EXISTS seo_serp_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_keyword_id TEXT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  provider TEXT NOT NULL,
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  device TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  item_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seo_keyword_id, date, provider, device)
);

CREATE INDEX IF NOT EXISTS seo_serp_snapshots_project_date_idx ON seo_serp_snapshots (seo_project_id, date);
CREATE INDEX IF NOT EXISTS seo_serp_snapshots_keyword_date_idx ON seo_serp_snapshots (seo_keyword_id, date);

CREATE TABLE IF NOT EXISTS seo_serp_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  snapshot_id TEXT NOT NULL REFERENCES seo_serp_snapshots(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  rank_group INTEGER,
  rank_absolute INTEGER,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  type TEXT NOT NULL,
  is_own BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS seo_serp_results_snapshot_position_idx ON seo_serp_results (snapshot_id, position);
CREATE INDEX IF NOT EXISTS seo_serp_results_domain_idx ON seo_serp_results (domain);

CREATE TABLE IF NOT EXISTS seo_rankings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_keyword_id TEXT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  position INTEGER,
  url TEXT,
  domain TEXT,
  serp_result_type TEXT,
  provider TEXT NOT NULL,
  snapshot_id TEXT REFERENCES seo_serp_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seo_keyword_id, date)
);

CREATE INDEX IF NOT EXISTS seo_rankings_keyword_date_idx ON seo_rankings (seo_keyword_id, date);
CREATE INDEX IF NOT EXISTS seo_rankings_date_idx ON seo_rankings (date);

CREATE TABLE IF NOT EXISTS seo_competitors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seo_project_id, domain)
);

CREATE INDEX IF NOT EXISTS seo_competitors_project_active_idx ON seo_competitors (seo_project_id, active);

-- Reverse (do not run unless removing P1A):
-- DROP TABLE IF EXISTS seo_competitors;
-- DROP TABLE IF EXISTS seo_rankings;
-- DROP TABLE IF EXISTS seo_serp_results;
-- DROP TABLE IF EXISTS seo_serp_snapshots;
-- DROP TABLE IF EXISTS seo_keywords;
-- DROP TABLE IF EXISTS seo_keyword_groups;
