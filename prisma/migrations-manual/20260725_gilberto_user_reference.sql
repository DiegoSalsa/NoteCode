ALTER TABLE "assistant_threads"
  DROP CONSTRAINT IF EXISTS "assistant_threads_user_id_fkey",
  ADD CONSTRAINT "assistant_threads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE;

ALTER TABLE "assistant_memories"
  DROP CONSTRAINT IF EXISTS "assistant_memories_user_id_fkey",
  ADD CONSTRAINT "assistant_memories_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE;

ALTER TABLE "assistant_actions"
  DROP CONSTRAINT IF EXISTS "assistant_actions_user_id_fkey",
  ADD CONSTRAINT "assistant_actions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE;

ALTER TABLE "assistant_routines"
  DROP CONSTRAINT IF EXISTS "assistant_routines_user_id_fkey",
  ADD CONSTRAINT "assistant_routines_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE;
