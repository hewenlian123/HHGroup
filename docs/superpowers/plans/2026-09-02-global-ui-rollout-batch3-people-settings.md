# HH Group Global UI/UX Rollout Batch 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge People/Labor/Payroll and Settings/Admin onto the Certified HH presentation, responsive, accessibility, and interaction contracts without changing business or financial semantics.

**Architecture:** Preserve every current server query, mutation, API route, financial field, and workflow handler. Refactor only rendered composition and supported shared-component usage, with desktop dense tables and tablet/mobile stacked records using the existing HH breakpoints and tokens. Existing Estimate V3 and Revenue/AR V2 surfaces are the reference implementations.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind/CSS, HH V2 shared components, Playwright, Vitest/source-contract tests.

**Spec:** User-approved Batch 3 request in the active Codex task.

## Global Constraints

- UI/UX, presentation, responsive, and interaction consistency only.
- Preserve payroll calculations, worker rates, overtime semantics, advances, reimbursements, payments, balances, project attribution, status/workflow, DB/schema/API/Auth/RLS.
- Certified HH Foundation remains unchanged; do not add page-local tokens, a second design system, or page-specific breakpoints.
- Use 1440, 1280, 1180, 820, and 390 viewport evidence; tablet/mobile targets are at least 44px.
- `color-contrast` supplies rendered evidence only; `review-animations` is review-only.
- Do not commit, push, or deploy.

---

### Task 1: Worker Center and Worker Detail

**Files:**

- Modify: `src/app/workers/page.tsx`
- Modify: `src/app/workers/workers-list-client.tsx`
- Modify: `src/app/workers/[id]/page.tsx`
- Modify if required by the same presentation contract: `src/app/workers/add-worker-modal.tsx`
- Test: `tests/worker-center-global-ui.spec.ts`

**Interfaces:**

- Consumes: canonical `PageHeader`, HH buttons/fields/status/table patterns, existing worker handlers and return paths.
- Produces: dense desktop worker records, stacked mobile records, unchanged add/open/edit/navigation behavior.

- [ ] **Step 1: Write a failing Worker Center UI contract**

  Assert a single page header/action hierarchy, worker search/filter controls, desktop dense record semantics, 390px stacked records, 44px mobile actions, and no horizontal overflow while retaining existing worker routes and labels.

- [ ] **Step 2: Run the focused Playwright test and verify RED**

  Run: `npx playwright test tests/worker-center-global-ui.spec.ts --project=chromium --reporter=list`
  Expected: FAIL on at least one pre-existing presentation/responsive assertion.

- [ ] **Step 3: Implement the minimal presentation convergence**

  Recompose existing JSX with supported HH components/classes. Do not modify actions, fetches, IDs, values, or mutations.

- [ ] **Step 4: Verify GREEN and financial behavior preservation**

  Run the new test plus `tests/worker-center-ia-smoke.spec.ts`, `tests/worker-center-return-paths.spec.ts`, and `tests/worker-center-full-flow.spec.ts` where the local fixture supports them.

### Task 2: Labor Review, Payroll, Worker Payments, and Advances

**Files:**

- Modify: `src/app/labor/review/review-client.tsx`
- Modify: `src/app/labor/payroll/page.tsx`
- Modify: `src/app/labor/payments/page.tsx`
- Modify: `src/app/labor/payments/payments-client.tsx`
- Modify: `src/app/labor/advances/worker-advances-client.tsx`
- Modify only presentation shells when necessary: `src/app/labor/advances/worker-advance-form-dialog.tsx`, `src/app/labor/payroll/pay-worker-modal.tsx`, `src/components/labor/worker-payment-receipt-preview-modal.tsx`
- Test: `tests/labor-payroll-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing payroll/payments/advances values, handlers, receipt preview and eligibility.
- Produces: consistent list workspaces, responsive records, safe dialogs/sheets, and unchanged financial submissions.

- [ ] **Step 1: Write failing route and responsive contracts**

  Assert command headers, search/filter/action hierarchy, labelled money columns, 390px stacked records, 820px touch targets, and receipt/modal light V2 presentation without changing current visible financial values.

- [ ] **Step 2: Verify RED**

  Run: `npx playwright test tests/labor-payroll-global-ui.spec.ts --project=chromium --reporter=list`
  Expected: FAIL on the legacy presentation or responsive contract.

- [ ] **Step 3: Implement only presentation changes**

  Preserve `compute-payroll-summary-rows.ts`, API calls, rate/advance/payment calculations, status transitions, and submission handlers byte-for-byte unless a non-behavioral type-only import move is unavoidable.

- [ ] **Step 4: Verify GREEN and run protected regressions**

  Run the new test plus worker payment, payroll, advance, receipt, and reimbursement regression files selected from the existing suite.

### Task 3: Worker Balances, Invoices, and Rate History Surfaces

**Files:**

- Modify: `src/app/labor/worker-balances/page.tsx`
- Modify: `src/app/labor/workers/[id]/balance/page.tsx`
- Modify: `src/app/labor/worker-invoices/worker-invoices-client.tsx`
- Modify worker-detail rate-history JSX only where it lives in `src/app/workers/[id]/page.tsx`; coordinate with Task 1 before any shared-file edit.
- Test: `tests/worker-financial-history-global-ui.spec.ts`

**Interfaces:**

- Consumes: authoritative worker balance, invoice, rate-history, payment-selection and statement data.
- Produces: traceable money/status rows and responsive composition with every semantic field retained.

- [ ] **Step 1: Write a failing financial-presentation contract**

  Assert labels remain mapped to the same source values, money uses HH financial typography, desktop tables have mobile stacked equivalents, and tablet/mobile action targets meet 44px.

- [ ] **Step 2: Verify RED**

  Run: `npx playwright test tests/worker-financial-history-global-ui.spec.ts --project=chromium --reporter=list`
  Expected: FAIL on legacy or missing responsive composition.

- [ ] **Step 3: Implement the minimal responsive presentation refactor**

  Keep all current values, form names, IDs, API endpoints, selection logic, status transitions, and financial actions unchanged.

- [ ] **Step 4: Verify GREEN and zero-delta financial contracts**

  Run the new test plus worker balance, rate history, invoice, payment consistency, and receipt regressions.

### Task 4: Settings and Admin/System Surfaces

**Files:**

- Modify: `src/components/settings/settings-sub-nav.tsx`
- Modify presentation-only JSX in `src/app/settings/**/page.tsx` and `src/app/settings/security/security-client.tsx`
- Modify: `src/app/system-health/page.tsx`
- Modify: `src/app/system-logs/page.tsx`
- Modify: `src/app/system-metrics/page.tsx`
- Modify: `src/app/system-tests/page.tsx`
- Modify: `src/app/system-tests/ui/page.tsx`
- Modify: `src/app/system/backups/page.tsx`
- Test: `tests/settings-admin-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing owner guards, endpoints, system checks, test execution, backup actions and results.
- Produces: one settings sub-navigation language, consistent system list/panel states, mobile composition, and unchanged permissions/actions.

- [ ] **Step 1: Write failing settings/admin UI contracts**

  Assert canonical headers/subnav, semantic system statuses, responsive lists in place of desktop overflow, 44px touch targets, focus visibility, empty/error/loading states, and forced-colors cues.

- [ ] **Step 2: Verify RED**

  Run: `npx playwright test tests/settings-admin-global-ui.spec.ts --project=chromium --reporter=list`
  Expected: FAIL on current legacy presentation or responsive behavior.

- [ ] **Step 3: Implement presentation convergence**

  Preserve every authorization guard, endpoint, destructive confirmation, test command, system-health mapping, backup payload, and state transition.

- [ ] **Step 4: Verify GREEN and existing security/system contracts**

  Run the new test plus settings security/company/expenses and system health/log/metrics/test/backup focused regressions.

### Task 5: Shared Review and Full Batch Verification

**Files:**

- Review all Task 1–4 diffs.
- Test/update only if an uncovered assertion is required: `tests/batch3-global-ui-qa.spec.ts`

**Interfaces:**

- Consumes: all four domain implementations.
- Produces: consolidated runtime evidence and a P0/P1 disposition without changing financial/business semantics.

- [ ] **Step 1: Run mechanical and source reviews**

  Run Impeccable detection over changed targets, React best-practice review, `git diff --check`, focused lint, and typecheck.

- [ ] **Step 2: Run browser matrix**

  Exercise representative routes at 1440, 1280, 1180, 820, and 390; capture console/page errors, overflow, focus, keyboard, touch targets, forced-colors, and reduced-motion evidence.

- [ ] **Step 3: Run financial regressions**

  Use the same authorized local fixtures and focused payroll/payment/advance/balance/rate/invoice tests before and after. Any unexplained financial delta fails the batch.

- [ ] **Step 4: Inspect final diff and status**

  Confirm no DB/schema/API/Auth/RLS/formula/workflow changes, no generated artifacts, and no commit/push/deploy.
