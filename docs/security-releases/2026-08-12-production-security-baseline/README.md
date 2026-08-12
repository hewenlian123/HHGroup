# Production Security Baseline Closure — 2026-08-12

## Release boundary

This is a security-only release artifact rooted at certified UI SHA
`bed1810adc4e6eac21d13d03f3de139bd6393438`. It neither alters certified UI
composition nor mutates Production. The runtime changes only place existing
server-side labor/worker reads and mutations behind the established strict
Supabase owner/admin guard.

Forward migration: `supabase/migrations/20260812103821_production_security_baseline_closure.sql`.

Rollback: `supabase/rollbacks/20260812103821_production_security_baseline_closure.rollback.sql`.

## Canonical access model

| Table                               | anon   | authenticated non-owner | authenticated owner/admin | service_role                             |
| ----------------------------------- | ------ | ----------------------- | ------------------------- | ---------------------------------------- |
| `audit_logs`                        | denied | denied                  | denied                    | denied                                   |
| `tmp_backup_worker_advances_haijun` | denied | denied                  | denied                    | denied                                   |
| `labor_workers`                     | denied | denied                  | SELECT only               | SELECT/INSERT/UPDATE/DELETE, server-only |

`audit_logs` and `tmp_backup_worker_advances_haijun` retain every row but have
no direct Data API caller. RLS is enabled and all Data API privileges are
revoked, leaving default-deny RLS with no policy.

`labor_workers` is a live internal projection for labor foreign keys. Browser
roles receive only the owner/admin SELECT policy. Browser DML has neither a
grant nor a policy. The narrow service-role DML grant is required only for the
atomic database trigger after `requireSupabaseOwnerOrAdmin` has verified an
owner/admin request. The trigger upserts only the Worker `{id, name}` pair in
the same transaction as a Worker create or rename. The service-role key remains
server-only.

The artifact also corrects the Worker PATCH/DELETE route to pass that verified
server client to the data helper. It adds the same strict guard before the
server-rendered worker, labor, project-labor, project-profit, and worker
statement views read through an internal client.

## Preconditions and stop conditions

- Required: the three retained tables and `public.is_owner_or_admin()` exist.
- Required: `is_owner_or_admin()` derives the role from trusted `app_metadata`, and
  authenticated callers can execute it; the server-only `service_role` has `BYPASSRLS`.
  Otherwise the migration aborts.
- Required: `labor_workers.id` has a valid, ready, immediate, non-partial unique
  key, because the atomic trigger uses `INSERT ... ON CONFLICT (id)`; otherwise
  the migration aborts.
- Required at deploy: `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY`
  (or its temporary `SUPABASE_SERVICE_ROLE_KEY` fallback) are present in the app runtime.
  Privileged Worker, Labor, and Worker Payment paths deliberately return 503 rather than
  falling back to an anonymous client.
- Required: the read-only preflight records column shapes, exact row counts,
  RLS, effective ACLs, policies, `service_role` bypass capability, relevant
  foreign keys, and the worker projection trigger.
- Already satisfied: the forward migration is idempotent when the canonical
  `labor_workers_owner_admin_select` policy already exists.
- The current Production preflight observed no worker-to-projection trigger. The
  migration installs `hh_sync_worker_to_labor_workers_projection_trigger` and
  atomically backfills the projection from `workers` without deleting history.
- Incompatible: any required table/function is absent, an evidence/history
  table has an unexpected policy, or `labor_workers` has an unclassified
  policy. The migration aborts without changes.

Run `production-preflight.sql` only with an authorized read-only Production
operator. Compare its result to this release before approval; do not apply on
schema or policy drift.

## Local proof and verification

1. Confirm Node 20 (`node --version`) and run the contract test:
   `node --test tests/production-security-baseline-closure-contract.test.mjs`.
2. Apply the forward migration to an isolated local Supabase database only.
3. Run `access-matrix-verification.sql` as the local operator. Its service-role
   projection probes roll back; it leaves no rows behind.
4. Verify the Worker create/edit/archive, Labor, and Worker Payment flows with
   a real owner/admin session; verify anon and non-owner requests are denied.
5. Run the focused Receipt Security and financial regression suites. This
   artifact does not change receipt storage, financial tables, or calculations.
6. Test the guarded rollback in the isolated local database. It deliberately
   restores the documented vulnerable pre-release grants/policies only after
   `hh.rollback_confirmation` is set, and it never commits automatically.
7. Only after local proof passes, run `production-preflight.sql` read-only.

## Rollback readiness

The rollback restores the documented immediate pre-release RLS/grant posture
for a time-limited, explicitly owner-approved emergency compatibility
investigation. Because that state includes legacy anonymous access, the
operator must set `hh.rollback_confirmation` exactly, review the result, and
choose whether to commit. It contains no automatic commit and must be followed
by a new security remediation decision.

## Compatibility declaration

Receipt Security: strengthened. Both server-rendered Worker Payment receipt
surfaces now establish the strict owner/admin boundary before creating their
privileged read client. No receipt table, Storage bucket, Storage policy, or
receipt migration is touched.

Financial correctness: unchanged in data and calculation. The artifact makes
the existing Worker-to-Labor projection transactional, so Labor and Worker
Payment foreign-key behavior cannot silently drift; it does not recompute
balances, payments, advances, or receipts.
