-- NoteCode workspace integrity (idempotency, versions, trash, knowledge, vault).
-- Additive and reversible. Does not drop user data.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS specific_objectives TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS exclusions TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Media',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS template_key TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE project_requirements
  ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE project_techs
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS key_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 0,
  response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_records_user_key_uidx
  ON idempotency_records (user_id, key);
CREATE INDEX IF NOT EXISTS idempotency_records_expires_idx
  ON idempotency_records (expires_at);

CREATE TABLE IF NOT EXISTS encryption_key_versions (
  version INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ
);

INSERT INTO encryption_key_versions (version, label, active)
VALUES (1, 'primary', TRUE)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS note_revisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_revisions_note_version_idx ON note_revisions (note_id, version);

CREATE TABLE IF NOT EXISTS note_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS note_links_unique_idx
  ON note_links (source_note_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS note_links_target_idx ON note_links (target_type, target_id);

CREATE TABLE IF NOT EXISTS project_decisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL DEFAULT '',
  alternatives TEXT NOT NULL DEFAULT '',
  consequences TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Propuesta',
  owner_name TEXT,
  decided_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT
);
CREATE INDEX IF NOT EXISTS project_decisions_project_idx ON project_decisions (project_id, deleted_at);

CREATE TABLE IF NOT EXISTS project_risks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  probability TEXT NOT NULL DEFAULT 'Media',
  impact TEXT NOT NULL DEFAULT 'Media',
  status TEXT NOT NULL DEFAULT 'Abierto',
  mitigation TEXT NOT NULL DEFAULT '',
  owner_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT
);
CREATE INDEX IF NOT EXISTS project_risks_project_idx ON project_risks (project_id, deleted_at);

CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Pendiente',
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT
);
CREATE INDEX IF NOT EXISTS project_milestones_project_idx ON project_milestones (project_id, deleted_at);

CREATE TABLE IF NOT EXISTS project_relations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'relacionado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_relations_unique_idx ON project_relations (from_id, to_id, type);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'lector',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS project_members_unique_idx ON project_members (project_id, user_id);

CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_fields_project_key_uidx ON custom_fields (project_id, key);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_field_values_unique_idx
  ON custom_field_values (field_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lista',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sorts JSONB NOT NULL DEFAULT '[]'::jsonb,
  group_by TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_views_user_idx ON saved_views (user_id, entity);

CREATE TABLE IF NOT EXISTS view_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS view_preferences_user_scope_uidx ON view_preferences (user_id, scope);

CREATE TABLE IF NOT EXISTS workspace_backups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_by_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  checksum TEXT,
  storage_path TEXT,
  notes TEXT,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill requirement codes without colliding on empty strings.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM project_requirements
  WHERE code = ''
)
UPDATE project_requirements r
SET code = 'RF-' || LPAD(n::text, 2, '0')
FROM numbered
WHERE r.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS project_requirements_code_uidx
  ON project_requirements (project_id, code)
  WHERE code <> '' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS project_requirements_deleted_idx ON project_requirements (project_id, deleted_at);
CREATE INDEX IF NOT EXISTS project_tasks_deleted_idx ON project_tasks (project_id, deleted_at);
CREATE INDEX IF NOT EXISTS project_techs_deleted_idx ON project_techs (project_id, deleted_at);
CREATE INDEX IF NOT EXISTS notes_slug_idx ON notes (slug);
CREATE INDEX IF NOT EXISTS audit_events_correlation_idx ON audit_events (correlation_id);

-- Rollback notes (do not run automatically):
-- DROP TABLE IF EXISTS workspace_backups, view_preferences, saved_views, custom_field_values, custom_fields,
--   project_members, project_relations, project_milestones, project_risks, project_decisions,
--   note_links, note_revisions, encryption_key_versions, idempotency_records;
-- ALTER TABLE project_requirements DROP COLUMN IF EXISTS code, DROP COLUMN IF EXISTS sort_order,
--   DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deleted_by_id;
-- Remaining ALTERs can be reversed the same way. Existing user rows are not deleted.
