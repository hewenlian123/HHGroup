# HH Group Global UI/UX Rollout Batch 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge Operations, Materials/Procurement, and remaining Settings/Admin surfaces onto the Certified HH presentation, responsive, accessibility, and interaction contracts without changing business or financial semantics.

**Architecture:** Preserve every existing query, mutation, server action, API route, permission boundary, entity association, and destructive confirmation. Refactor only rendered composition and supported HH component usage, using dense desktop records and explicit tablet/mobile compositions at the established HH breakpoints. Estimate V3 and Revenue/AR V2 remain the interaction references; this batch does not create a new design system.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind/CSS, Certified HH V2 shared components, Playwright, Vitest, axe-core.

**Spec:** User-approved Batch 4 request in the active Codex task.

## Global Constraints

- Scope is UI/UX, presentation, responsive composition, and interaction consistency only.
- Preserve DB/schema, API business contracts, Auth/RLS, financial formulas, payroll/business workflow, project/material semantics, and destructive-operation behavior.
- Preserve all current form field names, request payloads, IDs, navigation destinations, eligibility checks, status transitions, and persistence handlers.
- Use canonical Global Shell, Global Sidebar, HH tokens, shared components, and existing project breakpoints. Do not add page-local tokens, raw colors, a second component system, or a page-specific breakpoint.
- Verify 1440, 1280, 1180, 820, and 390 viewports; tablet/mobile interactive targets are at least 44px.
- `color-contrast` is rendered evidence only; `review-animations` is review-only. HH/Figma authority wins.
- Use local authorized fixtures and read-only/mocked admin endpoints. Do not run destructive system tests, create production data, commit, push, or deploy.

---

### Task 1: Tasks, Schedule, and Punch List

**Files:**

- Modify as required: `src/app/tasks/page.tsx`
- Modify as required: `src/app/schedule/page.tsx`
- Modify as required: `src/app/punch-list/page.tsx`
- Test: `tests/operations-core-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing task/schedule/punch APIs, server actions, optimistic handlers, filters, statuses, drawers, dialogs, and list/calendar/kanban state.
- Produces: one HH list-workspace hierarchy, explicit dense/stacked record semantics, 44px touch controls, and unchanged behavior.

- [ ] **Step 1: Write a failing responsive UI contract**

  Cover route load, canonical page header/actions, search/filter labels, dense desktop records, 390px stacked records, 820px targets, status text, keyboard focus, error channels, and root overflow. Mock only external/local API reads needed for deterministic presentation.

- [ ] **Step 2: Verify RED**

  Run `env -u CI E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0 npx playwright test tests/operations-core-global-ui.spec.ts --project=chromium --workers=1 --reporter=list --retries=0` and retain the expected presentation failure.

- [ ] **Step 3: Implement minimal presentation convergence**

  Reuse `PageLayout`, `PageHeader`, shared HH table/mobile-card/status/filter/dialog primitives and existing mobile chrome. Do not touch API/server-action code or request/response handling.

- [ ] **Step 4: Verify GREEN**

  Rerun the focused test and relevant existing task/schedule/punch smoke tests. Capture the five viewport results, console/page errors, focus, and overflow.

### Task 2: Site Photos and Inspection Log

**Files:**

- Modify as required: `src/app/site-photos/page.tsx`
- Modify as required: `src/app/inspection-log/page.tsx`
- Test: `tests/operations-field-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing photo upload/view/download/delete/bulk/punch creation flows and inspection create/edit/delete/filter flows.
- Produces: readable responsive photo/inspection records, canonical status/actions, and unchanged destructive confirmations and payloads.

- [ ] **Step 1: Write a failing field-operations contract**

  Assert photo and inspection routes, deterministic records, desktop composition, mobile cards, long copy handling, dialog/drawer focus, 44px actions, status semantics, and no overflow.

- [ ] **Step 2: Verify RED**

  Run `env -u CI E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0 npx playwright test tests/operations-field-global-ui.spec.ts --project=chromium --workers=1 --reporter=list --retries=0` and confirm the failure names a real presentation gap.

- [ ] **Step 3: Implement minimal presentation convergence**

  Preserve all photo paths, upload inputs, delete and bulk-delete confirmation behavior, selected IDs, punch linkage, inspection fields, statuses, and API calls.

- [ ] **Step 4: Verify GREEN**

  Rerun the focused contract at 1440/1280/1180/820/390, with console/page error and overflow capture.

### Task 3: Materials, Cost Codes, and Procurement Placeholders

**Files:**

- Modify as required: `src/app/materials/page.tsx`
- Modify as required: `src/app/materials/[id]/material-selection-detail-client.tsx`
- Modify as required: `src/app/materials/new/page.tsx`
- Modify: `src/app/estimating/cost-codes/page.tsx`
- Modify: `src/app/procurement/purchase-orders/page.tsx`
- Test: `tests/materials-procurement-global-ui.spec.ts`

**Interfaces:**

- Consumes: authoritative material-selection fields/actions, owner/admin guard, project/customer linkage, preview/PDF routes, delete confirmation, static cost-code source, and the current purchase-order placeholder state.
- Produces: consistent materials workspace and responsive records without inventing procurement functionality or changing material semantics.

- [ ] **Step 1: Establish a protected baseline and failing UI contract**

  Record relevant material-selection test results and source mapping. Assert desktop/mobile selection parity, current status text, touch targets, cost-code records without legacy styling, and an honest HH empty/not-implemented procurement state.

- [ ] **Step 2: Verify RED**

  Run `env -u CI E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0 npx playwright test tests/materials-procurement-global-ui.spec.ts --project=chromium --workers=1 --reporter=list --retries=0` and retain the expected legacy Cost Codes/placeholder failure.

- [ ] **Step 3: Implement presentation-only convergence**

  Do not add procurement fields, actions, APIs, persistence, totals, or mock business capability. Keep every material selection source value and action destination unchanged.

- [ ] **Step 4: Verify GREEN and semantic parity**

  Rerun the focused Playwright test and `tests/material-selections.spec.ts`; confirm zero business/amount/status delta.

### Task 4: Remaining Settings and Admin Surfaces

**Files:**

- Modify as required: `src/app/settings/**/page.tsx`
- Modify as required: `src/app/settings/security/security-client.tsx`
- Modify as required: `src/app/system-health/page.tsx`
- Modify as required: `src/app/system-logs/page.tsx`
- Modify as required: `src/app/system-metrics/page.tsx`
- Modify as required: `src/app/system/backups/page.tsx`
- Test: `tests/settings-admin-remaining-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing owner guards, account/security/company/settings handlers, system APIs, health mappings, telemetry, backup create/list/download confirmations, and System Tests presentation completed in Batch 3.
- Produces: consistent Settings/Admin workspaces with no permission or destructive behavior changes.

- [ ] **Step 1: Write a failing remaining-admin contract**

  Use owner authentication and safe API route mocks. Assert settings sub-navigation, System Health/Logs/Metrics/Backups headers, responsive records, loading/empty/error states, 44px controls, focus, status text, and no overflow.

- [ ] **Step 2: Verify RED**

  Run `env -u CI E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0 npx playwright test tests/settings-admin-remaining-global-ui.spec.ts --project=chromium --workers=1 --reporter=list --retries=0` and confirm the failure is presentation-only.

- [ ] **Step 3: Implement minimal remaining convergence**

  Do not invoke destructive test or backup actions in QA. Preserve all authorization, endpoint, confirmation, backup filename/data, system status mapping, and refresh behavior.

- [ ] **Step 4: Verify GREEN and existing admin contracts**

  Run the focused test, `tests/system-health-command-center.spec.ts`, and relevant settings/security/company tests with safe local fixtures or mocks.

### Task 5: Global Consistency and Final Verification

**Files:**

- Review only the Batch 4 diff and direct shared-component dependencies.
- Add assertions to the four focused contracts only when a real uncovered regression needs protection.

**Interfaces:**

- Consumes: Tasks 1–4 presentation implementations.
- Produces: consolidated P0/P1 disposition and runtime evidence without new visual authority.

- [ ] **Step 1: Run static consistency review**

  Search Batch 4 targets for raw gray/zinc/dark/gold/glass values, `transition-all`, duplicate page-local controls/tables/statuses, unsupported radii, duplicate FAB/actions, desktop-only tables, and page-local shells/sidebars. Run Impeccable detector once over changed UI targets and apply React best-practice review.

- [ ] **Step 2: Run browser matrix**

  Execute the four focused Playwright files serially at 1440/1280/1180/820/390. Assert route state, touch targets, keyboard focus, forced-colors, reduced-motion, rendered contrast, console/page errors, and root overflow.

- [ ] **Step 3: Run protected regressions and mechanical gates**

  Run relevant Operations/Materials/Admin Vitest/source tests, fresh TypeScript, targeted ESLint, Prettier, `git diff --check`, and verify no Batch 4 diff in DB/schema/API/Auth/RLS or protected calculation/workflow files.

- [ ] **Step 4: Inspect final status**

  Remove only confirmed generated test caches, preserve all pre-existing user changes, and confirm no commit, push, or deploy occurred.
