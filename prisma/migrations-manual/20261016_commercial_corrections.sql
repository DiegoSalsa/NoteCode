-- Apply AFTER 20261016_unified_commercial.sql. No historical amounts, origins or payments are rewritten.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION commercial_invoice_origin(i invoices) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN i.contract_id IS NOT NULL OR left(i.external_reference,9)='contract:'
      OR (left(i.number,4)='REC-' AND left(i.notes,length('Facturación recurrente: '))='Facturación recurrente: ')
      THEN 'CONTRACT'
    WHEN i.agreement_id IS NOT NULL OR i.billing_milestone_id IS NOT NULL OR i.source='PROJECT'
      THEN 'DEVELOPMENT'
    ELSE 'UNATTRIBUTED' END
$$;

CREATE OR REPLACE FUNCTION commercial_protect_project() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE accepted commercial_agreements%ROWTYPE; billed numeric;
BEGIN
  IF NEW.current_agreement_id IS NOT NULL THEN
    SELECT * INTO accepted FROM commercial_agreements WHERE id=NEW.current_agreement_id;
    IF NOT FOUND OR accepted.project_id IS DISTINCT FROM NEW.id OR accepted.client_id IS DISTINCT FROM NEW.client_id OR accepted.currency <> NEW.currency OR accepted.total_amount <> NEW.agreed_amount::numeric THEN RAISE EXCEPTION 'Project must reflect its accepted agreement'; END IF;
    IF OLD.current_agreement_id IS DISTINCT FROM NEW.current_agreement_id THEN
      IF EXISTS(SELECT 1 FROM invoices i WHERE i.project_id=NEW.id AND i.deleted_at IS NULL AND i.status<>'Cancelado' AND commercial_invoice_origin(i)<>'CONTRACT' AND i.currency<>accepted.currency)
        THEN RAISE EXCEPTION 'Formal reconciliation required: development currency mismatch'; END IF;
      SELECT COALESCE(sum(i.amount::numeric),0) INTO billed FROM invoices i
        WHERE i.project_id=NEW.id AND i.deleted_at IS NULL AND i.status<>'Cancelado' AND commercial_invoice_origin(i)<>'CONTRACT';
      IF accepted.total_amount < billed THEN RAISE EXCEPTION 'Accepted development price is below existing invoiced obligations; formal adjustment required'; END IF;
    END IF;
  ELSIF OLD.current_agreement_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot clear accepted agreement';
  END IF;
  IF OLD.client_id IS DISTINCT FROM NEW.client_id AND EXISTS(SELECT 1 FROM client_portal_tokens WHERE project_id=OLD.id AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Revoke project portal before changing client'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION commercial_check_invoice_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p projects%ROWTYPE; a commercial_agreements%ROWTYPE; m billing_milestones%ROWTYPE;
  c support_contracts%ROWTYPE; billed numeric; origin text;
BEGIN
  origin := commercial_invoice_origin(NEW);
  IF origin='CONTRACT' AND NEW.contract_id IS NULL THEN
    IF TG_OP='INSERT' THEN RAISE EXCEPTION 'New recurring invoices require an explicit contract'; END IF;
    IF commercial_invoice_origin(OLD)<>'CONTRACT' THEN RAISE EXCEPTION 'Recurring origin requires a contract'; END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF commercial_invoice_origin(OLD)='CONTRACT' AND origin<>'CONTRACT' THEN
      RAISE EXCEPTION 'Recurring document origin must be preserved';
    END IF;
    IF ROW(NEW.project_id,NEW.client_id,NEW.amount,NEW.net_amount,NEW.currency,NEW.agreement_id,NEW.billing_milestone_id,NEW.contract_id,NEW.external_reference,NEW.source,NEW.status,NEW.deleted_at,origin)
      IS NOT DISTINCT FROM ROW(OLD.project_id,OLD.client_id,OLD.amount,OLD.net_amount,OLD.currency,OLD.agreement_id,OLD.billing_milestone_id,OLD.contract_id,OLD.external_reference,OLD.source,OLD.status,OLD.deleted_at,commercial_invoice_origin(OLD)) THEN RETURN NEW; END IF;
  END IF;
  IF origin='CONTRACT' AND (NEW.agreement_id IS NOT NULL OR NEW.billing_milestone_id IS NOT NULL OR NEW.source='PROJECT') THEN
    RAISE EXCEPTION 'A recurring invoice cannot consume a development agreement';
  END IF;
  IF NEW.project_id IS NOT NULL THEN SELECT * INTO p FROM projects WHERE id=NEW.project_id FOR UPDATE; END IF;
  IF NEW.contract_id IS NOT NULL THEN
    SELECT * INTO c FROM support_contracts WHERE id=NEW.contract_id;
    IF NOT FOUND OR c.project_id IS DISTINCT FROM NEW.project_id OR c.client_id IS DISTINCT FROM NEW.client_id OR NEW.currency<>'CLP' THEN RAISE EXCEPTION 'Invoice does not match recurring contract'; END IF;
  END IF;
  IF NEW.agreement_id IS NOT NULL OR NEW.billing_milestone_id IS NOT NULL THEN
    SELECT * INTO m FROM billing_milestones WHERE id=NEW.billing_milestone_id;
    SELECT * INTO a FROM commercial_agreements WHERE id=NEW.agreement_id;
    IF m.id IS NULL OR a.id IS NULL OR m.agreement_id<>a.id OR a.project_id IS DISTINCT FROM NEW.project_id OR a.client_id IS DISTINCT FROM NEW.client_id
      OR a.currency<>NEW.currency OR m.amount<>NEW.amount::numeric OR m.net_amount IS DISTINCT FROM NEW.net_amount::numeric OR a.tax_rate<>NEW.tax_rate::numeric THEN
      RAISE EXCEPTION 'Invoice must match its development milestone';
    END IF;
    IF TG_OP='INSERT' AND (p.current_agreement_id IS DISTINCT FROM a.id OR m.status<>'Planned') THEN RAISE EXCEPTION 'Milestone must belong to current agreement'; END IF;
  END IF;
  IF origin<>'CONTRACT' AND p.current_agreement_id IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.status<>'Cancelado' THEN
    SELECT * INTO a FROM commercial_agreements WHERE id=p.current_agreement_id;
    IF NEW.currency<>a.currency THEN RAISE EXCEPTION 'Development invoice currency mismatch'; END IF;
    SELECT COALESCE(sum(i.amount::numeric),0) INTO billed FROM invoices i
      WHERE i.project_id=NEW.project_id AND i.id<>NEW.id AND i.deleted_at IS NULL AND i.status<>'Cancelado' AND commercial_invoice_origin(i)<>'CONTRACT';
    IF billed + NEW.amount::numeric > a.total_amount THEN RAISE EXCEPTION 'Invoice exceeds accepted development price'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_commercial_invoice_origin BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION commercial_check_invoice_origin();
COMMIT;
