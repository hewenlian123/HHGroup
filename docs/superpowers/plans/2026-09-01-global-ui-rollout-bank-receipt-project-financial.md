# HH Global UI Rollout — Bank, Receipt, Project Financial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Bank Reconciliation, Receipt Queue, and Project deep financial tables into the certified HH UI/UX language without changing financial or business behavior.

**Architecture:** Keep existing route loaders, handlers, API calls, field mappings, and lifecycle eligibility as the business authority. Recompose only the presentation with existing HH V2/V3 shell, status, dense-data, responsive, and modal patterns; each implementation domain owns disjoint source and Playwright files, while shared primitives remain read-only.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind/HH V2 CSS, Playwright, Vitest, local Supabase fixtures.

**Spec:** User-approved 2026-09-01 HH Group global UI/UX rollout request in the current Codex task.

## Global Constraints

- Figma defines UI/UX intent; Certified HH Foundation defines implementation; current Production behavior defines business and financial semantics.
- Estimate V3 and Revenue & AR V2 are the reference modules.
- Viewports are exactly 1440, 1280, 1180, 820, and 390 CSS pixels wide.
- Tablet/mobile interactive targets are at least 44×44 CSS pixels and no required viewport may horizontally overflow.
- Do not modify DB, schema, API business contracts, Auth, financial formulas, or workflow semantics.
- Do not create new design tokens, page-local design systems, migrations, commits, pushes, or deployments.
- Preserve unrelated working-tree changes.
- P0 = 0, P1 = 0, console/page errors = 0, unexpected financial delta = 0, and business behavior changes = NONE.

---

### Task 1: Bank Reconciliation presentation

**Files:**

- Modify: `src/app/financial/bank/bank-client.tsx`
- Modify only if presentation wrapper requires it: `src/app/financial/bank/page.tsx`
- Create: `tests/bank-reconciliation-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing bank transaction API, CSV import, filtering, reconciliation, link/unlink, and atomic expense creation handlers unchanged.
- Produces: certified HH workspace/header/filter/dense-row and stacked mobile rendering with stable accessible labels.

- [ ] Write a Playwright contract that proves the legacy presentation fails the HH header, responsive composition, 44px touch target, overflow, loading/empty/error, and amount/status semantics requirements.
- [ ] Run the focused spec and retain the expected RED failure.
- [ ] Replace presentation-only markup/classes with existing HH primitives and responsive composition while retaining every handler and payload unchanged.
- [ ] Run the focused spec to GREEN and run the existing bank atomicity/API boundary regressions.
- [ ] Record changed files, commands, financial field traceability, and concerns in the task report.

### Task 2: Receipt Queue presentation

**Files:**

- Modify: `src/app/financial/receipt-queue/receipt-queue-workspace.tsx`
- Modify: `src/app/financial/receipt-queue/receipt-queue-row-card.tsx`
- Modify only if needed for responsive presentation: `src/app/financial/receipt-queue/use-rq-layout.ts`
- Create: `tests/receipt-queue-global-ui.spec.ts`

**Interfaces:**

- Consumes: existing canonical queue query/filter/category/preview/review/upload behavior and `/financial/receipt-queue/[id]/preview` contract unchanged.
- Produces: HH queue shell, accessible filter/actions, responsive rows, receipt-preview entry, and explicit loading/empty/error states.

- [ ] Write a Playwright contract that proves the legacy raw/dark presentation, responsive, touch target, preview, overflow, and error-channel gaps.
- [ ] Run the focused spec and retain the expected RED failure.
- [ ] Recompose the queue with existing HH tokens/components and keep all fetches, mutations, status mappings, IDs, and navigation behavior unchanged.
- [ ] Run the focused spec to GREEN and run existing receipt queue/preview/storage regressions.
- [ ] Record changed files, commands, value/status traceability, and concerns in the task report.

### Task 3: Project deep financial tables presentation

**Files:**

- Modify: `src/app/projects/[id]/subcontracts/page.tsx`
- Modify presentation clients/modal shells under `src/app/projects/[id]/subcontracts/` only as required.
- Modify: `src/app/projects/[id]/labor/page.tsx`
- Modify: `src/app/projects/[id]/profit/page.tsx`
- Modify presentation files under `src/app/projects/[id]/change-orders/` only as required.
- Modify: `src/app/projects/[id]/project-cost-lines-table.tsx`
- Modify: `src/app/projects/[id]/project-financial-snapshot-comparison-panel.tsx`
- Create: `tests/project-financial-tables-global-ui.spec.ts`

**Interfaces:**

- Consumes: canonical project profit engine, labor/expense/subcontract/AP/change-order values, approval eligibility, payment schedules, documents, and all server actions unchanged.
- Produces: HH page headers, filters/actions, dense desktop tables, labelled tablet composition, stacked mobile records, and accessible modal/sheet presentation.

- [ ] Write a Playwright/source contract for Subcontracts, Bills, Labor, Change Orders, and Project Financial surfaces that fails on desktop-only width, missing mobile labels, touch targets, or overflow.
- [ ] Run the focused contract and retain the expected RED failure.
- [ ] Recompose presentation using current HH shared vocabulary; preserve value sources, handlers, payloads, lifecycle actions, and formulas byte-for-byte where possible.
- [ ] Run the focused contract to GREEN plus project financial snapshot, subcontract AP/bill, and profit regressions.
- [ ] Record changed files, commands, field/relationship traceability, and concerns in the task report.

### Task 4: Responsive, accessibility, color, motion, and browser QA

**Files:**

- Create artifacts under: `test-results/global-ui-rollout-batch2/`
- Modify only task-owned UI/test files when a verified P0/P1 root-cause fix is required.

**Interfaces:**

- Consumes: completed Tasks 1–3 and project-configured auth/fixtures.
- Produces: route × state × viewport evidence at 1440/1280/1180/820/390, including screenshots, overflow measurements, axe results, forced-colors, reduced-motion, focus, touch, console, and page errors.

- [ ] Declare the route/state/viewport matrix and verify startup/auth/fixture inputs.
- [ ] Run real browser workflows for Bank Reconciliation, Receipt Queue preview, and all project financial deep-table routes.
- [ ] Capture rendered screenshots and measurable overflow/target/focus/contrast evidence in one bounded pass.
- [ ] Review motion only; report each finding using the required Before/After/Why table and explicit verdict.
- [ ] After any scoped fix, rerun the affected cell and relevant regression once.

### Task 5: Financial integrity and shared-component review

**Files:**

- Review the final diff and existing financial regression tests; do not create backend or schema changes.

**Interfaces:**

- Consumes: task reports, final diff, fixed local fixtures, and canonical financial sources.
- Produces: before/after financial ledger, field/association traceability, shared-component compliance, and final P0/P1 verdict.

- [ ] Confirm the diff changes presentation only and contains no API/DB/Auth/formula/workflow changes.
- [ ] Run fixed project/bank/receipt/subcontract financial regressions with identical before/after fixtures and record exact zero deltas.
- [ ] Verify canonical Global Shell/single Sidebar/shared HH primitives and absence of new tokens or page-local visual vocabulary.
- [ ] Run typecheck, lint, relevant Vitest/Playwright, Impeccable detector, and `git diff --check` with fresh output.
- [ ] Issue VERIFIED, FAILED, NOT VERIFIED, or BLOCKED verdicts without lowering any gate.
