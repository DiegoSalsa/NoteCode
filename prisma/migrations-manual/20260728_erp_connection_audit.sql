-- Conecta los módulos de proyectos, cotizaciones, operación y portal.
-- Diseñada para poder ejecutarse una sola vez sobre la base actual.

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "team_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_requirements"
  ADD COLUMN "client_visible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "project_tasks"
  ADD COLUMN "client_visible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "documents"
  ADD COLUMN "client_visible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "notes"
  ADD COLUMN "project_id" TEXT;

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "notes" (
  "id", "project_id", "title", "content", "folder",
  "created_at", "updated_at", "deleted_at"
)
SELECT
  "id", "project_id", "title", "content", 'Proyecto',
  "created_at", "updated_at", NULL
FROM "project_notes"
ON CONFLICT ("id") DO NOTHING;

DROP INDEX IF EXISTS "quotes_project_id_key";

ALTER TABLE "quotes"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "parent_quote_id" TEXT;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_parent_quote_id_fkey"
  FOREIGN KEY ("parent_quote_id") REFERENCES "quotes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "product" TEXT,
  ADD COLUMN "external_reference" TEXT;

UPDATE "invoices"
SET
  "source" = 'PURAGENDA',
  "product" = 'PuraAgenda',
  "external_reference" = COALESCE("external_reference", "number")
WHERE UPPER("number") LIKE 'PURAGENDA%'
   OR LOWER("client") = 'soccerbarber';

UPDATE "invoices" AS invoice
SET
  "source" = 'PROJECT',
  "product" = project."name",
  "external_reference" = COALESCE(invoice."external_reference", invoice."number")
FROM "projects" AS project
WHERE invoice."project_id" = project."id"
  AND invoice."source" = 'MANUAL';

ALTER TABLE "client_portal_tokens"
  ADD COLUMN "project_id" TEXT;

ALTER TABLE "client_portal_tokens"
  ADD CONSTRAINT "client_portal_tokens_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "portal_access_logs" (
  "id" TEXT NOT NULL,
  "token_id" TEXT NOT NULL,
  "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "is_preview" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "portal_access_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "portal_access_logs_token_id_fkey"
    FOREIGN KEY ("token_id") REFERENCES "client_portal_tokens"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");
CREATE INDEX "notes_project_id_idx" ON "notes"("project_id");
CREATE INDEX "quotes_project_id_idx" ON "quotes"("project_id");
CREATE INDEX "quotes_parent_quote_id_idx" ON "quotes"("parent_quote_id");
CREATE INDEX "time_entries_task_id_idx" ON "time_entries"("task_id");
CREATE INDEX "invoices_source_idx" ON "invoices"("source");
CREATE UNIQUE INDEX "invoices_external_reference_key" ON "invoices"("external_reference");
CREATE INDEX "client_portal_tokens_project_id_idx" ON "client_portal_tokens"("project_id");
CREATE INDEX "portal_access_logs_token_id_accessed_at_idx"
  ON "portal_access_logs"("token_id", "accessed_at");
CREATE INDEX "portal_access_logs_is_preview_accessed_at_idx"
  ON "portal_access_logs"("is_preview", "accessed_at");
