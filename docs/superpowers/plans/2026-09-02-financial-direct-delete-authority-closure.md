# Financial Direct Delete Authority Closure Implementation Plan

> **For agentic workers:** Follow this plan with TDD, one bounded implementation area at a time, and obtain a code-quality review before release. Do not change Production UI/UX.

**Goal:** Eliminate every direct table DELETE path for `worker_payments` and `ap_bills`, preserve only the audited atomic RPC paths, close remaining request-identity mismatches, and make the named financial reads fail closed.

**Architecture:** Table DELETE is removed from all API-facing roles and DELETE/ALL RLS policies are removed or split. The two audited delete RPCs become tightly granted `SECURITY DEFINER` functions with an empty `search_path`, fully-qualified objects, and JWT-based owner/admin or service-role authorization. Application requests use one canonical Bearer parser so the verified user and query client cannot diverge. Financial read helpers throw the existing typed availability error for source failures while retaining legitimate empty and zero results.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS/SSR, PostgreSQL/RLS, pgTAP, Vitest, Playwright, Vercel.

**Spec:** Current user authorization in the 2026-09-02 HH Group Security / Financial Reliability Hardening task; HH Group `AGENTS.md` authority boundaries apply.

---

## Task 1: Add RED direct-delete and privileged-RPC database tests

**Files:**

- Modify: `supabase/tests/database/011_security_financial_hardening.sql`
- Modify: `scripts/check-rollback-sql.mjs`
- Create after migration generation: `supabase/rollbacks/<generated_version>_financial_delete_authority_closure.rollback.sql`

1. Replace the old `SECURITY INVOKER` expectations for the two delete RPCs and worker-payment trigger with `SECURITY DEFINER`, empty-search-path, exact ACL, and owner checks.
2. Assert `PUBLIC`, `anon`, `authenticated`, and `service_role` have no direct DELETE privilege on either table.
3. Assert neither table has an API-role DELETE/ALL policy; retain authenticated/service-role SELECT, INSERT, and UPDATE only.
4. Exercise raw DELETE denial under authenticated owner claims and service-role claims.
5. Exercise authorized atomic RPC success, replay, rollback, dependency denial, and unauthorized-role denial.
6. Run the database test and record the expected pre-migration failures.

## Task 2: Implement one forward-only database migration

**Files:**

- Create with `supabase migration new`: `supabase/migrations/<generated_version>_financial_delete_authority_closure.sql`
- Create: matching rollback probe SQL under `supabase/rollbacks/`

1. Revoke direct DELETE on both tables from every API role, including `service_role`; revoke all target-table privileges from `PUBLIC`/`anon` and re-grant only existing legal non-delete capabilities.
2. Drop all worker-payment DELETE/ALL policies. Replace the AP-bill owner/admin `FOR ALL` policy with separate SELECT, INSERT, and UPDATE policies using the identical predicate.
3. Replace both atomic RPC bodies with fully-qualified, empty-search-path, `SECURITY DEFINER` versions. Never authorize through `current_user`; require either JWT `role=service_role` or JWT app metadata role `owner|admin`.
4. Make the worker-payment delete trigger helper a non-executable, empty-search-path `SECURITY DEFINER` routine so it can perform only its trigger work.
5. Revoke all function execution and grant only the two RPCs to `authenticated` and `service_role`; grant no trigger-helper execution.
6. Provide a confirmation-guarded rollback script that restores the exact prior privileges, policies, and invoker function definitions for local rollback probing only.
7. Run clean local migration replay, pgTAP, and rollback probe.

## Task 3: Bind Bearer verification to query identity

**Files:**

- Create: `src/lib/request-authorization.ts`
- Modify: `src/lib/supabase-server.ts`
- Modify: `src/lib/auth-boundary.ts`
- Modify: `src/middleware.ts`
- Modify tests: `src/__tests__/route-supabase-client-auth.test.ts`, `src/__tests__/auth-security-primitives.test.ts`, `src/__tests__/middleware-auth-rollout.test.ts`

1. Add failing tests for canonical, alternate-case, tab/extra-whitespace, malformed, invalid, absent, and cookie-conflict Authorization cases.
2. Implement one runtime-neutral parser returning absent, malformed, or canonical `Bearer <token>`.
3. Make the server client, request guard, user verifier, and middleware use the same parser and canonical forwarded header.
4. A presented malformed/invalid Bearer must fail closed and must never fall back to cookies; an absent header retains cookie/anonymous behavior.
5. Run the focused auth tests and source contracts.

## Task 4: Remove Worker DELETE service-role substitution and swallowed errors

**Files:**

- Modify: `src/app/api/labor/workers/[id]/route.ts`
- Modify: `src/lib/labor-db.ts`
- Create/modify tests: `src/__tests__/api/labor/worker-delete.test.ts`, a focused labor DB test, and `tests/production-security-baseline-closure-contract.test.mjs`

1. Add failing tests proving the route passes the guarded request-scoped client, returns dependency conflict, and returns server failure for a database delete rejection.
2. Change only the DELETE handler to `requireSupabaseOwnerOrAdminRequestClient`, preserve session cookies, and pass `guard.client` through eligibility and deletion.
3. Capture and throw the underlying Supabase delete error in `laborDb.deleteWorker`.
4. Run focused API, helper, and source-contract tests.

## Task 5: Make Project and Bulk Invoice reads typed and fail closed

**Files:**

- Modify: `src/lib/expenses-db.ts`
- Modify: `src/lib/invoices-db.ts`
- Modify tests: `src/__tests__/lib/financial-read-availability.test.ts`

1. Add failing tests for permission, schema, network, null/invalid, and unavailable results in project expense-line/header/detail and bulk invoice item reads.
2. Preserve true `[]` and true not-found behavior where the query succeeded.
3. Throw `FinancialDataUnavailableError` for source errors, null data where a collection is required, invalid rows, and an expense-line whose referenced header is unavailable.
4. Preserve all formulas, amounts, lifecycle rules, and returned successful-data shapes.
5. Run focused financial availability and regression tests.

## Task 6: Local release gate and reviews

1. Run independent spec-compliance and code-quality review; resolve every P0/P1 finding through a failing test.
2. Run full Vitest, pgTAP, migration chain/clean replay, rollback probe, source contracts, targeted Playwright/API tests, production build, typecheck, lint, financial regression, and `git diff --check`.
3. Confirm no visual files or behavior changed, no unexpected financial delta, no console/page errors, and no unexpected 4xx/5xx.

## Task 7: Production security window and exact release

1. Compute and record the new migration checksum.
2. Production dry-run must show exactly one pending migration: the generated closure migration. Stop immediately on any other pending migration or checksum mismatch.
3. Apply only that migration; do not seed, mutate business data, or call destructive RPCs.
4. Perform catalog-only postflight for table ACLs/policies, function security/search path/owner/ACL, and unauthorized roles.
5. If postflight passes, stage only the audited hardening files, commit, push that exact commit, deploy that exact commit, and verify the deployed SHA.
6. Run a non-destructive Production smoke covering authentication identity and protected read boundaries. Stop before commit/deploy if any security postflight fails.
