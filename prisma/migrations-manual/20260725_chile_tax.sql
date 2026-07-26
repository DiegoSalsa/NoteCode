CREATE TABLE IF NOT EXISTS "company_tax_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rut" TEXT NOT NULL UNIQUE,
  "legal_name" TEXT,
  "company_type" TEXT,
  "tax_regime" TEXT,
  "tax_category" TEXT,
  "segment" TEXT,
  "vat_taxpayer" BOOLEAN NOT NULL DEFAULT TRUE,
  "ppm_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "ppm_rate_confirmed" BOOLEAN NOT NULL DEFAULT FALSE,
  "f29_due_day" INTEGER NOT NULL DEFAULT 20,
  "sii_proposal_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "business_start_date" TIMESTAMPTZ,
  "activity_description" TEXT,
  "address" TEXT,
  "commune" TEXT,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tax_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "company_tax_profiles"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "direction" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "folio" TEXT NOT NULL,
  "counterparty_rut" TEXT,
  "counterparty_name" TEXT,
  "issued_at" TIMESTAMPTZ NOT NULL,
  "period" TEXT NOT NULL,
  "net_amount" INTEGER NOT NULL DEFAULT 0,
  "exempt_amount" INTEGER NOT NULL DEFAULT 0,
  "vat_amount" INTEGER NOT NULL DEFAULT 0,
  "vat_recoverable_amount" INTEGER NOT NULL DEFAULT 0,
  "withholding_amount" INTEGER NOT NULL DEFAULT 0,
  "other_tax_amount" INTEGER NOT NULL DEFAULT 0,
  "total_amount" INTEGER NOT NULL DEFAULT 0,
  "rcv_status" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Registrado',
  "raw_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_documents_profile_direction_type_folio_key" UNIQUE ("profile_id", "direction", "document_type", "folio")
);

CREATE INDEX IF NOT EXISTS "tax_documents_profile_period_direction_idx" ON "tax_documents"("profile_id", "period", "direction");
CREATE INDEX IF NOT EXISTS "tax_documents_issued_at_idx" ON "tax_documents"("issued_at");
CREATE INDEX IF NOT EXISTS "tax_documents_counterparty_rut_idx" ON "tax_documents"("counterparty_rut");

CREATE TABLE IF NOT EXISTS "f29_periods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "company_tax_profiles"("id") ON DELETE CASCADE,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Borrador',
  "due_date" TIMESTAMPTZ,
  "debit_vat" INTEGER NOT NULL DEFAULT 0,
  "credit_vat" INTEGER NOT NULL DEFAULT 0,
  "previous_carry_forward" INTEGER NOT NULL DEFAULT 0,
  "next_carry_forward" INTEGER NOT NULL DEFAULT 0,
  "vat_payable" INTEGER NOT NULL DEFAULT 0,
  "ppm_base" INTEGER NOT NULL DEFAULT 0,
  "ppm_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "ppm_amount" INTEGER NOT NULL DEFAULT 0,
  "withholdings" INTEGER NOT NULL DEFAULT 0,
  "other_taxes" INTEGER NOT NULL DEFAULT 0,
  "estimated_total" INTEGER NOT NULL DEFAULT 0,
  "sii_proposed_total" INTEGER,
  "variance" INTEGER,
  "confidence" TEXT NOT NULL DEFAULT 'Baja',
  "calculation" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "calculated_at" TIMESTAMPTZ,
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" TEXT,
  "filed_at" TIMESTAMPTZ,
  "payment_reference" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "f29_periods_profile_period_key" UNIQUE ("profile_id", "period")
);

CREATE INDEX IF NOT EXISTS "f29_periods_period_status_idx" ON "f29_periods"("period", "status");
