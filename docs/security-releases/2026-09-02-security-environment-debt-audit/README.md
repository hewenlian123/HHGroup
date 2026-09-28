# HH Group Security and Environment Debt Audit

Status: **AUDIT COMPLETE — REPAIR REQUIRED**\
Audit date: 2026-09-02 (Pacific/Honolulu)\
Application baseline: `1ded58d39a7319317e20b0ff580cd9c435152b6e`\
Certified UI/UX lineage: `8c2bd100b507d0359ce2f7d62a1d1adcb4436f43`

## Scope and evidence boundary

This was a read-only audit of repository code, migrations, tests, local Supabase catalog state, and local runtime configuration. It did not connect to or modify the Production database, change UI code, change business or financial logic, push, or deploy.

Database findings below are **proven in the current local clean-replay catalog**. Production exposure must be confirmed through a separately authorized, read-only catalog preflight before any repair migration is approved.

The frozen presentation authority is defined in [`docs/architecture/HH_GROUP_GLOBAL_UI_UX_BASELINE.md`](../../architecture/HH_GROUP_GLOBAL_UI_UX_BASELINE.md).

## Executive classification

| ID          | Classification                         | Finding                                                                                                                       | Local evidence                                                                  | Production state                                         |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| SEC-P0-01   | P0 SECURITY                            | Anonymous Data API CRUD remains effective on Operations tables                                                                | Confirmed on `project_tasks`, `punch_list`, `site_photos`, and `inspection_log` | Not queried in this audit                                |
| SEC-P0-02   | P0 SECURITY                            | `record_subcontract_payment(...)` is an anonymously executable `SECURITY DEFINER` financial RPC                               | Confirmed in migration and local catalog                                        | Not queried in this audit                                |
| FIN-P0-01   | Financial release P0 / Security P1     | Worker-payment delete/reversal spans independent writes and can partially commit if the final delete fails                    | Confirmed in route implementation                                               | Code lineage applies; Production execution not attempted |
| SEC-P1-01   | P1 SECURITY                            | Draft AP-bill delete treats dependency-read failure as permission to delete                                                   | Confirmed in helper implementation                                              | Code lineage applies                                     |
| SEC-P1-02   | P1 SECURITY                            | Worker-delete eligibility can convert dependency-read errors into zero dependencies                                           | Confirmed in list/delete paths                                                  | Code lineage applies                                     |
| SEC-P1-03   | P1 SECURITY / availability             | Cash Flow callers use an anonymous fallback for protected `subcontract_payments`; downstream consumers may display false zero | Confirmed in client wiring and local RLS                                        | Code lineage applies                                     |
| FIN-P1-01   | P1 financial availability              | Protected financial reads commonly collapse permission/schema/network failure into `$0`, `[]`, or partial data                | Confirmed across shared financial helpers                                       | Code lineage applies                                     |
| INFRA-P1-01 | TEST INFRA                             | Schema auto-repair is non-transactional, continues after statement failure, and is inactive without a direct DB URL           | Confirmed in test bootstrap and environment shape                               | Local only                                               |
| INFRA-P1-02 | TEST INFRA                             | Current schema preflight/pgTAP coverage does not detect the Operations ACL or financial RPC findings                          | Confirmed by passing preflight plus catalog findings                            | Local only                                               |
| OPS-P1-01   | Operational assurance P1 / Security P2 | Reconciliation/integrity scanners can report success when all required protected tables are unavailable                       | Confirmed in scanner control flow                                               | Code lineage applies                                     |

## RLS and ACL findings

### P0: anonymous Operations access

The local catalog proves that RLS is enabled but permissive `anon` policies and table grants combine to provide effective direct Data API CRUD on:

- `project_tasks`
- `punch_list`
- `site_photos`
- `inspection_log`

Anonymous publishable-key GET requests were also observed returning `200` locally for `punch_list` and `site_photos`; `site_photos` returned data. No anonymous write was attempted.

The source migrations are:

- `supabase/migrations/202603250000_project_tasks_schedule_activity.sql`
- `supabase/migrations/202604271515_punch_list.sql`
- `supabase/migrations/202604271517_site_photos_inspection_log.sql`

The later anonymous-write closure migration does not include these Operations tables. `project_schedule` retains broad `anon` table grants locally, but no matching anonymous policy currently exists, so RLS denies effective access; this is grant residue, not a currently proven anonymous CRUD path.

Required repair direction: first make all Operations routes use one request-scoped authenticated client, then use a forward-only migration to revoke `PUBLIC`/`anon` privileges and remove permissive policies. Do not grant new anonymous access and do not replace user-scoped access with browser-visible service credentials.

### P0: financial SECURITY DEFINER RPC

`record_subcontract_payment(uuid, uuid, date, numeric, text, text)` is owned by `postgres`, executes as `SECURITY DEFINER`, writes `subcontract_payments`, updates bill status, and has executable privilege for `PUBLIC`/`anon` in the local catalog. It therefore bypasses the otherwise correct table-level RLS boundary.

Source: `supabase/migrations/202603111800_subcontracts_status_and_subcontract_bills_due_date.sql`. The current financial ACL pgTAP suite does not cover this function.

Required repair direction: revoke `PUBLIC` and `anon`; choose an explicitly reviewed authenticated owner/admin or narrow server-only execution path; preserve the existing calculation and status semantics; add exact allow/deny, retry, reconciliation, and rollback tests.

### Accepted local Cash Flow warning

`subcontract_payments` itself has the correct local posture: no anonymous table privilege or anonymous policy; authenticated CRUD is constrained by the owner/admin financial policy; `service_role` remains privileged. The local `42501` warning is therefore an expected denial, not evidence that RLS should be loosened.

The defect is caller identity: `src/lib/subcontract-payments-db.ts` defaults to an anonymous client when no authenticated client is supplied, and several Cash Flow/project/subcontract callers omit it. Some consumers then convert the denial into `$0` or `[]`. Repair the client and availability contract, not the RLS policy.

## Auth and session findings

### P1/P2: credential and query-client mismatch

`getSupabaseUserFromRequest` accepts bearer credentials first, while `createRouteSupabaseClient` forwards `Authorization` only when each caller opts in. Several protected project, invoice, bill, schedule, and site-photo routes can therefore authenticate one identity and query or mutate with a cookie-backed or anonymous client.

The financial-write release risk is P1; the generic security severity is P2 because exploitation still requires a valid privileged credential. The minimal repair is a single request-scoped result containing authentication source, user, role, Supabase client, and response-cookie handling. Guard and query must share that client. A present but invalid bearer token must fail closed instead of silently changing identity source.

The recently repaired Operations GET routes correctly use strict guarding plus authorization forwarding and must not regress. Several Operations write routes still use server-side anonymous helpers; that wiring must be fixed before closing anonymous database access.

### P2: privileged helper ambiguity

The internal server client can select `service_role` when configured and anonymous credentials otherwise. That environment-dependent identity changes RLS behavior. Split explicit server-only privileged helpers from authenticated user clients, add a `server-only` import boundary, and remove privileged-to-anonymous fallback.

No service credential exposure to browser code was found.

### P2: middleware device-lock coherence

Bearer authentication and the device-lock RPC do not always use the same credential source, and device-lock RPC failure can degrade to “no lock required.” The observed path still requires a valid owner bearer plus a trusted-device cookie, so this is not classified as an unauthenticated P0. It remains a fail-closed consistency debt.

## Fail-closed findings

### Financial release P0: worker-payment reversal/delete

Worker-payment deletion performs reimbursement/labor reversal writes separately from the final delete. Some reversal errors are logged and execution continues; one fallback update result is unchecked. The database has a `BEFORE DELETE` reversal trigger, so a successful delete may restore consistency, but if an earlier independent update succeeds and the later delete fails, the payment remains while dependent rows may already be reopened or unlinked.

Required repair direction: one database transaction/RPC enforcing authorization, row locking, reversal, delete, idempotency, and reconciliation. Do not suppress errors or reinterpret them as success.

### P1: destructive eligibility reads

- Draft AP-bill delete catches dependency-query failure and proceeds; payment rows are currently cascade-linked.
- Worker-delete eligibility maps some dependency-read failures to zero and may permit deletion or loss of attribution.

Both paths need transactional, fail-closed database invariants and explicit unavailable/error results before destructive action.

### P1: systemic protected-read availability

Invoice, deposit, subcontract-payment, expense, worker, commission, owner-dashboard, and Estimate metadata helpers frequently return real-looking zero/empty/partial values for permission, schema, or network errors. This is one systemic contract problem: “valid zero” and “unavailable” are not distinguishable.

Repair destructive-action and core financial-summary consumers first with a typed availability contract. Optional activity-only feeds may keep bounded degradation only when the UI visibly reports that data is unavailable.

### P2: monitoring false-green paths

- Financial reconciliation and integrity scanners can return an all-clear result when all required table reads are unavailable.
- `/api/system-health` does not validate the nested schema-check response status and does not forward the current authorization header; a nested 401/500 can be interpreted as empty or successful.
- Several Operations presentation helpers collapse query errors into null/404 or ignore storage-deletion errors.

The scanners are owner/admin, manual, read-only paths with no auto-fix, so their direct security severity is P2; their operational-assurance impact is P1.

## Environment and test infrastructure

### Local E2E session boundary

The E2E harness is intentionally local and mutation-capable. It loads `.env.local`, provisions local users, seeds/cleans the local database, and refuses hosted `supabase.co` targets. No `.env.test` or `.env.e2e` exists, so local test isolation depends on correct `.env.local` values and the browser mutation guard.

This is accepted for local testing, but Playwright is not currently a normal CI gate. Add an isolated local-Supabase CI job before treating browser authorization coverage as continuous assurance.

### Direct DB URL and schema auto-repair gap

The local environment has no `SUPABASE_DATABASE_URL` or `DATABASE_URL`. Schema auto-repair is therefore skipped. When enabled, its large DDL sequence runs statement-by-statement, logs failures, and continues without a transaction. It can leave a partially repaired schema and can recreate legacy permissive policies.

Migrations must be the schema authority. Replace broad auto-repair with a deterministic clean replay plus a strict drift check, or make any bounded test repair transactional and fail-fast.

### Security gate coverage gap

`check:schema-preflight:strict` passes locally but did not detect the anonymous Operations access or callable financial RPC. Add catalog assertions covering:

- effective `PUBLIC`/`anon` table privileges;
- effective anonymous policies on all exposed tables;
- `SECURITY DEFINER` ownership, `search_path`, and execute privileges;
- route authentication/query-client identity;
- explicit allow/deny matrices for anonymous, authenticated non-admin, owner/admin, and service-only paths.

### Runtime/dependency drift

- `.nvmrc`, `package.json`, CI, and `vercel.json` currently align on Node 22. Documentation still contains stale Node 20/dashboard-runtime wording; classify as P2 maintenance.
- Vitest 4.1.0, Vite 8.0.0, Node 22.23.2, and jsdom 29.0.1 are locally compatible; no collection hang was reproduced after the existing `test.dir = "./src"` correction.
- `caniuse-lite` is a P2 lockfile-maintenance item. No warning was reproduced by the direct Browserslist query in this audit; dependency updates must be handled in a separate verified maintenance change.
- CI source lint coverage is narrower than the application source tree. Expand it independently; do not call a narrow passing lint command proof of whole-app cleanliness.

### Local system-health prerequisites

Read-only catalog checks confirmed that all tables, storage buckets, login-PIN initialization, company profile, and owner/admin prerequisites used by the local System Health route are present. This does not override the nested schema-check fail-open finding and does not establish Production health.

## False positives and accepted controls

- Anonymous denial on `subcontract_payments` is correct and must remain.
- Authenticated owner/admin RLS on protected financial tables is the intended model.
- Server-only `service_role` access is acceptable only for narrow, explicit operations with application authorization; it must never be browser-exposed.
- Current Project Profit canonical top-line reads fail closed; auxiliary category/forecast omissions remain P2 presentation/availability debt.
- Reports that surface explicit data-source warnings alongside bounded degradation are accepted.
- Operations GET session-client repair is accepted and must not regress.

## Recommended repair order

1. **Authorize a Production read-only security preflight.** Compare catalog privileges, policies, function execution ACL, owners, and `prosecdef` values with the local evidence. Do not mutate Production.
2. **Unify request-scoped authentication and Supabase client identity.** Repair Operations writes and protected financial callers first, with negative authorization tests.
3. **Close the two P0 exposure classes in one audited release window.** Forward-only migrations revoke anonymous Operations grants/policies and anonymous financial RPC execution after application callers are ready; add pgTAP/ACL/RLS tests and rollback evidence.
4. **Make worker-payment reversal/delete atomic.** Preserve formulas, attribution, history, and lifecycle semantics.
5. **Make AP-bill and worker deletion fail closed and transactional.** Remove catch-to-delete behavior and protect dependency attribution.
6. **Introduce typed financial availability results.** Prioritize destructive decisions, totals, balances, paid/status, Cash Flow, and owner dashboards.
7. **Repair assurance tooling.** Prevent false-green reconciliation/System Health results and expand security catalog checks.
8. **Replace broad schema auto-repair with deterministic clean replay/drift enforcement.** Add isolated CI browser authorization coverage.
9. **Complete P2 maintenance.** Align runtime documentation, broaden source linting, and update Browserslist data in a separately verified dependency change.

## Audit completion statement

The HH Group UI/UX baseline is frozen. This audit found actionable security, financial atomicity, and test-infrastructure debt, including two locally proven P0 security exposures. No repair was applied in this audit. Any Production verification, migration, code repair, commit, push, or deployment requires a separate authorization.
