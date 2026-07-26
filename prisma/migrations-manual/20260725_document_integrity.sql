ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "documents_checksum_key" ON "documents"("checksum");
