CREATE UNIQUE INDEX IF NOT EXISTS "assistant_routines_user_action_type_key"
  ON "assistant_routines"("user_id", "action_type");
