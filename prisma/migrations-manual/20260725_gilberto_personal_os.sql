CREATE TABLE IF NOT EXISTS "assistant_threads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user_profiles"("user_id") ON DELETE CASCADE,
  "title" TEXT NOT NULL DEFAULT 'Conversación principal',
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_message_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "assistant_threads_user_archived_last_idx"
  ON "assistant_threads"("user_id", "archived_at", "last_message_at");
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_threads_one_default_per_user_idx"
  ON "assistant_threads"("user_id") WHERE "is_default" = TRUE AND "archived_at" IS NULL;

CREATE TABLE IF NOT EXISTS "assistant_messages" (
  "id" TEXT PRIMARY KEY,
  "thread_id" UUID NOT NULL REFERENCES "assistant_threads"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "text" TEXT,
  "parts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "assistant_messages_thread_created_idx"
  ON "assistant_messages"("thread_id", "created_at");

CREATE TABLE IF NOT EXISTS "assistant_memories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user_profiles"("user_id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'preferencia',
  "source" TEXT NOT NULL DEFAULT 'usuario',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "confirmed_at" TIMESTAMPTZ,
  "last_used_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_memories_user_key_key" UNIQUE ("user_id", "key")
);
CREATE INDEX IF NOT EXISTS "assistant_memories_user_category_expires_idx"
  ON "assistant_memories"("user_id", "category", "expires_at");

CREATE TABLE IF NOT EXISTS "assistant_actions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user_profiles"("user_id") ON DELETE CASCADE,
  "thread_id" UUID REFERENCES "assistant_threads"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "risk_level" TEXT NOT NULL DEFAULT 'low',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requires_approval" BOOLEAN NOT NULL DEFAULT FALSE,
  "idempotency_key" TEXT UNIQUE,
  "approved_at" TIMESTAMPTZ,
  "executed_at" TIMESTAMPTZ,
  "result" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "assistant_actions_user_status_created_idx"
  ON "assistant_actions"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "assistant_actions_thread_idx" ON "assistant_actions"("thread_id");

CREATE TABLE IF NOT EXISTS "assistant_routines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user_profiles"("user_id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "schedule" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
  "action_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "next_run_at" TIMESTAMPTZ,
  "last_run_at" TIMESTAMPTZ,
  "last_result" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "assistant_routines_user_active_next_idx"
  ON "assistant_routines"("user_id", "active", "next_run_at");
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_routines_user_action_type_key"
  ON "assistant_routines"("user_id", "action_type");
