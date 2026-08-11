# Receipt hardening — ledger-safe rollout

This is an operator procedure only. It has not been executed by this worktree.
Do not use `supabase db push`, `supabase migration up`, `supabase db reset`, a
migration reset, replay/renumbering, or any broad migration repair (including
`supabase migration repair`): Production has known historical ledger drift.

## Immutable scope

Apply only these reviewed receipt artifacts, in this order:

1. `20260811040100_worker_receipt_legacy_bridge.sql`
2. when the read-only preflight finds the historic incompatible rows, the
   corresponding service-only `private.remediate_worker_receipt_reference` calls
3. `20260811040201_worker_receipt_rls_storage_hardening.sql`

For the owner-approved cleanup state, preflight must instead prove zero
incompatible worker-receipt references and zero dangling reimbursement receipt
links. Valid external http(s) reimbursement-only historical evidence is outside
the `worker-receipts` bucket cutover and is reported separately. In that state,
skip step 2: do not recreate receipts, objects, or obsolete remediation evidence.

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
  report zero invalid or dangling receipt links. A non-zero
  `allowed_unlinked_external_reimbursement_references` count is permitted only
  for syntactically valid external http(s) URLs with no linked `worker_receipts`
  row and no `worker-receipts` Storage-route shape; it is historical
  reimbursement evidence, not bucket evidence.

Any other count, a missing/mismatched reimbursement, or a non-zero dangling
link count is a stop condition. Do not continue to final hardening.

## Stage A — bridge only

Deploy the reviewed receipt-contract runtime code first. It accepts canonical
paths and historic same-bucket public URLs; it adds no UI validation, Auth
Hardening, AP grants, or unrelated migrations. The bridge has narrow anon
upload/submit/options policies and owner/admin receipt review. Its bucket is
temporarily public only so historic public object URLs remain available until
Stage C.

Apply and record exactly the bridge version with this selective, serialized
ledger procedure. It is the only approved manual pattern for these receipt
migrations; run it from the repository root in an operator-only terminal. The
session lock prevents another receipt release from interleaving. The migration
file retains its explicit transaction; the ledger row is recorded only after the
file returns successfully.

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select pg_advisory_lock(hashtext('hh:receipt-hardening:selective-ledger'));

select count(*) = 0 as bridge_absent
from supabase_migrations.schema_migrations
where version = '20260811040100'
\gset
\if :bridge_absent
  \i supabase/migrations/20260811040100_worker_receipt_legacy_bridge.sql
  insert into supabase_migrations.schema_migrations (version, name)
  values ('20260811040100', 'worker_receipt_legacy_bridge');
\else
  \echo 'STOP: 20260811040100 is already recorded; do not replay or repair it.'
  \quit
\endif

select version, name
from supabase_migrations.schema_migrations
where version in ('20260811040100', '20260802055949', '20260802110245')
order by version;
select pg_advisory_unlock(hashtext('hh:receipt-hardening:selective-ledger'));
SQL
```

If the migration file or ledger insert fails, stop and escalate; do not retry by
replaying, renumbering, or repairing history. Never use `supabase db push`,
`supabase migration up`, reset, or a broad migration repair.

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
zero invalid or dangling receipt links. Only valid, unlinked external http(s)
historical reimbursement evidence may appear in the separately reported allowed
count.

## Stage C — final hardening only

Apply and record only the final version with the same approved selective ledger
pattern. Do not run this command until Stage A is recorded and the selected
remediation/cleanup path has its redacted proof.

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select pg_advisory_lock(hashtext('hh:receipt-hardening:selective-ledger'));

select
  (select count(*) from supabase_migrations.schema_migrations where version = '20260811040100') = 1
  and (select count(*) from supabase_migrations.schema_migrations where version = '20260811040201') = 0
  as final_is_the_only_next_receipt_step
\gset
\if :final_is_the_only_next_receipt_step
  \i supabase/migrations/20260811040201_worker_receipt_rls_storage_hardening.sql
  insert into supabase_migrations.schema_migrations (version, name)
  values ('20260811040201', 'worker_receipt_rls_storage_hardening');
\else
  \echo 'STOP: do not replay, repair, or record any version other than the reviewed final migration.'
  \quit
\endif

select version, name
from supabase_migrations.schema_migrations
where version in ('20260811040100', '20260811040201', '20260802055949', '20260802110245')
order by version;
select pg_advisory_unlock(hashtext('hh:receipt-hardening:selective-ledger'));
SQL
```

This command applies/records only `20260811040201`; it never runs an inferred
pending migration set. If it fails, stop and escalate. Do not use `supabase db
push`, `supabase migration up`, reset, replay/renumbering, or broad migration
repair.

The migration is transactional. Before it changes policies, it requires the
bridge audit table; every present remediation row to be complete and backed by a
live replacement object; zero incompatible worker-receipt references; zero
dangling or invalid reimbursement receipt links; and a live Storage object for
every remaining worker-receipt or `worker-receipts`-bucket reference. A valid,
unlinked external http(s) reimbursement-only historical URL is explicitly
outside that Storage invariant. A failed gate rolls back before bucket/policy
changes. The owner-approved cleanup path may have zero remediation audit rows;
it does not recreate deleted data.

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

Then run the executable, read-only verifier
`scripts/verify-worker-receipt-post-cutover.mjs`. Before cutover, record the
object count and the exact approved post-cutover security fingerprint from the
local Docker test using `scripts/receipt-hardening-production-baseline.sql`.
Do not derive the expected fingerprint from Production after cutover.

```sh
export RECEIPT_HARDENING_DATABASE_URL="$HH_PROD_DATABASE_URL"
export RECEIPT_HARDENING_EXPECTED_OBJECT_COUNT='<pre-cutover worker-receipts object count>'
export RECEIPT_HARDENING_EXPECTED_SECURITY_FINGERPRINT='cebd30f9b0c1d507aae596a51d87e69e'
npm run verify:receipt-hardening
```

It fails closed on bucket/configuration, object-count, worker-receipt or
reimbursement linkage, RLS/Storage/grant fingerprint, anon list/read exposure,
narrow anon upload/submit policy, owner/admin review policy, `/sync` guard, or
public-intake service-role exposure.

## Rollback

If Stage A fails, its transaction rolls back. If Stage C commits but application
verification fails, restore the exact verified Production pre-cutover baseline:

```sh
psql "$HH_PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/receipt-hardening-rollback.sql
```

The rollback is transactional. It restores the Production bucket public state,
null file-size/MIME limits, exact Storage policies, exact worker receipt and
worker/project policies, and exact related grants. It does not delete
`worker_receipts`, `worker_reimbursements`, `storage.objects`, replacement
objects, or audit rows. If the final version was already recorded, preserve that
ledger row and create a new reviewed forward migration for a later cutover.
Never erase or replay migration history.
