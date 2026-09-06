# Revenue & AR V2 Phase 1 Implementation Plan

> Scope authority: Figma file `JEfWRSdRF1BJgx1rGzQS3w` (Invoice & AR nodes `1:4297`, `1:4300`, `1:4331`, `1:4343`, `1:4410`, `1:4454`, `1:4604`, `1:4680`), Certified HH V2 Foundation, and current production financial behavior.

**Goal:** Deliver the approved Revenue & AR V2 presentation for AR, invoices, payments, and deposits while preserving every financial value, association, lifecycle rule, persistence path, and Payment void implementation.

**Architecture:** Reuse the canonical HH shell and existing shared primitives (`PageHeader`, `MobileListHeader`, `Button`, `Input`, `Select`, `Tabs`, `Dialog`, `NeoPanel`, `KpiTile`, `NeoToolbar`, `NeoTable`, `NeoMobileCard`, `NeoStatus`, `NeoAmount`, `RowActionsMenu`). No parallel token or component system is introduced. Each route keeps its current data loaders, handlers, action eligibility, and mutation chain; only presentation composition changes.

**Protected boundary:** Invoice subtotal/tax/total, paid/balance/status derivation, payment amount/allocation, Estimate→Invoice and Payment→Deposit linkage, customer/project IDs, lifecycle eligibility, API/DB/Auth, and Payment void are unchanged.

## Shared owner gate

1. Root verifies and locks canonical primitive APIs for all implementers.
2. Root adds a rendered regression assertion for Invoice Detail toolbar transition properties, observes it fail against `transition-all`, then removes only the local unbounded transition override so the canonical HH motion transition remains.
3. Root owns shared QA utilities and final integration; parallel agents may not edit canonical shared primitives.

## Parallel implementation boundaries

- **Agent A:** `src/app/financial/ar/page.tsx`, runtime-proven `ar-client.tsx`, and `src/app/financial/invoices/page.tsx`. Implement AR workspace, dense queue, status grouping, mobile rows, and read-only selected context while preserving loaders/actions.
- **Agent B:** `src/app/financial/invoices/[id]/page.tsx` and route-local presentation components. Implement Overview / Payments / Activity and a read-only inspector while preserving every handler and eligibility rule.
- **Agent C:** `src/app/financial/payments/page.tsx`, `receive-payment-modal.tsx`, and `src/app/financial/deposits/page.tsx`. Converge list/modal presentation only. Payment void and allocation/submit code are forbidden.
- **Root / Agent D:** authorized localhost dense fixture, route×viewport QA, contrast/motion review, financial before/after ledger, integration, and final gates.

## Verification matrix

- Routes: `/financial/ar`, `/financial/invoices`, `/financial/invoices/[id]`, `/financial/payments`, `/financial/deposits`.
- Viewports: 1440, 1280, 1180, 820, 390.
- States: Outstanding, Overdue, Partial, Paid, Void, long names, large totals, multiple payments, deposit linkage, loading, empty, selected, focus, disabled.
- Workflow: AR queue → invoice → receive payment → persisted payment → deposit visibility → balance/status → preview/receipt → reload.

## Gates

- Relevant tests run red before implementation and green afterward.
- Typecheck, lint, relevant Vitest/source contracts, Playwright flows, production build, and `git diff --check`.
- P0 = 0, P1 = 0, financial unexpected delta = 0, console/page errors = 0, horizontal overflow = 0, business behavior changes = NONE.
- No commit, push, or deploy.
