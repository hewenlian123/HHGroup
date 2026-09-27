# HH Group Performance Baseline and Bottlenecks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible Local/Production performance baseline and an evidence-ranked bottleneck set that can drive a separate exact optimization plan.

**Architecture:** Keep measurement outside production behavior. A read-only Playwright performance probe will capture browser timings and request evidence, while static server/data and client/bundle audits trace the same routes to code. Production probes remain read-only and any database recommendations remain reports rather than migrations.

**Tech Stack:** Next.js 14.2.35, React 18, TypeScript 5, Playwright 1.58.2, Vitest 4, Supabase JS 2.98, local Supabase, Vercel Production.

**Spec:** `docs/superpowers/specs/2026-09-02-hh-group-performance-responsiveness-design.md`

## Global Constraints

- Global UI/UX baseline is frozen; do not redesign UI or create new visual rules.
- Financial unexpected delta is zero; do not change financial formulas, mappings, rounding, workflow, or lifecycle state.
- Security boundary changes are zero; never fail open or weaken authentication, authorization, or RLS.
- Production is read-only; local Supabase is the only permitted target for mutation tests.
- Do not change database schema or indexes without separate evidence and approval.
- Do not push or deploy.
- Preserve unrelated existing changes in the canonical checkout.

---

### Task 1: Define the reproducible measurement contract

**Files:**

- Create: `tests/performance/hh-system-navigation-performance.spec.ts`
- Create: `tests/performance/performance-result.ts`
- Create: `tests/performance/playwright.performance.config.ts`
- Create: `tests/performance/README.md`
- Test: `src/__tests__/performance/navigation-performance-contract.test.ts`

**Interfaces:**

- Consumes: existing Playwright auth/storage helpers, canonical routes from `src/lib/navigation/ia.ts`, and `E2E_BASE_URL`.
- Produces: one JSON result per target/viewport/run containing navigation markers, useful-content timing, settle timing, request inventory, duplicate/aborted/slow request summaries, and console/page errors.

- [ ] **Step 1: Write a failing contract test for the result shape**

  Add a small test around the pure result classifier used by the probe. It must reject a route result missing `clickToFeedbackMs`, `clickToRouteStartMs`, `routeStartToUsefulContentMs`, `fullSettleMs`, `requests`, or `errors`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `NODE_ENV=test npx vitest run src/__tests__/performance/navigation-performance-contract.test.ts`

  Expected: failure because the result classifier/required fields do not yet exist.

- [ ] **Step 3: Implement the minimum read-only probe**

  The probe must use navigation timing marks, Playwright request/response/requestfailed events, route-specific useful-content locators discovered from the current UI, and a bounded network-settle window. It must not submit forms or invoke mutations. Dynamic detail routes must be discovered from visible links rather than hard-coded Production identifiers.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run: `NODE_ENV=test npx vitest run src/__tests__/performance/navigation-performance-contract.test.ts`

  Expected: all result-shape and duplicate-classification cases pass.

- [ ] **Step 5: Verify safe target guards**

  Run the probe configuration once with a localhost URL and once with `https://hhprojectgroup.com`. Confirm the Production path contains no click target or HTTP method capable of mutation and fails closed if a mutating request is observed.

### Task 2: Capture the Local BEFORE baseline

**Files:**

- Create: `reports/performance/2026-09-02/local-before.json`
- Create: `reports/performance/2026-09-02/local-before.md`

**Interfaces:**

- Consumes: Task 1 probe, the existing local-only auth path, local Supabase, widths 1440/820/390.
- Produces: cold and warm Local samples for every reachable core route plus the declared navigation workflow.

- [ ] **Step 1: Verify the environment is local**

  Record the resolved `E2E_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` host, Node version, browser version, branch, and commit. Stop the run if either application or database resolves to a hosted target.

- [ ] **Step 2: Start the configured local app and verify readiness**

  Use the repository startup contract and `/financial/expenses` readiness route. Capture server startup output and preserve it with the run artifacts.

- [ ] **Step 3: Run cold samples**

  Execute the route matrix once per viewport after a fresh browser context, preserving JSON and failure artifacts.

- [ ] **Step 4: Run warm samples**

  Repeat the same matrix in an authenticated warm context without changing test data.

- [ ] **Step 5: Summarize Local evidence**

  Report median timing values, request totals, duplicates, aborted requests, slowest request, console/page errors, and any unavailable route separately from product failures.

### Task 3: Capture the Production BEFORE baseline

**Files:**

- Create: `reports/performance/2026-09-02/production-before.json`
- Create: `reports/performance/2026-09-02/production-before.md`

**Interfaces:**

- Consumes: Task 1 read-only probe, `https://hhprojectgroup.com`, approved existing Production authentication only.
- Produces: cold/warm Production samples or an explicit authentication/observability blocker with all public and authenticated evidence that remains available.

- [ ] **Step 1: Prove read-only mode**

  Record the target URL and enable the probe's mutation-request fail-closed guard before opening Production.

- [ ] **Step 2: Capture cold and warm route samples**

  Run the same route and viewport matrix as Local. Never create, update, approve, void, pay, delete, upload, or submit data.

- [ ] **Step 3: Capture available Vercel evidence**

  Use linked read-only runtime logs or existing Speed Insights only if credentials are already configured. Do not change Vercel settings or install monitoring.

- [ ] **Step 4: Summarize Production evidence**

  Keep authentication, unavailable logs, cold starts, network distance, and product latency as separate classifications.

### Task 4: Trace server, auth, network, and data execution

**Files:**

- Create: `reports/performance/2026-09-02/server-data-audit.md`

**Interfaces:**

- Consumes: route matrix, server logs, source files, committed migrations, and Task 2/3 request evidence.
- Produces: file-and-line traced server/data findings with severity, confidence, and expected benefit.

- [ ] **Step 1: Map each page to its server/auth/data calls**

  Record Server Component, route handler, server action, session guard, Supabase client, table/RPC, and cache/no-store boundary for every core route.

- [ ] **Step 2: Identify duplicated or serialized work**

  Confirm repeated auth/session checks, repeated Supabase client construction, duplicate requests/joins, N+1 patterns, independent sequential awaits, and over-fetching against source and runtime evidence.

- [ ] **Step 3: Review query shapes read-only**

  Compare filters, joins, ordering, and pagination with committed index definitions. Do not modify schema. Record any recommended index with the exact query pattern and expected benefit.

- [ ] **Step 4: Classify findings**

  Label each as P0/P1/P2 and SERVER/DATABASE, AUTH/SESSION, DATA FETCHING, NETWORK/RSC, PREFETCH/CACHING, or ENVIRONMENT. Mark unproven items as hypotheses.

### Task 5: Trace client, React, hydration, bundle, and feedback behavior

**Files:**

- Create: `reports/performance/2026-09-02/client-react-bundle-audit.md`

**Interfaces:**

- Consumes: route matrix, build output, source files, Task 2/3 browser evidence.
- Produces: exact client/render/bundle findings and a real-latency versus missing-feedback decision for each route.

- [ ] **Step 1: Inventory client boundaries and bundle cost**

  Map `'use client'` roots, large client modules, heavy dependencies, serialized props, and route build sizes.

- [ ] **Step 2: Audit rerenders and effects**

  Trace effects, query subscriptions, derived state, unstable dependencies, router refreshes, table/list iteration, pagination, and virtualization evidence.

- [ ] **Step 3: Audit navigation and feedback**

  Compare click-to-feedback against route-start/useful-content. Identify missing pending state separately from actual server/network/client work.

- [ ] **Step 4: Classify findings**

  Label each as P0/P1/P2 and CLIENT/REACT, BUNDLE/HYDRATION, TABLE/LIST RENDERING, PREFETCH/CACHING, NETWORK/RSC, or ENVIRONMENT. Mark unproven items as hypotheses.

### Task 6: Publish the baseline and exact optimization plan

**Files:**

- Create: `reports/performance/2026-09-02/HH_GROUP_PERFORMANCE_BASELINE.md`
- Create: `docs/superpowers/plans/2026-09-02-hh-group-performance-optimization.md`

**Interfaces:**

- Consumes: Tasks 2-5 evidence.
- Produces: the requested PERFORMANCE BASELINE/TOP BOTTLENECKS/ROOT CAUSES report sections and a separate test-first plan naming only evidence-backed changes.

- [ ] **Step 1: Reconcile all evidence**

  Cross-check runtime observations with source traces. Do not promote a static suspicion to a bottleneck without runtime or repeated code-path evidence.

- [ ] **Step 2: Rank bottlenecks**

  Rank by user impact, breadth, confidence, implementation risk, financial/security risk, and expected measurable benefit.

- [ ] **Step 3: Define the optimization batch**

  Select high-benefit, low-risk items only. Exclude schema/index work, financial semantic changes, security-boundary changes, and UI redesign.

- [ ] **Step 4: Write the exact test-first optimization plan**

  Name every file, failing test, expected failure, minimal implementation, focused verification, financial/security regression, browser after-measurement, and review gate. No optimization may be described without its baseline metric and expected observable change.

- [ ] **Step 5: Self-review the plan**

  Check spec coverage, placeholders, interface consistency, and preservation of every Global Constraint before implementation begins.
