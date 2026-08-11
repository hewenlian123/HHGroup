-- Read-only, redacted pre-bridge evidence for incompatible receipt references.
-- This script intentionally does not read the bridge audit table, which does not
-- exist until migration 20260811040100 has applied.

with classified_receipts as (
  select
    receipt.id,
    receipt.reimbursement_id,
    receipt.receipt_url,
    reimbursement.receipt_url as reimbursement_receipt_url,
    (
      receipt.receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
      or receipt.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)(\?[^#]*)?$'
    ) as is_private_model_compatible
  from public.worker_receipts as receipt
  left join public.worker_reimbursements as reimbursement
    on reimbursement.id = receipt.reimbursement_id
)
select
  id as worker_receipt_id,
  reimbursement_id,
  md5(coalesce(receipt_url, '')) as receipt_reference_fingerprint,
  md5(coalesce(reimbursement_receipt_url, '')) as reimbursement_reference_fingerprint,
  receipt_url is not distinct from reimbursement_receipt_url as reimbursement_link_preserved
from classified_receipts
where not is_private_model_compatible
order by id;

select
  count(*) filter (
    where receipt_url is null
      or not (
        receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
        or receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)(\?[^#]*)?$'
      )
  ) as incompatible_worker_receipt_references,
  count(*) as total_worker_receipts
from public.worker_receipts;
