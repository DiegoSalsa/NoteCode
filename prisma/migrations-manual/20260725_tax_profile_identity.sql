ALTER TABLE "company_tax_profiles"
  ADD COLUMN IF NOT EXISTS "company_type" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_category" TEXT,
  ADD COLUMN IF NOT EXISTS "segment" TEXT,
  ADD COLUMN IF NOT EXISTS "business_start_date" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "activity_description" TEXT,
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "commune" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_email" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_phone" TEXT;
