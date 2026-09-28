# HH Group Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with independent review.

**Goal:** Remove the highest-confidence broad responsiveness costs proven by the 2026-09-02 baseline without changing UI design, financial/business semantics, security boundaries, or database schema.

**Architecture:** Preserve the current Next.js App Router and HH UI architecture. Stop speculative idle fan-out while retaining intent-driven prefetch; schedule global diagnostics after the first interaction-critical window; replace confirmed per-expense attachment N+1 reads with request-scoped batches; and reuse the exact canonical Project financial result already being computed. All database access remains request-scoped and no response may become stale or cross-user cached.

**Baseline evidence:** Local optimized-build FUC median 137.4 ms and settle median 805.5 ms across 45 core route/viewport observations. Dashboard creates 86–106 same-origin requests, 18–29 RSC requests, and 14–23 aborted prefetches. `/api/system-health` is the slowest resource in most direct samples (115–434 ms optimized build; up to 1,893 ms in dev cold-compile runs). `getExpenses` performs two attachment queries per expense in a serial loop. Project Detail invokes `getCanonicalProjectProfit` directly and again through `getProjectCostDashboard`.

**Global constraints:**

- Global UI/UX baseline remains frozen; no redesign or new visual language.
- Financial unexpected delta must remain zero. Do not change formulas, rounding, mappings, lifecycle state, or workflow.
- Security boundary changes must remain zero. Do not weaken auth/RLS, introduce service-role caching, or fail open.
- No database migration, schema/index change, push, or deploy.
- Production remains read-only.
- Preserve all unrelated user changes in the canonical checkout.

---

### Task 1: Remove automatic bulk route prefetch while retaining intent prefetch

**Files:**

- Modify: `src/lib/route-prefetch.ts`
- Modify: `src/__tests__/route-prefetch.test.ts`
- Verify unchanged consumers: `src/components/layout/sidebar.tsx`, `src/components/layout/bottom-nav.tsx`, `src/components/layout/floating-action-button.tsx`

**Evidence and expected result:** Dashboard currently emits 18–29 RSC reads and 14–23 aborted prefetches before user intent. After the change, idle automatic policy returns false at desktop/tablet/mobile hubs; hover/focus/pointer-down and the opened quick-action sheet continue to call `router.prefetch`. A clean optimized-build Dashboard should no longer fan out the owner/mobile route sets automatically.

- [ ] Write failing policy tests that `/dashboard` and `/financial` do not enable automatic bulk owner/mobile prefetch, while explicit `prefetchRoutes` still dispatches requested routes and remains cancellable.
- [ ] Run `NODE_ENV=test npx vitest run src/__tests__/route-prefetch.test.ts` and confirm RED.
- [ ] Make the minimum policy change; do not alter `<Link>` destinations, navigation IA, or user-intent handlers.
- [ ] Re-run the focused test and `npm run typecheck`.
- [ ] Inspect the diff to prove no financial, auth, route destination, or UI class changes.

### Task 2: Move global system-health polling outside the initial critical window

**Files:**

- Create: `src/components/system-health/system-health-poll-scheduler.ts`
- Modify: `src/components/system-health/system-health-poller.tsx`
- Create: `src/__tests__/system-health-poll-scheduler.test.ts`

**Evidence and expected result:** `/api/system-health` is the most frequent slowest background request and performs a nested schema check. Schedule the first poll after a bounded 1,200 ms delay, then preserve the current 60-second interval, warning/error behavior, route exclusions, and 30-second request cache. Do not remove health detection or hide errors. The request must still occur after the delay and cleanup must cancel it.

- [ ] Write fake-timer tests proving the poll is not invoked synchronously, runs once at 1,200 ms, and is cancelled on cleanup.
- [ ] Confirm focused RED with `NODE_ENV=test npx vitest run src/__tests__/system-health-poll-scheduler.test.ts`.
- [ ] Implement the scheduler and wire only the initial `run`; leave interval and toast policy unchanged.
- [ ] Re-run the focused test and `npm run typecheck`.
- [ ] In browser AFTER evidence, observe both pre-delay page readiness and post-delay health request; do not claim the request was eliminated.

### Task 3: Batch Expenses attachments and parallelize independent list hydration

**Files:**

- Modify: `src/lib/expenses-db.ts`
- Create: `src/lib/__tests__/expense-list-attachment-batch.test.ts`
- Verify: `src/app/api/expenses/route.ts`

**Evidence and expected result:** `getExpenses` currently performs two attachment-table reads per expense via a serial loop after several independent list-hydration phases. Replace this with two batched table reads per bounded ID chunk, group/dedupe by expense ID, and run payment-account names, lines, linked-bank mapping, deductions, and attachment batches concurrently after header normalization. Preserve missing-table/column fallback behavior and the exact `Expense[]` shape.

- [ ] Write a failing mock-client test with multiple expenses that proves attachments are grouped/deduped correctly and query count is bounded by table/chunk rather than expense count.
- [ ] Confirm focused RED with `NODE_ENV=test npx vitest run src/lib/__tests__/expense-list-attachment-batch.test.ts`.
- [ ] Add the minimum batched helper and use it only in `getExpenses`; retain `getAttachments` for single-detail paths.
- [ ] Parallelize only reads with no data dependency and use the same explicit request-scoped client.
- [ ] Run the focused test, existing expense tests, financial integrity tests, and `npm run typecheck`.
- [ ] Prove no formula/status/total/attachment representation changed and no schema/index change exists.

### Task 4: Reuse one canonical Project financial result

**Files:**

- Modify: `src/lib/project-cost-dashboard.ts`
- Modify: `src/app/projects/[id]/page.tsx`
- Create: `src/__tests__/project-cost-dashboard-canonical-reuse.test.ts`

**Evidence and expected result:** Project Detail computes canonical profit directly and `getProjectCostDashboard` computes it again. Pass the in-flight request-scoped canonical promise/result into the cost-dashboard helper so expense/reimbursement reads remain parallel but canonical source reads execute once. Preserve the current formulas and fail-closed Project financial fallback.

- [ ] Write a failing test proving a supplied canonical promise prevents an internal canonical call and produces byte-for-byte equivalent breakdown/profit/margin/revenue fields.
- [ ] Confirm focused RED with `NODE_ENV=test npx vitest run src/__tests__/project-cost-dashboard-canonical-reuse.test.ts`.
- [ ] Implement the optional request-scoped canonical input and share the same promise in Project Detail.
- [ ] Run the focused test, canonical profit/commission tests, financial read-availability tests, auth-boundary tests, and `npm run typecheck`.
- [ ] Inspect the diff for zero formula, rounding, fallback, RLS, or client-authority changes.

### Task 5: Rebuild, remeasure, and verify the complete story

**Files:**

- Create: `reports/performance/2026-09-02/local-after.md`
- Create: `reports/performance/2026-09-02/HH_GROUP_PERFORMANCE_OPTIMIZATION.md`

- [ ] Run focused tests for all four tasks, full unit/source-contract suites, typecheck, and a clean optimized production build.
- [ ] Repeat the exact 15-surface 1440/820/390 Local optimized-build matrix with one safe local owner context per viewport.
- [ ] Run destination-specific GET-only Dashboard→Projects and Projects→Project clicks where visible; invalidate any result that matches old content.
- [ ] Compare Dashboard RSC/abort fan-out, system-health start timing, Expenses query count, Project canonical invocation count, FUC, settle, request count, errors, and overflow.
- [ ] Confirm financial unexpected delta zero from unchanged formulas plus financial regression suites; confirm business/security/UI architecture deltas zero by diff and tests.
- [ ] Keep Production AFTER as unavailable until deployment (forbidden by this campaign); compare the unchanged anonymous Production baseline only and state the limitation.
- [ ] Request independent code review and apply verification-before-completion before the final verdict.
