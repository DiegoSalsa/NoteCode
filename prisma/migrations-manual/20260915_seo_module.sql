-- NoteCode SEO module (P0).
-- Additive and reversible. Does not drop or alter existing user data.
-- Extends Project via seo_projects; does not duplicate clients/organizations.

CREATE TABLE IF NOT EXISTS seo_google_connections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  google_account_email TEXT NOT NULL,
  google_account_id TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  status TEXT NOT NULL DEFAULT 'connected',
  last_error TEXT,
  last_discovered_at TIMESTAMPTZ,
  connected_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS seo_google_connections_status_idx ON seo_google_connections (status);
CREATE INDEX IF NOT EXISTS seo_google_connections_email_idx ON seo_google_connections (google_account_email);

CREATE TABLE IF NOT EXISTS seo_google_properties (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connection_id TEXT NOT NULL REFERENCES seo_google_connections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  parent_external_id TEXT,
  display_name TEXT NOT NULL,
  site_url TEXT,
  hostname TEXT,
  permission_level TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, external_id)
);

CREATE INDEX IF NOT EXISTS seo_google_properties_connection_kind_idx ON seo_google_properties (connection_id, kind);
CREATE INDEX IF NOT EXISTS seo_google_properties_hostname_idx ON seo_google_properties (hostname);

CREATE TABLE IF NOT EXISTS seo_projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  primary_domain TEXT,
  gsc_property_id TEXT REFERENCES seo_google_properties(id) ON DELETE SET NULL,
  ga4_property_id TEXT REFERENCES seo_google_properties(id) ON DELETE SET NULL,
  last_gsc_sync_at TIMESTAMPTZ,
  last_ga4_sync_at TIMESTAMPTZ,
  last_gsc_sync_status TEXT,
  last_ga4_sync_status TEXT,
  last_gsc_error TEXT,
  last_ga4_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_projects_enabled_idx ON seo_projects (enabled);
CREATE INDEX IF NOT EXISTS seo_projects_gsc_property_idx ON seo_projects (gsc_property_id);
CREATE INDEX IF NOT EXISTS seo_projects_ga4_property_idx ON seo_projects (ga4_property_id);

CREATE TABLE IF NOT EXISTS seo_sync_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connection_id TEXT REFERENCES seo_google_connections(id) ON DELETE SET NULL,
  seo_project_id TEXT REFERENCES seo_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  trigger TEXT NOT NULL DEFAULT 'manual',
  date_from DATE,
  date_to DATE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  records_processed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_sync_jobs_project_type_created_idx ON seo_sync_jobs (seo_project_id, type, created_at);
CREATE INDEX IF NOT EXISTS seo_sync_jobs_status_created_idx ON seo_sync_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS seo_sync_jobs_type_created_idx ON seo_sync_jobs (type, created_at);

CREATE TABLE IF NOT EXISTS seo_gsc_site_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date)
);

CREATE INDEX IF NOT EXISTS seo_gsc_site_daily_project_date_idx ON seo_gsc_site_daily (seo_project_id, date);

CREATE TABLE IF NOT EXISTS seo_gsc_query_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  query TEXT NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, query)
);

CREATE INDEX IF NOT EXISTS seo_gsc_query_daily_project_date_idx ON seo_gsc_query_daily (seo_project_id, date);
CREATE INDEX IF NOT EXISTS seo_gsc_query_daily_project_query_idx ON seo_gsc_query_daily (seo_project_id, query);
CREATE INDEX IF NOT EXISTS seo_gsc_query_daily_project_clicks_idx ON seo_gsc_query_daily (seo_project_id, clicks);

CREATE TABLE IF NOT EXISTS seo_gsc_page_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page TEXT NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, page)
);

CREATE INDEX IF NOT EXISTS seo_gsc_page_daily_project_date_idx ON seo_gsc_page_daily (seo_project_id, date);
CREATE INDEX IF NOT EXISTS seo_gsc_page_daily_project_page_idx ON seo_gsc_page_daily (seo_project_id, page);
CREATE INDEX IF NOT EXISTS seo_gsc_page_daily_project_clicks_idx ON seo_gsc_page_daily (seo_project_id, clicks);

CREATE TABLE IF NOT EXISTS seo_gsc_device_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  device TEXT NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, device)
);

CREATE INDEX IF NOT EXISTS seo_gsc_device_daily_project_date_idx ON seo_gsc_device_daily (seo_project_id, date);

CREATE TABLE IF NOT EXISTS seo_gsc_country_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  country TEXT NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, country)
);

CREATE INDEX IF NOT EXISTS seo_gsc_country_daily_project_date_idx ON seo_gsc_country_daily (seo_project_id, date);

CREATE TABLE IF NOT EXISTS seo_ga4_site_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  users DOUBLE PRECISION NOT NULL DEFAULT 0,
  sessions DOUBLE PRECISION NOT NULL DEFAULT 0,
  engaged_sessions DOUBLE PRECISION NOT NULL DEFAULT 0,
  engagement_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  organic_sessions DOUBLE PRECISION NOT NULL DEFAULT 0,
  event_count DOUBLE PRECISION NOT NULL DEFAULT 0,
  key_events DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date)
);

CREATE INDEX IF NOT EXISTS seo_ga4_site_daily_project_date_idx ON seo_ga4_site_daily (seo_project_id, date);

CREATE TABLE IF NOT EXISTS seo_ga4_landing_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  landing_page TEXT NOT NULL,
  users DOUBLE PRECISION NOT NULL DEFAULT 0,
  sessions DOUBLE PRECISION NOT NULL DEFAULT 0,
  engaged_sessions DOUBLE PRECISION NOT NULL DEFAULT 0,
  engagement_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  key_events DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, landing_page)
);

CREATE INDEX IF NOT EXISTS seo_ga4_landing_daily_project_date_idx ON seo_ga4_landing_daily (seo_project_id, date);
CREATE INDEX IF NOT EXISTS seo_ga4_landing_daily_project_page_idx ON seo_ga4_landing_daily (seo_project_id, landing_page);

CREATE TABLE IF NOT EXISTS seo_ga4_source_daily (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seo_project_id TEXT NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  users DOUBLE PRECISION NOT NULL DEFAULT 0,
  sessions DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (seo_project_id, date, source, medium)
);

CREATE INDEX IF NOT EXISTS seo_ga4_source_daily_project_date_idx ON seo_ga4_source_daily (seo_project_id, date);

CREATE TABLE IF NOT EXISTS seo_api_usage (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 1,
  units INTEGER NOT NULL DEFAULT 0,
  estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  seo_project_id TEXT REFERENCES seo_projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_api_usage_provider_created_idx ON seo_api_usage (provider, created_at);
CREATE INDEX IF NOT EXISTS seo_api_usage_project_created_idx ON seo_api_usage (seo_project_id, created_at);

-- Reverse (do not run in production unless intentionally removing the module):
-- DROP TABLE IF EXISTS seo_api_usage;
-- DROP TABLE IF EXISTS seo_ga4_source_daily;
-- DROP TABLE IF EXISTS seo_ga4_landing_daily;
-- DROP TABLE IF EXISTS seo_ga4_site_daily;
-- DROP TABLE IF EXISTS seo_gsc_country_daily;
-- DROP TABLE IF EXISTS seo_gsc_device_daily;
-- DROP TABLE IF EXISTS seo_gsc_page_daily;
-- DROP TABLE IF EXISTS seo_gsc_query_daily;
-- DROP TABLE IF EXISTS seo_gsc_site_daily;
-- DROP TABLE IF EXISTS seo_sync_jobs;
-- DROP TABLE IF EXISTS seo_projects;
-- DROP TABLE IF EXISTS seo_google_properties;
-- DROP TABLE IF EXISTS seo_google_connections;
