ALTER TABLE "company_tax_profiles"
  ALTER COLUMN "legal_name" DROP NOT NULL;

ALTER TABLE "company_tax_profiles"
  ADD COLUMN IF NOT EXISTS "ppm_rate_confirmed" BOOLEAN NOT NULL DEFAULT FALSE;
