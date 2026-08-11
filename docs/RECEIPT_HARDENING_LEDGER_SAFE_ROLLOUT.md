# Receipt hardening — ledger-safe rollout

This is an operator procedure only. It has not been executed by this worktree.
Do not use `supabase db push`, `supabase migration up`, a migration reset, or a
broad migration repair: Production has known historical ledger drift.

## Immutable scope

Apply only these reviewed receipt artifacts, in this order:

1. `20260811040100_worker_receipt_legacy_bridge.sql`
2. two service-only `private.remediate_worker_receipt_reference` calls
3. `20260811040201_worker_receipt_rls_storage_hardening.sql`

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

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'worker-receipts';
```

The bridge/final versions must both be absent. The two Production-only versions
must remain present. The four public tables must have the columns referenced by
the reviewed SQL, and the `worker-receipts` bucket must return exactly one row.
Then run the redacted incompatible-reference preflight:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/preflight-worker-receipt-remediation.sql
```

Its first result must contain exactly two `worker_receipt_id` rows. Each must
have a linked reimbursement and matching receipt/reimbursement fingerprints.
The aggregate must report exactly two incompatible worker-receipt references.

## Stage A — bridge only

Deploy the reviewed receipt-contract runtime code first. It accepts canonical
paths and historic same-bucket public URLs; it adds no UI validation, Auth
Hardening, AP grants, or unrelated migrations. The bridge has narrow anon
upload/submit/options policies and owner/admin receipt review. Its bucket is
temporarily public only so historic public object URLs remain available until
Stage C.

Apply the bridge manually, then record only its successful version:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260811040100_worker_receipt_legacy_bridge.sql

supabase migration repair --linked --status applied 20260811040100
```

Do not run the repair command if the SQL command fails. Confirm the ledger has
only the added bridge row and the immutable Production-only rows are unchanged.

## Stage B — exact two-row remediation

For each of the two read-only-preflight rows, an authorized operator obtains the
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

The incompatible-row result must be empty; the audit result must contain exactly
two rows where `receipt_points_to_replacement`,
`reimbursement_points_to_replacement`, and `reimbursement_link_preserved` are
all true; the aggregate must be zero.

## Stage C — final hardening only

Apply precisely the requested final migration, then record only that successful
version:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260811040201_worker_receipt_rls_storage_hardening.sql

supabase migration repair --linked --status applied 20260811040201
```

The migration is transactional. Before it changes policies, it requires the
bridge audit table, exactly two complete remediation rows, zero incompatible
references, and a live Storage object for every reference. A failed gate rolls
back before bucket/policy changes. Do not run `supabase db push` afterwards.

Post-check: bucket private; anon list/read/update/delete denied; anon only
uploads a valid UUID path and submits valid Pending metadata; owner/admin signed
review works; non-owner and unauthenticated review fail; `/api/upload-receipt/sync`
is owner/admin-only; no service-role variable is browser-exposed.

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
