# Payment Void and Revenue & AR Pre-Deploy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Payment Void atomic, fail-closed, rollback-safe, retry-safe, and duplicate-safe, then clear Revenue & AR release-blocking defects without changing financial formulas or business workflow semantics.

**Architecture:** Replace the current application-side Deposit → Allocation → Payment write chain with one `SECURITY INVOKER` PostgreSQL RPC called only through the existing owner/admin Server Action client. The RPC locks Payment, Invoice, Allocation, and Deposit in a fixed order, requires exact direct associations, performs all status/reconciliation writes in one transaction, and returns a typed canonical result. Revenue & AR hardening remains presentation/accessibility/test-only and reuses the certified HH design system.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL 17, pgTAP, Vitest, Playwright.

**Spec:** User-approved Payment Void Financial Hardening and Revenue & AR Pre-Deploy Hardening request in this task.

## Global Constraints

- Local Supabase only; never connect to or mutate Production.
- Do not edit historical migrations; use `supabase/migrations/20260902032348_payment_void_atomic.sql` only.
- Preserve Payment, Allocation, Deposit, Invoice, Customer, and Project amounts/associations.
- Do not change DB table schema, financial formulas, API business contract, Auth, RLS policy predicates, or lifecycle eligibility.
- New RPC must be `SECURITY INVOKER`, deny `PUBLIC`/`anon`, and grant only the existing owner/admin-compatible roles.
- No push, deploy, or commit in this pass.
- Keep unrelated working-tree changes intact.

---

### Task 1: Payment Void database contract

**Files:**

- Create: `supabase/tests/database/010_payment_received_void_atomic.sql`
- Modify: `supabase/tests/database/008_financial_rpc_acl.sql`
- Modify: `supabase/migrations/20260902032348_payment_void_atomic.sql`

**Interfaces:**

- Consumes: existing `record_payment_received_atomic(...)`, owner/admin RLS policies, and the exact status values `completed`/`void`, `Posted`/`Voided`, and `recorded`/`void`.
- Produces: `public.void_payment_received_atomic(p_payment_id uuid) returns jsonb` with `payment_id`, `invoice_id`, `project_id`, `deposit_id`, `invoice_payment_id`, `invoice_status`, `paid_total`, `balance_due`, and `reused`.

- [ ] **Step 1: Write the failing pgTAP contract**

  Add literal fixtures and assertions for success, original amount/association preservation, exact paid/balance/status reconciliation, duplicate retry, missing direct allocation, association mismatch, and legacy same-date/same-amount isolation.

- [ ] **Step 2: Add failure-injection rollback tests**

  Add transaction-local triggers that fail Deposit, Allocation, Payment, and Invoice updates one at a time. Each case must assert the complete pre-call snapshot remains unchanged.

- [ ] **Step 3: Extend the ACL test before implementation**

  Assert the new function exists, remains `security invoker`, denies `PUBLIC`/`anon`, and is executable only by `authenticated` and `service_role`.

- [ ] **Step 4: Run RED**

  Run: `npx supabase test db --local supabase/tests/database/010_payment_received_void_atomic.sql supabase/tests/database/008_financial_rpc_acl.sql`

  Expected: FAIL because `public.void_payment_received_atomic(uuid)` does not exist.

- [ ] **Step 5: Implement the minimal RPC migration**

  Lock in order: Payment → Invoice → exact direct Allocation → Deposit. Validate one-to-one ownership and unchanged amounts/associations. Apply statuses and the existing allocation-derived Invoice status/paid/balance reconciliation in one transaction. Already-complete Void returns `reused = true`; inconsistent pre-voided state raises an error without writes.

- [ ] **Step 6: Apply only to local Supabase**

  Run: `npx supabase db push --local`

  Expected: migration `20260902032348` applies to `127.0.0.1:54322` only.

- [ ] **Step 7: Run GREEN**

  Run the Task 1 pgTAP command again and require all tests to pass.

### Task 2: Typed application integration and fail-safe confirmation

**Files:**

- Modify: `src/__tests__/financial-atomicity-data-failure-injection.test.ts`
- Modify: `src/lib/payments-received-db.ts`
- Modify: `src/app/financial/payments/actions.ts`
- Modify: `src/app/financial/payments/page.tsx`

**Interfaces:**

- Consumes: `void_payment_received_atomic(uuid)` JSON result.
- Produces: exported `VoidPaymentReceivedAtomicResult`; `voidPaymentReceived(paymentId, client)` returns this type; `voidPaymentReceivedAction` returns `{ ok: true; result } | { ok: false; error }`.

- [ ] **Step 1: Write failing Vitest tests**

  Assert Void issues exactly one RPC call and no table writes, validates required result fields, preserves RPC failures, and rejects malformed success responses.

- [ ] **Step 2: Run RED**

  Run: `npm run test:unit -- src/__tests__/financial-atomicity-data-failure-injection.test.ts`

  Expected: FAIL because Void still uses sequential `.from(...).update(...)` calls.

- [ ] **Step 3: Implement the minimal typed wrapper**

  Replace the sequential writes and legacy fuzzy fallback with one RPC invocation and strict result parsing. Do not add optional-chaining fallbacks that convert malformed results to success.

- [ ] **Step 4: Make the confirmation fail-safe**

  Keep the shared `ConfirmDialog` open/busy until the promise resolves. On failure, restore the row snapshot and throw the server error so the dialog renders its failure state; on success, close through the dialog contract and reload canonical data.

- [ ] **Step 5: Run GREEN**

  Run the Task 2 Vitest command and require zero failures/warnings.

### Task 3: Revenue & AR P1 hardening

**Files:**

- Modify: `src/app/financial/invoices/[id]/page.tsx`
- Modify: `src/app/financial/invoices/page.tsx`
- Modify: `src/app/financial/payments/page.tsx`
- Modify: `src/components/financial/send-payment-receipt-modal.tsx`
- Modify: `tests/revenue-ar-v2-real-world.spec.ts`
- Test: existing Phase 1 presentation/contrast/motion tests

**Interfaces:**

- Consumes: certified HH inputs, buttons, touch target utilities, responsive contracts, and current handlers.
- Produces: correctly associated accessible labels, ≥44px tablet/mobile targets, no operational dark/Neo runtime branch, and non-vacuous touch assertions.

- [ ] **Step 1: Add failing source/runtime assertions**

  Assert form labels resolve to named controls, receipt/attachment actions meet touch size, operational UI does not activate legacy dark/Neo classes, and touch-target selectors locate the real actions.

- [ ] **Step 2: Run RED**

  Run the relevant Vitest/source-contract tests and confirm they fail on the audited defects.

- [ ] **Step 3: Implement focused presentation fixes**

  Add `id`/`htmlFor` relationships, use HH shared button/touch primitives, remove only proven operational legacy theme hooks, and correct the Playwright selectors. Preserve preview/print document styling and every financial handler.

- [ ] **Step 4: Run GREEN**

  Rerun the focused tests. Treat generic motion guidance that conflicts with certified shared Foundation behavior as a documented P2 authority gap rather than a page-local override.

### Task 4: Local financial and real-world verification

**Files:**

- Modify: `tests/payments-void-delete-dependencies.spec.ts`
- Modify/Create: directly relevant Revenue & AR Playwright evidence only when a failing behavior test requires it
- Artifacts: `test-results/revenue-ar-v2-hardening/`

**Interfaces:**

- Consumes: authorized local fixtures and exact local URLs from Playwright config.
- Produces: persisted Payment → Allocation → Deposit → Invoice reconciliation evidence and route × viewport QA evidence.

- [ ] **Step 1: Extend the real-click Void flow**

  After the UI click, query local Supabase and assert the canonical statuses, unchanged amounts/associations, derived paid/balance/status, reload persistence, and duplicate-safe second call.

- [ ] **Step 2: Run the financial workflow**

  Exercise AR Queue → Invoice → Receive Payment → Void → reload → Deposit visibility → Preview/receipt, using owned fixtures and cleanup.

- [ ] **Step 3: Run the viewport matrix**

  Verify 1440×900, 1280×800, 1180×820, 820×1180, and 390×844 for all five routes. Record focus, touch targets, horizontal overflow, console errors, and page errors.

- [ ] **Step 4: Record the zero-delta ledger**

  Compare Payment amount, Allocation amount, Invoice paid amount, Invoice balance, Deposit amount, statuses, and entity IDs before/after. Any unexplained delta fails the gate.

### Task 5: Final release gates

**Files:**

- Review only: complete working-tree diff and generated test artifacts

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces: evidence-backed `PRE-DEPLOY HARDENING` and `RELEASE` verdicts.

- [ ] **Step 1: Prove the migration chain locally**

  Confirm local target, then run `npx supabase db reset --local` and the relevant/full pgTAP suite. No linked or Production flags.

- [ ] **Step 2: Run code gates**

  Run production build, non-incremental typecheck, lint, relevant Vitest/source contracts, migration filename/order/schema/rollback/ACL checks, and `git diff --check`.

- [ ] **Step 3: Run Revenue & AR Playwright**

  Require all declared workflow/viewport cells to pass with zero console/page errors and zero horizontal overflow.

- [ ] **Step 4: Inspect final diff and status**

  Confirm no secrets, generated build output, unrelated modules, Production config, historical migration edits, formula changes, or workflow changes were introduced.

- [ ] **Step 5: Stop before release actions**

  Report `RELEASE = READY` only if every gate passes, then pause for explicit Commit/Push/Deploy authorization.
