# HH Group step 11 successor rollout manifest

**Status:** PRE-DEPLOY BLOCKED — non-authorizing. The named operator's
Dashboard restore access remains unverified. This manifest does not authorize a
Production migration, data write, restore, or application deployment.

**Release lineage:** parent commit
`a625bec077fc2fde5d14e33787209022a0a6f4ea` already contains the certified HH
UI, steps 1–10, project Skills, Serena memories, and development-tooling stack.
Production records those ten migrations exactly once. The exact successor
release is the clean commit containing this manifest, the operator record,
step 11, its pgTAP, and the successor application changes. Record it with
`git rev-parse HEAD`; a dirty worktree is not a release artifact.

**Production target:** Supabase project `rzublljldebswurgdqxp` (`HH Main
Project Sofeware`, `us-east-2`). A target mismatch is `STOP`.

## Release invariant: migrations first, application second

Keep the currently compatible `a625bec` application running while the
authorized operator applies and verifies step 11 only. Do not deploy the exact
successor application until step 11, its ACL check, and every post-check pass.
Do not replay or repair steps 1–10.

Before step 11, activate a scoped operational freeze for both live
Estimate→milestone Invoice creation entrypoints. No owner/admin may create a
milestone Invoice from the Estimate detail page or the new Invoice form until
the exact successor application is deployed and its read-only health check
passes. The future authorization must cover both ordered stages in one bounded
window—step 11 first, exact successor app second. If exclusive control cannot
be proved, the migration must not start.

Any failed, timed-out, skipped, partially applied, or unverifiable step is
`STOP`: leave the application undeployed, preserve the exact error and database
state, and use the recovery rules below. A local pass does not authorize a
Production change.

## Applied historical ledger — do not replay

| Step | Exact migration                                                 | Git blob                                   | Contract introduced                                                                                                             | Immediate verification before continuing                                                                                                                                                                                                                                                                              |
| ---: | --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `20260830014500_estimate_financial_persistence_hardening.sql`   | `359a67e0ba36a6eb478fb9dda836b85710ae5099` | `update_estimate_meta_atomic(uuid,jsonb)`; locked, fail-closed Estimate header/meta/category persistence                        | Function exists, is `SECURITY INVOKER`, has an empty-patch no-write path, and the migration version is recorded once. Continue immediately to step 2; the new function is not release-ready before its ACL closes.                                                                                                    |
|    2 | `20260830014501_estimate_financial_persistence_permissions.sql` | `24da155cdff0f9910f1972ea8777f5e95a1eb84c` | Service-role-only execution for the Estimate RPC                                                                                | `PUBLIC`, `anon`, and `authenticated` have no `EXECUTE`; `service_role` does. Stop and use the step-1 rollback artifact if this closure fails.                                                                                                                                                                        |
|    3 | `20260830092709_payment_received_atomic.sql`                    | `04ce29be36667b00726141a5e2d3dcf0978cfad1` | Payment idempotency columns; Payment Received and invoice-allocation unique indexes; atomic create/update RPCs                  | Both indexes are unique, valid, ready, immediate, and correctly shaped; both RPC signatures exist and are security invoker. This file uses `CREATE INDEX CONCURRENTLY` and must not be wrapped in an outer transaction.                                                                                               |
|    4 | `20260830092716_payroll_settlement_atomic.sql`                  | `09635c5accc1743f5f2e7669a55cc1fd08094178` | Worker-payment settlement metadata and atomic payroll settlement RPC                                                            | New columns and the exact RPC signature exist; the function remains security invoker. Final service-role-only ACL is verified at step 10.                                                                                                                                                                             |
|    5 | `20260830102523_reimbursement_invoice_atomic.sql`               | `42c1a7192faca58432bf214a6af22aeda73d7bc1` | Invoice idempotency; reimbursement source uniqueness; paid-reimbursement guards/expense trigger; reimbursement and invoice RPCs | Both concurrent indexes are unique/valid/ready; both triggers point to security-invoker helpers; reimbursement and invoice RPC signatures exist. Do not wrap this file in an outer transaction.                                                                                                                       |
|    6 | `20260830120000_estimate_snapshot_delete_restrict.sql`          | `9ff75c81c7bf06153a639c0aab6b462f1b3b764b` | Append-only Estimate snapshot FK with `ON DELETE RESTRICT`                                                                      | `estimate_snapshots_estimate_id_fkey` has `confdeltype = 'r'` and `convalidated = true`. This file has two transactions; failure after the first may leave an unvalidated restrictive FK and requires state inspection.                                                                                               |
|    7 | `20260830192501_expense_bank_atomic.sql`                        | `91bb7394a6512233175e6e8a9e5fafd82a6aaa22` | Expense/bank idempotency columns and three unique indexes; atomic expense, line, and bank-reconciliation RPCs                   | All three indexes are unique/valid/ready; four RPC signatures exist; `anon` has no execute privilege, while the reviewed `authenticated`/`service_role` grants are present. Do not wrap this file in an outer transaction.                                                                                            |
|    8 | `20260830201812_restore_expense_line_category_atomic.sql`       | `ecd2b58f77c2e4e833c5d9f27a989a37ec362f32` | Canonical per-line expense category, backfill/default/validated check, and category-aware replacements of the four expense RPCs | `expense_lines.category` exists, has default `Other`, contains no null/blank rows, and `expense_lines_category_not_null` is validated; the four RPC signatures and grants remain exact. This file has three transactions, so inspect partial state on failure.                                                        |
|    9 | `20260830203159_restore_current_operational_metadata.sql`       | `3c04ff6c36ed341059a330dc7f61d4c1f08c7b34` | Labor payment date range, Change Order metadata, and vendor lifecycle metadata                                                  | The two check constraints are validated; applied dates are both null or ordered; vendor status is only `active`/`inactive`; Change Order columns have the reviewed types. This file has four transactions, so inspect partial state on failure.                                                                       |
|   10 | `20260830204500_financial_rpc_acl_least_privilege.sql`          | `c1d8a42223b8961ee71502934fd6408cb0bb5130` | Final least-privilege ACL for eight financial functions                                                                         | Run `supabase/tests/database/008_financial_rpc_acl.sql`: Payment/Invoice RPCs allow only `authenticated` and `service_role`; Payroll/Reimbursement RPCs allow only `service_role`; trigger helpers have no API-role grantee; all eight remain security invoker. Only this verified state permits application rollout. |

Production read-only preflight confirmed every version in this table exists
exactly once. These are immutable prerequisites, not pending work. Never edit,
replay, remove, or repair their ledger entries.

## Exact rollout scope — step 11 only

The required forward migration is
`20260901042341_invoice_milestone_atomicity.sql`; it correctly sorts after step 10. Its required Git blob is
`36f835f28af473de664ebbd3a5375b148f4862f9`.

The successor commit must record the exact migration blob, application
contract, recovery/forward-fix decision, operator record, and
`supabase/tests/database/009_estimate_milestone_invoice_atomic.sql` (required
blob `e7f20a7b8dac32d067d75a0389dc6c3da4a3337f`). Apply it after the already
recorded final ACL migration and before the application. Both live application
entrypoints—Estimate detail milestone creation and the Invoice form with an
Estimate milestone source—must call this wrapper and must not perform direct
Invoice inserts, legacy follow-up linkage, or compensating cleanup deletes. Its
evidence must cover the authoritative Invoice↔milestone association, success,
failure/partial-failure rollback, ambiguous-response retry, duplicate delivery,
idempotency, row-lock serialization, and exact RPC ACL. Missing or changed
evidence makes the rollout `NOT READY`.

The required operator/window/backup evidence is
[2026-08-31-invoice-milestone-step11-operator-record.md](2026-08-31-invoice-milestone-step11-operator-record.md).
The canonical read-only preflight script is
[`scripts/preflight-invoice-milestone-step11.sql`](../../scripts/preflight-invoice-milestone-step11.sql),
with required Git blob `be7055a852706aa3272925c3fe2aa8ce602f5841`.

Future filenames must be generated with the repository-pinned CLI, not hand
invented:

```sh
fnm exec --using=22 npx supabase migration new invoice_milestone_atomicity
```

## Preflight

### 1. Freeze and prove the artifacts

Record one clean successor commit for both the step-11 database artifact and
the successor application artifact. Record the operator, approved target,
change window, backup/restore reference, and incident owner in the linked
operator record. The following comparison must show step 11 and its pgTAP as
the only new database artifacts; no step 1–10 migration may be modified or
deleted:

```sh
git diff --name-status \
  a625bec077fc2fde5d14e33787209022a0a6f4ea HEAD \
  -- supabase/migrations \
     supabase/tests/database/009_estimate_milestone_invoice_atomic.sql
git ls-tree -r HEAD -- \
  supabase/migrations/20260901042341_invoice_milestone_atomicity.sql \
  supabase/tests/database/009_estimate_milestone_invoice_atomic.sql
```

The clean `HEAD` is the exact release commit. Confirm its two Git blobs match
the values above, record that commit in the change-window authorization, and
do not rewrite the ten-file historical ledger.

### 2. Complete local gates against PostgreSQL 17

The repository-pinned Supabase CLI is `2.116.0`. First prove `supabase status`
reports only the repository local ports/hosts; never continue if any target is
linked, hosted, staging, or Production. Then run:

```sh
fnm exec --using=22 npm run check:migration-filenames
fnm exec --using=22 npm run check:migration-order
fnm exec --using=22 npm run check:schema-preflight:strict
fnm exec --using=22 npm run check:rollback-sql

./node_modules/.bin/squawk --pg-version=17 \
  supabase/migrations/20260901042341_invoice_milestone_atomicity.sql

fnm exec --using=22 npx supabase db reset --local
fnm exec --using=22 npm run test:db:local
fnm exec --using=22 npm run check:schema-vs-code
```

The recursive `test:db:local` entry runs the root Estimate pgTAP and every
database suite, including step 11, exactly once. A skipped or weakened test is
not a pass.

### 3. Approved target read-only preflight

Before any authorized write session, attach redacted read-only evidence that:

- every step 1–10 version is recorded exactly once and step 11 is absent;
- the latest recorded version is `20260830204500`;
- the canonical read-only preflight
  [`scripts/preflight-invoice-milestone-step11.sql`](../../scripts/preflight-invoice-milestone-step11.sql)
  returns prerequisite fingerprint `b9881958e082c8bd1ff053d706a31033`;
- all seven financial uniqueness indexes introduced by steps 3, 5, and 7 are
  present, unique, valid, ready, immediate, and match their exact table,
  ordered-column, and predicate shape;
- both reimbursement triggers introduced by step 5 are enabled, point to the
  expected `SECURITY INVOKER` helpers, and match their recorded definitions;
- `create_invoice_atomic` and
  `link_estimate_milestone_invoice_with_activity` exist with their reviewed
  signatures, are `SECURITY INVOKER`, and retain the ACL assumed by step 11;
- `estimates`, `estimate_payment_schedule_items`, `invoices`, and
  `estimate_activity_events` exist with the columns, constraints, and data
  states required by the wrapper;
- the Production application remains compatible with steps 1–10 while the
  wrapper is absent, and the exact successor application is not deployed;
- the named operator can list the selected completed physical backup and has
  recorded the restore limitation in the linked operator record.

The canonical SQL begins with `SET TRANSACTION READ ONLY`, ends with
`ROLLBACK`, returns no business rows, and records the exact migration counts,
table/function/ACL prerequisites, the seven named index contracts, the two
named trigger contracts, duplicate association count, and four
Invoice↔milestone consistency counts. Before step 11, steps 1–10 must each be
`1`, step 11 must be `0`, the latest version must be `20260830204500`, every
required object/ACL/index/trigger result must match the script contract, and
the Production association-count tuple must match the reviewed pre-existing
baseline below. Any different fingerprint or count is reviewed drift, not a
value to overwrite in this manifest.

### Reviewed pre-existing Production association baseline

The 2026-09-01 read-only preflight found this exact ordered tuple:

| Count                                                 | Baseline |
| ----------------------------------------------------- | -------: |
| Linked Invoice with non-`invoiced` status             |        0 |
| `invoiced` status with no Invoice link                |        1 |
| Invoice link whose Invoice row is absent              |        0 |
| Invoice link with no `draft_invoice_created` activity |        1 |
| One Invoice linked to multiple milestones             |        0 |

Both non-zero records were last updated in May 2026, before the August 2026
activity-timeline migration and before this successor. They are pre-existing
historical data conditions, not step-11 output. This rollout does not authorize
a data repair. Step 11 performs no business-data rewrite, so every count must
remain exactly equal before and after migration. Any delta is `STOP`; future
remediation requires a separate financial-integrity review and authorization.

Run the linked dry-run with the pinned CLI and exact target. It must report
only step 11, with no seed or role changes:

```sh
fnm exec --using=22 npx supabase db push --linked --dry-run --skip-vault
```

The verified pre-deploy result was one pending migration,
`20260901042341_invoice_milestone_atomicity.sql`, with empty seed and role
sets. Repeat this read-only command immediately before opening the authorized
window. Any additional, missing, reordered, or renamed artifact is `STOP`.

Any mismatch is a stop condition. Do not “fix” preflight drift inside the
change window or alter the migration ledger to make the release appear pending.

### 4. Authorized write shape — not executed by this gate

Only after explicit authorization naming the exact clean successor commit,
migration blob, target, operator, and open window may the operator run:

```sh
fnm exec --using=22 npx supabase db push --linked --skip-vault
```

Do not use `--include-all`: Production already has steps 1–10. Stop if the CLI
does not present exactly step 11. This document records the future command
shape only; the pre-deploy gate must not execute it.

## Verification map

The immediate catalog checks in the ledger are mandatory. After the complete
local chain, the authoritative pgTAP mapping is:

- Steps 1–2:
  `supabase/tests/estimate_financial_persistence_hardening.sql` plus
  `supabase/tests/database/008_financial_rpc_acl.sql`.
- Step 3: `supabase/tests/database/001_payment_received_atomic.sql` and
  `supabase/tests/database/007_financial_index_and_fk_integrity.sql`.
- Step 4: `supabase/tests/database/002_payroll_settlement_atomic.sql`.
- Step 5: `supabase/tests/database/003_reimbursement_payment_atomic.sql`,
  `supabase/tests/database/004_invoice_create_update_atomic.sql`, and
  `supabase/tests/database/007_financial_index_and_fk_integrity.sql`.
- Step 6:
  `supabase/tests/database/007_financial_index_and_fk_integrity.sql`.
- Steps 7–8: `supabase/tests/database/005_expense_bank_atomic.sql` and
  `supabase/tests/database/007_financial_index_and_fk_integrity.sql`.
- Step 9: `supabase/tests/database/006_current_operational_metadata.sql`.
- Step 10: `supabase/tests/database/008_financial_rpc_acl.sql`.
- Step 11: `supabase/tests/database/009_estimate_milestone_invoice_atomic.sql`.
- Whole chain: `supabase/tests/database/000_financial_rls_smoke.sql` and the
  full `npm run test:db:local` suite.

The financial suites must retain exact amount/association evidence and the
success, failure-before-write, partial-failure rollback, retry, duplicate, and
idempotency assertions. Catalog checks alone do not prove financial semantics.

## Recovery and forward-fix rules

1. Stop at the first failure. Keep the old application deployed and capture the
   SQLSTATE, failed statement, ledger state, index validity, constraint
   validation, function definitions, ACL, and affected-row counts. Do not
   blindly retry.
2. If a version is recorded, never remove or repair its ledger row. Correct any
   defect with a newly generated, reviewed forward migration after the last
   recorded version.
3. Step 11 defines one transaction-scoped Invoice/milestone RPC and its ACL and
   performs no business-data rewrite. If the migration command fails or times
   out, inspect the migration ledger, exact function definition, owner,
   `prosecdef`, grants, and schema reload state before deciding anything. Never
   blindly retry an ambiguous response.
4. Step 11 has no certified down migration. Never improvise destructive SQL or
   remove a recorded version. Preserve data and correct a defect with a newly
   generated, reviewed forward migration after `20260901042341`.
5. Physical backup restore is an incident action, not the normal rollback for
   this additive wrapper. It requires separate authorization, accepted data
   loss/downtime, and the exact completed backup recorded by the operator.
6. If database rollout succeeds but application deployment fails, do not roll
   back the database merely to force the deploy. Keep the compatible prior app
   running, reconcile the recorded database state, and forward-fix or redeploy
   the reviewed application artifact.

## Final post-check and application release

Before application deployment, record all of the following:

- step 11 appears exactly once after step 10, with no other newly recorded
  version;
- `create_estimate_milestone_invoice_atomic(text,jsonb,jsonb,uuid,uuid,uuid,text)`
  exists, is `SECURITY INVOKER`, has the expected source definition, and is
  executable only by `service_role` (not `PUBLIC`, `anon`, or `authenticated`);
- `create_invoice_atomic` and
  `link_estimate_milestone_invoice_with_activity` remain unchanged and retain
  their reviewed ACL;
- existing Invoice, Estimate milestone, activity, and amount rows are unchanged
  by this schema-only migration;
- the migration ledger, function ACL, and application/schema compatibility
  checks match the local step-11 pgTAP contract;
- both successor application entrypoints use the atomic wrapper and contain no
  direct Invoice graph cleanup on ambiguous linkage responses;
- the canonical preflight's duplicate/association counts remain exactly
  `(0, 1, 0, 1, 0)` in the table's order with no before/after delta, while step
  11 changes from absent to recorded once;
- PostgREST schema reload completed and read-only health checks report no schema
  cache or permission error.

Only then deploy the exact reviewed successor application artifact that records
step 11 and these release-gate changes.
Keep the scoped milestone-Invoice write freeze active until the exact successor
deployment and read-only health check are recorded; do not leave the compatible
but non-atomic parent application open for milestone-Invoice writes after step 11.
Perform only the separately authorized smoke checks; do not create or mutate
Production financial data for verification. Any post-check failure keeps the
release open for incident handling and a forward fix—it is not permission to
rewrite history.
