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
    where receipt.receipt_url is null
      or not (
        receipt.receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
        or receipt.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)(\?[^#]*)?$'
      )
  ) as incompatible_worker_receipt_references,
  count(*) filter (
    where receipt.reimbursement_id is not null
      and (
        reimbursement.id is null
        or reimbursement.receipt_url is distinct from receipt.receipt_url
      )
  ) as dangling_reimbursement_receipt_links,
  count(*) as total_worker_receipts
from public.worker_receipts as receipt
left join public.worker_reimbursements as reimbursement
  on reimbursement.id = receipt.reimbursement_id;

with reimbursement_references as (
  select
    reimbursement.id,
    reimbursement.receipt_url,
    case
      when reimbursement.receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
        then reimbursement.receipt_url
      when reimbursement.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)(\?[^#]*)?$'
        then regexp_replace(
          regexp_replace(
            reimbursement.receipt_url,
            '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/',
            '',
            'i'
          ),
          '\\?.*$',
          ''
        )
    end as storage_path
  from public.worker_reimbursements as reimbursement
  where reimbursement.receipt_url is not null
)
select count(*) as invalid_or_dangling_worker_reimbursement_receipt_links
from reimbursement_references as reimbursement
left join public.worker_receipts as receipt
  on receipt.reimbursement_id = reimbursement.id
left join storage.objects as receipt_object
  on receipt_object.bucket_id = 'worker-receipts'
  and receipt_object.name = reimbursement.storage_path
where reimbursement.storage_path is null
  or receipt_object.id is null
  or (
    receipt.id is not null
    and receipt.receipt_url is distinct from reimbursement.receipt_url
  );
