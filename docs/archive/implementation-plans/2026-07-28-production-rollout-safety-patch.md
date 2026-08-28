# Production Rollout Safety Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `HH_REQUIRE_LOGIN` an explicit, server-only rollout switch that prevents an accidental production lockout while keeping receipt and security APIs strictly authenticated.

**Architecture:** A single pure resolver in `src/lib/owner-access-mode.ts` parses the server environment into strict or compatibility mode and reports only safe enum state. Middleware and route guards consume the same compatibility decision. Next.js instrumentation logs the resolved state once per Node runtime. Manual rollback SQL lives outside `supabase/migrations` and requires an operator-set session confirmation before policy restoration.

**Tech Stack:** Next.js App Router middleware/instrumentation, TypeScript, Vitest, Playwright, PostgreSQL/Supabase RLS and Storage policies.

---

### Task 1: Lock rollout semantics with failing unit tests

**Files:**

- Create: `src/__tests__/auth-rollout-mode.test.ts`
- Modify: `src/__tests__/auth-security-primitives.test.ts`

- [ ] Add table-driven tests proving `1`/`true` resolve to strict mode and `0`/`false` resolve to compatibility mode.
- [ ] Add production tests proving unset and invalid values resolve to compatibility mode with observable `unset` or `invalid` configuration state.
- [ ] Add local-access tests proving compatibility access also requires non-production runtime and `HH_ALLOW_LOCAL_NO_LOGIN=1`.
- [ ] Add logging tests proving only mode, runtime, and configuration state are logged and the invalid raw value is absent.
- [ ] Run `npx vitest run src/__tests__/auth-rollout-mode.test.ts src/__tests__/auth-security-primitives.test.ts` and confirm RED failures are caused by the missing resolver.

### Task 2: Lock middleware and strict-route behavior with failing tests

**Files:**

- Create: `src/__tests__/middleware-auth-rollout.test.ts`

- [ ] Add tests invoking the real Next.js middleware for anonymous dashboard and API requests.
- [ ] Prove strict mode redirects an anonymous page and returns API 401.
- [ ] Prove production compatibility mode allows an existing non-sensitive page.
- [ ] Prove receipt manifest/Replace and Settings Security remain strict in compatibility mode.
- [ ] Prove client headers and query parameters cannot impersonate an owner or change the resolved rollout mode.
- [ ] Run `npx vitest run src/__tests__/middleware-auth-rollout.test.ts` and confirm RED on production compatibility behavior.

### Task 3: Implement the shared rollout resolver and startup logging

**Files:**

- Modify: `src/lib/owner-access-mode.ts`
- Modify: `src/middleware.ts`
- Modify: `src/lib/auth-boundary.ts`
- Modify: `src/instrumentation.ts`

- [ ] Add `resolveAuthRolloutConfig()` with `strict | compatibility` mode and `enabled | disabled | unset | invalid` state.
- [ ] Make exact `1`/`true` strict; make `0`/`false`, unset, and invalid compatibility.
- [ ] Make compatibility access automatic for deployed production/preview runtimes, but require `HH_ALLOW_LOCAL_NO_LOGIN=1` in development/test/unknown runtimes.
- [ ] Keep strict mode dominant over every compatibility path.
- [ ] Replace duplicated middleware/route-guard decisions with the shared helper.
- [ ] Log the resolved enums and a temporary-compatibility removal warning from `src/instrumentation.ts`; never log raw environment values.
- [ ] Re-run Tasks 1–2 tests and confirm GREEN.

### Task 4: Add manual-only rollback SQL and contract tests

**Files:**

- Create: `supabase/rollbacks/20260728095543_authenticated_owner_access.rollback.sql`
- Create: `supabase/rollbacks/20260728105015_receipt_storage_security_phase1.rollback.sql`
- Create: `src/__tests__/rollback-sql-contract.test.ts`
- Create: `scripts/check-rollback-sql.mjs`
- Modify: `package.json`

- [ ] Add RED contract tests requiring explicit session confirmation, `BEGIN`, no automatic `COMMIT`, and no historical-row or Storage-object deletion.
- [ ] Require Migration A rollback to preserve new security/audit tables and state that the cleared legacy PIN cannot be reconstructed.
- [ ] Rebuild the captured `attachments_insert`, `attachments_update`, and `attachments_delete` policies idempotently and restore anon grants only for an explicitly accepted emergency.
- [ ] Require Migration B rollback to restore `receipts.public=true`, keep `expense-attachments.public=false`, and recreate the exact ten captured baseline policies.
- [ ] Assert neither rollback rewrites receipt references or removes cleanup evidence.
- [ ] Add a local-only transactional syntax checker that executes each script against Docker Supabase and forces rollback.
- [ ] Run the contract tests and local syntax checker; confirm GREEN without persistent schema changes.

### Task 5: Add production readiness documentation

**Files:**

- Create: `docs/AUTH_RECEIPT_PRODUCTION_ROLLOUT.md`
- Modify: `docs/superpowers/specs/2026-07-27-authenticated-owner-access-receipt-security-design.md`

- [ ] Document all `HH_REQUIRE_LOGIN` states and the local no-login constraints.
- [ ] Document owner creation, `app_metadata.role`, signup disablement, SMTP/recovery, exact redirects, preview verification, migration order, alias promotion, and observation-period gate removal.
- [ ] Document Migration A/B rollback order, session confirmation, irreversible legacy-PIN clearing, object/reference preservation, and emergency owner recovery.
- [ ] Remove contradictory statements that production always requires Auth when `HH_REQUIRE_LOGIN` is unset.

### Task 6: Run focused and full verification

**Files:**

- Test only; no production or deployment changes.

- [ ] Run `git diff --check`.
- [ ] Run `npm run lint`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run check:migration-filenames`.
- [ ] Run `npm run check:migration-order`.
- [ ] Run `npm run check:schema-preflight`.
- [ ] Run focused Auth/config/rollback Vitest suites.
- [ ] Run the Auth/API/Receipt Playwright bundle, Receipt Viewer regression, Upload/OCR regression, and Quick Actions routing regression against local Docker Supabase.
- [ ] Confirm teardown removes local Auth fixtures and no production URL was used.
- [ ] Review `git diff` and confirm `supabase/.temp/cli-latest` remains untouched and excluded.
