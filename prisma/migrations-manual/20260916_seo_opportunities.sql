-- NoteCode SEO P2A: keyword research cache, opportunities, GSC query×page. Additive.

CREATE TABLE IF NOT EXISTS seo_gsc_query_page_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  query TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, query, page)
);

CREATE INDEX IF NOT EXISTS seo_gsc_query_page_daily_date_idx ON seo_gsc_query_page_daily (seo_project_id, date);
CREATE INDEX IF NOT EXISTS seo_gsc_query_page_daily_query_idx ON seo_gsc_query_page_daily (seo_project_id, query);
CREATE INDEX IF NOT EXISTS seo_gsc_query_page_daily_page_idx ON seo_gsc_query_page_daily (seo_project_id, page);

CREATE TABLE IF NOT EXISTS seo_keyword_research_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT NOT NULL,
  dataset TEXT NOT NULL,
  keyword_normalized TEXT NOT NULL,
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, dataset, keyword_normalized, country, language)
);

CREATE INDEX IF NOT EXISTS seo_keyword_research_cache_expires_idx ON seo_keyword_research_cache (expires_at);

CREATE TABLE IF NOT EXISTS seo_opportunities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  url TEXT,
  page_key TEXT,
  keyword TEXT,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation TEXT NOT NULL,
  task_id TEXT,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seo_project_id, identity_key)
);

CREATE INDEX IF NOT EXISTS seo_opportunities_status_score_idx ON seo_opportunities (seo_project_id, status, score);
CREATE INDEX IF NOT EXISTS seo_opportunities_type_idx ON seo_opportunities (seo_project_id, type);
CREATE INDEX IF NOT EXISTS seo_opportunities_page_idx ON seo_opportunities (page_key);
CREATE INDEX IF NOT EXISTS seo_opportunities_task_idx ON seo_opportunities (task_id);
