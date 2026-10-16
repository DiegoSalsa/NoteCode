-- Read-only. Run on a restored staging copy BEFORE the corrective migration.
-- Deliberately self-contained: commercial_invoice_origin may not exist there yet.
WITH classified AS (
  SELECT i.*, CASE WHEN contract_id IS NOT NULL OR left(external_reference,9)='contract:'
    OR (left(number,4)='REC-' AND left(notes,length('Facturación recurrente: '))='Facturación recurrente: ')
    THEN 'CONTRACT' WHEN agreement_id IS NOT NULL OR billing_milestone_id IS NOT NULL OR source='PROJECT'
    THEN 'DEVELOPMENT' ELSE 'UNATTRIBUTED' END AS origin
  FROM invoices i WHERE deleted_at IS NULL AND status<>'Cancelado'
), obligations AS (
  SELECT project_id,currency,sum(amount::numeric) AS billed FROM classified
    WHERE origin<>'CONTRACT' GROUP BY project_id,currency
)
SELECT 'PRICE_BELOW_OBLIGATIONS_OR_CURRENCY' AS issue,p.id AS record_id,
  a.currency AS accepted_currency,o.currency AS document_currency,a.total_amount,o.billed
FROM projects p JOIN commercial_agreements a ON a.id=p.current_agreement_id
JOIN obligations o ON o.project_id=p.id
WHERE o.currency<>a.currency OR o.billed>a.total_amount;

SELECT 'MIXED_ORIGIN' AS issue,id,number FROM invoices
WHERE (contract_id IS NOT NULL OR left(external_reference,9)='contract:'
  OR (left(number,4)='REC-' AND left(notes,length('Facturación recurrente: '))='Facturación recurrente: '))
  AND (agreement_id IS NOT NULL OR billing_milestone_id IS NOT NULL OR source='PROJECT');

SELECT 'HISTORICAL_REVIEW' AS issue,id,number,project_id,currency,amount,net_amount
FROM invoices WHERE deleted_at IS NULL AND status<>'Cancelado'
  AND contract_id IS NULL AND agreement_id IS NULL;
