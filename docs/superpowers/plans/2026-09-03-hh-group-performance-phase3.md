# HH Group Performance Optimization Phase 3 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the measured Project Detail correctness/performance blockers and the proven Dashboard, AR, Workers, and Invoice Detail critical-path waste without changing financial formulas, business behavior, security boundaries, or the frozen UI architecture.

**Architecture:** Every protected read in scope uses one verified request-scoped Supabase client. Financial and required data errors propagate to an explicit unavailable response; only successful empty datasets become zero/empty UI. Route read models consolidate identical source reads, active Project Detail tabs avoid unrelated heavy reads, and browser/server timing is limited to duration/category metadata.

**Tech Stack:** Next.js 14 App Router, React 18 Server/Client Components, Supabase SSR/PostgREST, Vitest, Playwright, Vercel-compatible Server-Timing.

---

## Task 1: Freeze the evidence and failure contracts

**Files:**

- Create: `src/__tests__/project-detail-phase3-performance.test.ts`
- Create: `src/__tests__/lib/ar-route-read-model.test.ts`
- Create: `src/__tests__/lib/workers-balance-batch.test.ts`
- Create: `src/__tests__/lib/invoice-detail-initial-data.test.ts`
- Modify only as needed: existing focused financial/auth tests

1. Add behavior tests for permission/schema/network failure versus successful empty results.
2. Add counted fake-client tests for identical read consolidation and request-scoped client identity.
3. Add a normal-mode snapshot test proving legacy comparison is not executed.
4. Add exact financial-output fixtures before implementation.
5. Run the focused tests and confirm they fail for the intended missing behavior.

## Task 2: Repair Project Detail identity and fail-closed behavior

**Files:**

- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `src/app/api/projects/[id]/financial-snapshot/route.ts`
- Modify: `src/lib/financial/project-financial-snapshot-db.ts`
- Modify: request helpers reached by Project Detail only where an explicit client is missing

1. Replace the discarded guard plus extra clients with `requireSupabaseOwnerOrAdminServerActionClient({ noStore: true })`.
2. Thread `guard.client` through every loaded helper; remove internal/service-role/implicit-anon reads from this request.
3. Remove broad `safe(fn, fallback)` conversion. Required failures render the existing neutral server data fallback; successful `[]`/`null` remain valid.
4. Route Handler uses `requireSupabaseOwnerOrAdminRequestClient`, returns non-200 for unavailable/not-found, and never caches the result.
5. Snapshot sources that affect displayed amounts fail closed on permission/schema/network/unavailable data.
6. Run focused auth, availability, and Project Detail tests.

## Task 3: Collapse the Project Detail graph without changing the workspace UI

**Files:**

- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `src/app/projects/[id]/project-detail-tabs-client.tsx`
- Modify: `src/app/projects/[id]/project-financial-snapshot-comparison-panel.tsx`
- Modify: invoice/project helper modules as required

1. Keep the existing server canonical-profit promise reuse.
2. Replace the normal hydration comparison graph with one new-snapshot read; run legacy comparators only for `debugFinancial=1`.
3. Consolidate project billing and invoice display reads so invoice headers/items/payments are read once and there is no per-invoice payment lookup.
4. Gate unrelated heavy datasets by the parsed workspace tab. Tab selection keeps immediate visual state and requests the corresponding server data without redesigning the tab UI.
5. Remove unreachable legacy Project Detail data loads from the hot path.
6. Prove exact billing/profit/margin/AR equality with fixtures and rerun focused tests.

## Task 4: Consolidate Revenue / AR reads

**Files:**

- Modify: `src/lib/invoices-db.ts`
- Modify: `src/lib/data/index.ts` or add a focused AR read-model module
- Modify: `src/app/financial/ar/page.tsx`
- Test: `src/__tests__/lib/ar-route-read-model.test.ts`

1. Load invoice headers/items, payments, and projects once using `guard.client`.
2. Derive the existing summary and outstanding rows from the same successful inputs.
3. Assert 8 to 4 table reads, maximum two dependent waves, exact formula parity, and fail-closed errors.

## Task 5: Reuse the Dashboard project/canonical graph

**Files:**

- Modify: `src/app/dashboard/dashboard-bundle.ts`
- Modify: `src/app/dashboard/dashboard-main-section.tsx`
- Modify: `src/lib/data/index.ts` only for a pure risk reducer if needed
- Create/modify: focused Dashboard bundle test

1. Extract a pure risk calculation that consumes the already loaded projects and canonical profit map.
2. Return stats, contract review, and risk from one request-scoped bundle.
3. Remove the second project list, second canonical batch, and per-project source reload.
4. Do not merge adjacent reads whose filters or semantics differ.
5. Assert `18 + N` to `9` project/risk reads and exact output parity.

## Task 6: Batch Workers balance reads

**Files:**

- Modify only the audited Workers loader/helper files
- Test: `src/__tests__/lib/workers-balance-batch.test.ts`

1. Replace per-worker reads with the existing-table batched query proven by the audit.
2. Use one request-scoped client, narrow columns, and aggregate in memory with identical formulas.
3. If the audit proves a migration/RPC/index is required, document it instead of changing schema.
4. Assert query-count and output parity for 0, 1, and many workers.

## Task 7: Shorten Invoice Detail initial load

**Files:**

- Modify only the audited Invoice Detail route/page/client/helper files
- Test: `src/__tests__/lib/invoice-detail-initial-data.test.ts`

1. Preserve the current Invoice financial authority and all interaction behavior.
2. Move only safe initial data to the server or consolidate the API waterfall, based on the audit evidence.
3. Parallelize reads whose only dependency is the invoice id; retain true project/attachment dependencies.
4. Reduce initial client hydration data only when behavior tests prove parity.

## Task 8: Add privacy-safe route timing

**Files:**

- Modify: `src/middleware.ts`
- Create/modify: a small timing utility and tests
- Instrument only the scoped server read models/routes where headers can be set accurately

1. Emit allow-listed `Server-Timing` categories for middleware/auth where accurately measured.
2. Record server-data stages as structured durations without user ids, paths containing entity ids, SQL, tokens, payloads, or secrets.
3. Use browser RSC/resource timing for response/render/total stages that Server Components cannot place on response headers in Next.js 14.
4. Verify unauthenticated/forbidden behavior and response cookies are unchanged.

## Task 9: Verify Local and document Production limits

**Files:**

- Create/update: `reports/performance/2026-09-03/HH_GROUP_PERFORMANCE_PHASE3.md`

1. Run focused Vitest suites, financial integrity suites, auth/security contracts, typecheck, lint, and production build.
2. Run authenticated Local browser measurements at 1440×900, 820×1180, and 390×844 for Project Detail, Dashboard, AR, Workers, and Invoice Detail when a safe fixture exists.
3. Record click feedback, RSC start, server stages, FUC, settle, request counts, slowest request, console/page errors, and exact financial fields.
4. Production remains read-only and undeployed; compare only the existing deployment and clearly label post-change Production metrics unavailable until an authorized deploy.
5. Restore browser viewport/tabs and stop the local Next/Supabase processes started for this task.
6. Do not push, deploy, or apply any migration.
