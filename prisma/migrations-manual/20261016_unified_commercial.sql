-- Additive commercial migration. No historical amounts or statuses are backfilled.
BEGIN;
SET LOCAL lock_timeout = '10s';
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "commercial_terms" TEXT,
ADD COLUMN     "current_agreement_id" TEXT,
ADD COLUMN     "sale_net_amount" DECIMAL(20,4),
ADD COLUMN     "sale_tax_rate" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "agreement_id" TEXT,
ADD COLUMN     "billing_milestone_id" TEXT,
ADD COLUMN     "contract_id" TEXT,
ADD COLUMN     "document_kind" TEXT NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "converted_project_id" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "calculation_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "edit_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "payment_plan" JSONB NOT NULL DEFAULT '{"kind":"SINGLE"}',
ADD COLUMN     "published_snapshot" JSONB,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "request_key" TEXT;

-- CreateTable
CREATE TABLE "commercial_agreements" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "project_id" TEXT,
    "currency" TEXT NOT NULL,
    "net_amount" DECIMAL(20,4) NOT NULL,
    "tax_amount" DECIMAL(20,4) NOT NULL,
    "total_amount" DECIMAL(20,4) NOT NULL,
    "tax_rate" DECIMAL(7,4) NOT NULL,
    "terms" TEXT,
    "scope" TEXT,
    "content_hash" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_decisions" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "portal_token_id" TEXT,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_milestones" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "net_amount" DECIMAL(20,4) NOT NULL,
    "tax_amount" DECIMAL(20,4) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Planned',

    CONSTRAINT "billing_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_agreements_quote_id_key" ON "commercial_agreements"("quote_id");

-- CreateIndex
CREATE INDEX "commercial_agreements_project_id_accepted_at_idx" ON "commercial_agreements"("project_id", "accepted_at");

-- CreateIndex
CREATE INDEX "quote_decisions_quote_id_created_at_idx" ON "quote_decisions"("quote_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quote_decisions_quote_id_status_key" ON "quote_decisions"("quote_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_milestones_agreement_id_position_key" ON "billing_milestones"("agreement_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "projects_current_agreement_id_key" ON "projects"("current_agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_billing_milestone_id_key" ON "invoices"("billing_milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_request_key_key" ON "payments"("request_key");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_agreement_id_fkey" FOREIGN KEY ("current_agreement_id") REFERENCES "commercial_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "commercial_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_milestone_id_fkey" FOREIGN KEY ("billing_milestone_id") REFERENCES "billing_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "support_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_converted_project_id_fkey" FOREIGN KEY ("converted_project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_decisions" ADD CONSTRAINT "quote_decisions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "commercial_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defense in depth for older adapters, assistant tools, and concurrent payment writes.
CREATE FUNCTION commercial_protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_payments boolean; paid numeric;
BEGIN
  SELECT EXISTS(SELECT 1 FROM payments WHERE invoice_id=OLD.id), COALESCE((SELECT sum(amount::numeric) FROM payments WHERE invoice_id=OLD.id),0) INTO has_payments, paid;
  IF TG_OP='DELETE' THEN
    IF has_payments OR OLD.status='Pagado' OR OLD.paid_at IS NOT NULL OR OLD.billing_milestone_id IS NOT NULL OR OLD.contract_id IS NOT NULL THEN RAISE EXCEPTION 'Financial history cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF has_payments OR OLD.status='Pagado' OR OLD.paid_at IS NOT NULL OR OLD.billing_milestone_id IS NOT NULL OR OLD.contract_id IS NOT NULL THEN
    IF ROW(NEW.amount,NEW.net_amount,NEW.tax_rate,NEW.currency,NEW.client_id,NEW.client,NEW.project_id,NEW.number,NEW.issued_at,NEW.source,NEW.external_reference,NEW.agreement_id,NEW.billing_milestone_id,NEW.contract_id,CASE WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN OLD.deleted_at ELSE NEW.deleted_at END)
       IS DISTINCT FROM ROW(OLD.amount,OLD.net_amount,OLD.tax_rate,OLD.currency,OLD.client_id,OLD.client,OLD.project_id,OLD.number,OLD.issued_at,OLD.source,OLD.external_reference,OLD.agreement_id,OLD.billing_milestone_id,OLD.contract_id,OLD.deleted_at)
    THEN RAISE EXCEPTION 'Paid or originated financial document is immutable'; END IF;
    IF NEW.status='Cancelado' THEN RAISE EXCEPTION 'Paid or originated financial document requires formal adjustment'; END IF;
  END IF;
  IF has_payments THEN
    IF (paid >= NEW.amount AND NEW.status <> 'Pagado') OR (paid < NEW.amount AND NEW.status NOT IN ('Parcial','Vencido')) THEN RAISE EXCEPTION 'Invoice status must reflect recorded payments'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_invoice BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION commercial_protect_invoice();

CREATE FUNCTION commercial_protect_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv invoices%ROWTYPE; paid numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Payment evidence is immutable; use formal correction'; END IF;
  SELECT * INTO inv FROM invoices WHERE id=NEW.invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.deleted_at IS NOT NULL OR inv.status IN ('Cancelado','Pagado') THEN RAISE EXCEPTION 'Invoice unavailable for payment'; END IF;
  SELECT COALESCE(sum(amount::numeric),0) INTO paid FROM payments WHERE invoice_id=NEW.invoice_id;
  IF NEW.amount <= 0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') OR NEW.currency <> inv.currency OR paid + NEW.amount::numeric > inv.amount::numeric THEN RAISE EXCEPTION 'Payment amount, balance or currency invalid'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_payment BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION commercial_protect_payment();

CREATE FUNCTION commercial_protect_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'Borrador' THEN RAISE EXCEPTION 'New proposals must start as drafts'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'Borrador' THEN RAISE EXCEPTION 'Published proposal history cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'Borrador' THEN
    IF ROW(NEW.title,NEW.scope,NEW.currency,NEW.client_id,NEW.opportunity_id,NEW.version,NEW.parent_quote_id,NEW.tax_rate,NEW.discount,NEW.valid_until,NEW.terms,NEW.payment_plan,NEW.calculation_version,CASE WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN OLD.deleted_at ELSE NEW.deleted_at END)
       IS DISTINCT FROM ROW(OLD.title,OLD.scope,OLD.currency,OLD.client_id,OLD.opportunity_id,OLD.version,OLD.parent_quote_id,OLD.tax_rate,OLD.discount,OLD.valid_until,OLD.terms,OLD.payment_plan,OLD.calculation_version,OLD.deleted_at)
    THEN RAISE EXCEPTION 'Published proposal content is immutable'; END IF;
    IF OLD.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN RAISE EXCEPTION 'Proposal project association is immutable'; END IF;
    IF OLD.content_hash IS NOT NULL AND ROW(NEW.content_hash,NEW.published_snapshot) IS DISTINCT FROM ROW(OLD.content_hash,OLD.published_snapshot) THEN RAISE EXCEPTION 'Published content snapshot is immutable'; END IF;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NOT (
    (OLD.status='Borrador' AND NEW.status IN ('Enviada','Reemplazada')) OR
    (OLD.status='Enviada' AND NEW.status IN ('Aprobada','Cambios solicitados','Rechazada','Vencida','Reemplazada')) OR
    (OLD.status='Cambios solicitados' AND NEW.status='Reemplazada')
  ) THEN RAISE EXCEPTION 'Invalid commercial state transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_quote BEFORE INSERT OR UPDATE OR DELETE ON quotes FOR EACH ROW EXECUTE FUNCTION commercial_protect_quote();

CREATE FUNCTION commercial_protect_quote_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE qid text; qstatus text;
BEGIN
  IF TG_OP='INSERT' THEN qid=NEW.quote_id; ELSE qid=OLD.quote_id; END IF;
  SELECT status INTO qstatus FROM quotes WHERE id=qid FOR UPDATE;
  IF qstatus IS NOT NULL AND qstatus <> 'Borrador' THEN RAISE EXCEPTION 'Published proposal lines are immutable'; END IF;
  IF TG_OP='UPDATE' AND NEW.quote_id <> OLD.quote_id THEN RAISE EXCEPTION 'Cannot move proposal lines'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_quote_item BEFORE INSERT OR UPDATE OR DELETE ON quote_items FOR EACH ROW EXECUTE FUNCTION commercial_protect_quote_item();

CREATE FUNCTION commercial_protect_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accepted commercial evidence cannot be deleted'; END IF;
  IF ROW(NEW.quote_id,NEW.client_id,NEW.currency,NEW.net_amount,NEW.tax_amount,NEW.total_amount,NEW.tax_rate,NEW.terms,NEW.scope,NEW.content_hash,NEW.accepted_at)
     IS DISTINCT FROM ROW(OLD.quote_id,OLD.client_id,OLD.currency,OLD.net_amount,OLD.tax_amount,OLD.total_amount,OLD.tax_rate,OLD.terms,OLD.scope,OLD.content_hash,OLD.accepted_at)
     OR (OLD.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM OLD.project_id)
  THEN RAISE EXCEPTION 'Accepted agreement is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_agreement BEFORE UPDATE OR DELETE ON commercial_agreements FOR EACH ROW EXECUTE FUNCTION commercial_protect_agreement();

CREATE FUNCTION commercial_protect_project() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE accepted commercial_agreements%ROWTYPE;
BEGIN
  IF NEW.current_agreement_id IS NOT NULL THEN
    SELECT * INTO accepted FROM commercial_agreements WHERE id=NEW.current_agreement_id;
    IF NOT FOUND OR accepted.project_id IS DISTINCT FROM NEW.id OR accepted.client_id IS DISTINCT FROM NEW.client_id OR accepted.currency <> NEW.currency OR accepted.total_amount <> NEW.agreed_amount::numeric THEN RAISE EXCEPTION 'Project must reflect its accepted agreement'; END IF;
  ELSIF OLD.current_agreement_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot clear accepted agreement';
  END IF;
  IF OLD.client_id IS DISTINCT FROM NEW.client_id AND EXISTS(SELECT 1 FROM client_portal_tokens WHERE project_id=OLD.id AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Revoke project portal before changing client'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_project BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION commercial_protect_project();

CREATE FUNCTION commercial_protect_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commercial decision evidence is immutable'; END $$;
CREATE TRIGGER protect_commercial_decision BEFORE UPDATE OR DELETE ON quote_decisions FOR EACH ROW EXECUTE FUNCTION commercial_protect_decision();

CREATE FUNCTION commercial_protect_billing_milestone() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid text;
BEGIN
  mid=OLD.id;
  IF EXISTS(SELECT 1 FROM invoices WHERE billing_milestone_id=mid) THEN
    IF TG_OP='DELETE' OR ROW(NEW.agreement_id,NEW.position,NEW.net_amount,NEW.tax_amount,NEW.amount,NEW.title,NEW.due_date,NEW.status) IS DISTINCT FROM ROW(OLD.agreement_id,OLD.position,OLD.net_amount,OLD.tax_amount,OLD.amount,OLD.title,OLD.due_date,OLD.status) THEN RAISE EXCEPTION 'Billed milestone is immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_billing_milestone BEFORE UPDATE OR DELETE ON billing_milestones FOR EACH ROW EXECUTE FUNCTION commercial_protect_billing_milestone();

ALTER TABLE commercial_agreements ADD CONSTRAINT commercial_agreement_totals CHECK (net_amount >= 0 AND tax_amount >= 0 AND total_amount > 0 AND abs(total_amount-net_amount-tax_amount) < 0.0001);
ALTER TABLE billing_milestones ADD CONSTRAINT billing_milestone_totals CHECK (net_amount >= 0 AND tax_amount >= 0 AND amount > 0 AND amount=net_amount+tax_amount);
CREATE INDEX opportunities_converted_project_idx ON opportunities(converted_project_id);
CREATE INDEX invoices_agreement_idx ON invoices(agreement_id);
CREATE INDEX invoices_contract_idx ON invoices(contract_id);

CREATE UNIQUE INDEX quote_new_revision_key ON quotes (COALESCE(parent_quote_id,id),version) WHERE calculation_version=1;
CREATE FUNCTION commercial_protect_opportunity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.converted_project_id IS NOT NULL AND NEW.converted_project_id IS DISTINCT FROM OLD.converted_project_id THEN RAISE EXCEPTION 'Converted opportunity already has a project'; END IF;
  IF NEW.converted_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.converted_project_id AND client_id=NEW.client_id AND visibility='COMPANY' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Opportunity project must belong to its client'; END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id AND EXISTS(SELECT 1 FROM quotes WHERE opportunity_id=OLD.id AND status <> 'Borrador' AND client_id IS DISTINCT FROM NEW.client_id) THEN RAISE EXCEPTION 'Published opportunity client is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_commercial_opportunity BEFORE UPDATE ON opportunities FOR EACH ROW EXECUTE FUNCTION commercial_protect_opportunity();
CREATE FUNCTION commercial_protect_project_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM invoices WHERE project_id=OLD.id) OR EXISTS(SELECT 1 FROM quotes WHERE project_id=OLD.id) OR EXISTS(SELECT 1 FROM client_portal_tokens WHERE project_id=OLD.id) OR EXISTS(SELECT 1 FROM client_approvals WHERE project_id=OLD.id AND status <> 'Pendiente') THEN RAISE EXCEPTION 'Project commercial history must be preserved; use archive'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER protect_commercial_project_delete BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION commercial_protect_project_delete();
COMMIT;
