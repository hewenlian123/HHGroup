-- Read-only, redacted post-bridge evidence for the two externally hosted reference repairs.
-- Run scripts/preflight-worker-receipt-remediation.sql before the bridge; this
-- post-bridge script also verifies the audit table and must not run beforehand.
-- It never returns a receipt URL, object metadata, or receipt content.

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
  remediation.worker_receipt_id,
  remediation.reimbursement_id,
  md5(remediation.old_receipt_url) as before_receipt_reference_fingerprint,
  md5(coalesce(remediation.old_reimbursement_receipt_url, '')) as before_reimbursement_reference_fingerprint,
  md5(remediation.replacement_storage_path) as after_storage_path_fingerprint,
  remediation.remediated_at,
  receipt.receipt_url = remediation.replacement_storage_path as receipt_points_to_replacement,
  reimbursement.receipt_url = remediation.replacement_storage_path as reimbursement_points_to_replacement,
  receipt.reimbursement_id is not distinct from remediation.reimbursement_id as reimbursement_link_preserved
from public.worker_receipt_reference_remediations as remediation
join public.worker_receipts as receipt
  on receipt.id = remediation.worker_receipt_id
left join public.worker_reimbursements as reimbursement
  on reimbursement.id = remediation.reimbursement_id
order by remediation.id;

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
