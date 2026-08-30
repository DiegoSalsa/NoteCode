-- Personal workspaces are owned by a user and never appear in the company workspace.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN IF NOT EXISTS "personal_owner_id" TEXT;

ALTER TABLE "notes"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN IF NOT EXISTS "personal_owner_id" TEXT;

-- A personal project intentionally has no client or commercial relationship.
ALTER TABLE "projects" ALTER COLUMN "client_id" DROP NOT NULL;
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_client_id_fkey";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_personal_owner_id_fkey";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_personal_owner_id_fkey"
  FOREIGN KEY ("personal_owner_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_personal_owner_id_fkey";
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_personal_owner_id_fkey"
  FOREIGN KEY ("personal_owner_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "projects_visibility_personal_owner_idx"
  ON "projects"("visibility", "personal_owner_id");
CREATE INDEX IF NOT EXISTS "notes_visibility_personal_owner_idx"
  ON "notes"("visibility", "personal_owner_id");
