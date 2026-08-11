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

-- Unlinked valid external URLs are historical reimbursement evidence, not
-- worker-receipts Storage references. The final hardening gate leaves only
-- that exact legacy shape outside the bucket cutover.
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
          '\?.*$',
          ''
        )
    end as storage_path,
    exists (
      select 1
      from public.worker_receipts as receipt
      where receipt.reimbursement_id = reimbursement.id
    ) as has_linked_worker_receipt,
    reimbursement.receipt_url ~* '^https?://[^/?#[:space:]]+(?:/[^[:space:]#]*)?(?:#[^[:space:]]*)?$'
      as is_valid_external_http_reference,
    reimbursement.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts(?:/|$)'
      as is_worker_receipts_storage_url
  from public.worker_reimbursements as reimbursement
  where reimbursement.receipt_url is not null
)
select
  count(*) filter (
    where (
      reimbursement.has_linked_worker_receipt
      and (
        reimbursement.storage_path is null
        or receipt_object.id is null
        or receipt.receipt_url is distinct from reimbursement.receipt_url
      )
    )
    or (
      not reimbursement.has_linked_worker_receipt
      and not (
        (
          reimbursement.is_valid_external_http_reference
          and not reimbursement.is_worker_receipts_storage_url
        )
        or (reimbursement.storage_path is not null and receipt_object.id is not null)
      )
    )
  ) as invalid_or_dangling_worker_reimbursement_receipt_links,
  count(*) filter (
    where not reimbursement.has_linked_worker_receipt
      and reimbursement.storage_path is null
      and reimbursement.is_valid_external_http_reference
      and not reimbursement.is_worker_receipts_storage_url
  ) as allowed_unlinked_external_reimbursement_references
from reimbursement_references as reimbursement
left join public.worker_receipts as receipt
  on receipt.reimbursement_id = reimbursement.id
left join storage.objects as receipt_object
  on receipt_object.bucket_id = 'worker-receipts'
  and receipt_object.name = reimbursement.storage_path;

with resolved_receipts as (
  select case
    when receipt_url ~ '^uploads/' then receipt_url
    else regexp_replace(
      regexp_replace(
        receipt_url,
        '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/',
        '',
        'i'
      ),
      '\?.*$',
      ''
    )
  end as storage_path
  from public.worker_receipts
)
select count(*) as missing_worker_receipt_objects
from resolved_receipts
where not exists (
  select 1
  from storage.objects as receipt_object
  where receipt_object.bucket_id = 'worker-receipts'
    and receipt_object.name = resolved_receipts.storage_path
);
