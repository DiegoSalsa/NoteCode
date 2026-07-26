CREATE UNIQUE INDEX IF NOT EXISTS "assistant_threads_one_default_per_user_idx"
  ON "assistant_threads"("user_id") WHERE "is_default" = TRUE AND "archived_at" IS NULL;
