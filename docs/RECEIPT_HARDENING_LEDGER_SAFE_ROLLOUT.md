# Receipt hardening — ledger-safe rollout

This is an operator procedure only. It has not been executed by this worktree.
Do not use `supabase db push`, `supabase migration up`, a migration reset, or a
broad migration repair: Production has known historical ledger drift.

## Immutable scope

Apply only these reviewed receipt artifacts, in this order:

1. `20260811040100_worker_receipt_legacy_bridge.sql`
2. when the read-only preflight finds the historic incompatible rows, the
   corresponding service-only `private.remediate_worker_receipt_reference` calls
3. `20260811040201_worker_receipt_rls_storage_hardening.sql`

For the owner-approved cleanup state, preflight must instead prove zero
incompatible worker-receipt references and zero dangling reimbursement receipt
links. In that state, skip step 2: do not recreate receipts, objects, or
obsolete remediation evidence.

Do not replay, renumber, delete, or repair historical migrations. Preserve every
row in `supabase_migrations.schema_migrations`, including Production-only
versions `20260802055949` and `20260802110245`. The two reference repairs do
not delete the 15 unreferenced objects or any receipt/reimbursement history.

## Read-only Production preflight

Run these first in an approved Production read-only session. Capture only the
redacted output in the change record; do not copy receipt URLs or content into
logs, chat, shell history, or this runbook.

```sql
select version, name
from supabase_migrations.schema_migrations
where version in ('20260811040100', '20260811040201', '20260802055949', '20260802110245')
order by version;

select column_name, data_type
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'worker_receipts'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'worker_reimbursements'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workers'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'storage'
  and table_name = 'objects'
order by ordinal_position;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'worker-receipts';
```

The bridge/final versions must both be absent. The two Production-only versions
must remain present. The four public tables and `storage.objects` must have the
columns referenced by the reviewed SQL, and the `worker-receipts` bucket must
return exactly one row. Then run the redacted incompatible-reference preflight:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/preflight-worker-receipt-remediation.sql
```

Choose exactly one path from the redacted result:

- Remediation path: exactly two `worker_receipt_id` rows, each with a linked
  reimbursement and matching receipt/reimbursement fingerprints. The aggregate
  must report exactly two incompatible worker-receipt references and zero
  dangling reimbursement receipt links; the reimbursement-side aggregate must
  also report zero invalid or dangling receipt links.
- Owner-approved cleanup path: no `worker_receipt_id` rows. The aggregate must
  report zero incompatible worker-receipt references and zero dangling
  reimbursement receipt links; the reimbursement-side aggregate must also
  report zero invalid or dangling receipt links.

Any other count, a missing/mismatched reimbursement, or a non-zero dangling
link count is a stop condition. Do not continue to final hardening.

## Stage A — bridge only

Deploy the reviewed receipt-contract runtime code first. It accepts canonical
paths and historic same-bucket public URLs; it adds no UI validation, Auth
Hardening, AP grants, or unrelated migrations. The bridge has narrow anon
upload/submit/options policies and owner/admin receipt review. Its bucket is
temporarily public only so historic public object URLs remain available until
Stage C.

Apply the bridge only through the approved migration release mechanism that
executes the reviewed artifact and records its version atomically. Do not run
the SQL file by hand, use `supabase db push`, reset/replay history, or use any
migration-repair command. If the release mechanism cannot apply and record this
new version without repair, stop and escalate. Confirm the ledger has only the
new bridge row and the immutable Production-only rows are unchanged.

## Stage B — remediation path only

Skip this entire stage for the owner-approved cleanup path. It is not a data
repair authorization and must never recreate the deleted rows or their objects.

For each of the two remediation-path rows, an authorized operator obtains the
source image through a non-public channel and creates one new canonical object.
Do this in a controlled, server-only terminal; do not use browser code or expose
a service-role key.

```sh
# Set each value only in the controlled operator shell; never commit or log it.
export RECEIPT_1_ID='<first redacted worker_receipt_id>'
export RECEIPT_1_OLD_URL='<first exact external reference>'
export RECEIPT_1_PATH='uploads/<new-v4-uuid>.png'
export RECEIPT_1_SOURCE='/secure/operator-only/first-source.png'
export RECEIPT_2_ID='<second redacted worker_receipt_id>'
export RECEIPT_2_OLD_URL='<second exact external reference>'
export RECEIPT_2_PATH='uploads/<new-v4-uuid>.png'
export RECEIPT_2_SOURCE='/secure/operator-only/second-source.png'

curl --fail --silent --show-error -o /dev/null \
  --request POST "$SUPABASE_URL/storage/v1/object/worker-receipts/$RECEIPT_1_PATH" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header 'Content-Type: image/png' \
  --header 'x-upsert: false' \
  --data-binary "@$RECEIPT_1_SOURCE"

curl --fail --silent --show-error -o /dev/null \
  --request POST "$SUPABASE_URL/storage/v1/object/worker-receipts/$RECEIPT_2_PATH" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header 'Content-Type: image/png' \
  --header 'x-upsert: false' \
  --data-binary "@$RECEIPT_2_SOURCE"
```

Use the true MIME type and matching extension if either source is JPG, WebP, or
PDF. The paths must be new UUID paths; replacements are additions, never object
deletions. Then execute both table/reference repairs in one transaction:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v receipt_1_id="$RECEIPT_1_ID" \
  -v receipt_1_old_url="$RECEIPT_1_OLD_URL" \
  -v receipt_1_path="$RECEIPT_1_PATH" \
  -v receipt_2_id="$RECEIPT_2_ID" \
  -v receipt_2_old_url="$RECEIPT_2_OLD_URL" \
  -v receipt_2_path="$RECEIPT_2_PATH" <<'SQL'
begin;
select * from private.remediate_worker_receipt_reference(
  :'receipt_1_id'::uuid,
  :'receipt_1_old_url',
  :'receipt_1_path'
);
select * from private.remediate_worker_receipt_reference(
  :'receipt_2_id'::uuid,
  :'receipt_2_old_url',
  :'receipt_2_path'
);
commit;
SQL
```

The function locks each receipt and its linked reimbursement, verifies the
expected URL and replacement object, updates both references atomically, and
stores the old values in the private audit table. If either operation fails,
the outer transaction rolls both repairs back. Record only this redacted proof:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/verify-worker-receipt-remediation.sql
```

The incompatible-row result must be empty. On the remediation path, the audit
result must contain exactly two rows where `receipt_points_to_replacement`,
`reimbursement_points_to_replacement`, and `reimbursement_link_preserved` are
all true. On the owner-approved cleanup path, zero audit rows are expected. For
either path, the aggregate must report zero incompatible and zero dangling
reimbursement receipt links, and the reimbursement-side aggregate must report
zero invalid or dangling receipt links.

## Stage C — final hardening only

Apply the final migration only through the approved migration release mechanism
that executes the reviewed artifact and records its version atomically. Do not
run the SQL file by hand, use `supabase db push`, reset/replay history, or use a
migration-repair command. If this cannot be done without repair, stop and
escalate.

The migration is transactional. Before it changes policies, it requires the
bridge audit table; every present remediation row to be complete and backed by a
live replacement object; zero incompatible worker-receipt references; zero
dangling or invalid reimbursement receipt links; and a live Storage object for
every remaining worker-receipt or reimbursement receipt reference. A failed gate
rolls back before bucket/policy changes. The owner-approved cleanup path may
have zero remediation audit rows; it does not recreate deleted data.

Post-check: bucket private; anon list/read/update/delete denied; anon only
uploads a valid UUID path and submits valid Pending metadata; owner/admin signed
review works; non-owner and unauthenticated review fail; `/api/upload-receipt/sync`
is owner/admin-only; no service-role variable is browser-exposed.

Run the redacted post-cutover verification. It must report zero incompatible
references, zero forward or reimbursement-side dangling links, and zero missing
receipt objects:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/verify-worker-receipt-remediation.sql
```

## Rollback

If Stage A fails, its transaction rolls back. If Stage C commits but application
verification fails, restore the narrow bridge—not the original broad policies:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/receipt-hardening-rollback.sql
```

The rollback is transactional. It restores public object delivery plus narrow
legacy/canonical submission; it does not delete `worker_receipts`,
`worker_reimbursements`, `storage.objects`, replacement objects, or audit rows.
If the final version was already recorded, preserve that ledger row and create a
new reviewed forward migration for a later cutover. Never erase or replay
migration history.
