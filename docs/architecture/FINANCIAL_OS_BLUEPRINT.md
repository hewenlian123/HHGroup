# HH Project OS Phase 3: Financial OS Blueprint

Audit mode: plan only. This report does not change code, schema, migrations, API contracts, financial formulas, deployment settings, Supabase policies, or production data.

## Executive Summary

HH Project already has the pieces of a Construction ERP financial system, but the working surfaces are spread across `/financial/*`, root `/bills`, legacy `/finance/*`, and worker money flows under `/labor/*`. Phase 3 should make the long-term Financial OS explicit without moving routes or touching math:

- Overview
- AR
- AP
- Cash
- Reports

The safest first implementation is navigation and grouping only. Keep every current route working, preserve redirects and aliases, and reuse the current dashboard, AR, AP, cash, payroll, reimbursement, commission, and data-quality helpers exactly as they are. The first PR should be a compatibility shell that makes Financial feel like a stable operating system while leaving formulas, APIs, Supabase access patterns, and database tables untouched.

## Current Financial Route Map

### Overview And Dashboards

| Current route          | Current role                                                                                                                                                                         | Future Financial OS home | Notes                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------- |
| `/financial`           | Financial workspace launcher with links to owner dashboard, accounts, invoices, payments, deposits, bills, and expenses.                                                             | Overview                 | Keep as the canonical Financial entry point. It can become the Overview shell over time.      |
| `/financial/owner`     | Owner-focused finance dashboard: cash collected, invoiced, expenses, profit, unpaid invoices, pending payments, cash flow, top projects, loss projects, contract review, and alerts. | Overview, Reports        | This is the best current source for executive financial KPIs and risk projects.               |
| `/financial/dashboard` | Legacy or alternate financial dashboard route.                                                                                                                                       | Overview                 | Preserve route while deciding whether it redirects, embeds, or remains a secondary dashboard. |
| `/finance`             | Legacy finance overview with revenue, bills, expenses, labor cost, profit, and recent transactions.                                                                                  | Overview, Reports        | Keep compatibility. Avoid changing its older formulas during Financial OS grouping.           |

### AR: Accounts Receivable

| Current route                      | Current role                                                                           | Future Financial OS home | Notes                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `/financial/ar`                    | AR aging summary with total AR, overdue AR, paid this month, and outstanding invoices. | AR                       | Good future AR landing page.                                                                   |
| `/financial/estimates`             | Redirects to `/estimates`.                                                             | AR                       | Keep as an alias/redirect. Estimates remain project/customer-facing but belong visually in AR. |
| `/estimates`                       | Canonical estimate list and estimate builder entry.                                    | AR, Projects             | Shared between Projects and AR. Do not duplicate estimate logic.                               |
| `/financial/invoices`              | Invoice list and invoice lifecycle.                                                    | AR                       | Canonical AR document surface. Keep details, edit, preview, print, and new invoice routes.     |
| `/financial/invoices/new`          | New invoice creation.                                                                  | AR                       | Keep route and existing invoice creation contracts.                                            |
| `/financial/invoices/[id]`         | Invoice detail.                                                                        | AR                       | Preserve payment links and derived balance display.                                            |
| `/financial/invoices/[id]/edit`    | Invoice edit.                                                                          | AR                       | No formula or status changes.                                                                  |
| `/financial/invoices/[id]/preview` | Invoice preview.                                                                       | AR                       | Keep print/preview compatibility.                                                              |
| `/financial/invoices/[id]/print`   | Invoice print document.                                                                | AR                       | Keep company profile and PDF behavior unchanged.                                               |
| `/financial/payments`              | Payments received workflow.                                                            | AR                       | Canonical payment received route.                                                              |
| `/financial/payments-received`     | Redirects to `/financial/payments`.                                                    | AR                       | Keep alias.                                                                                    |
| `/financial/deposits`              | Deposits created from received payments.                                               | AR, Cash                 | Shared surface: AR collection grouping and Cash reconciliation grouping.                       |

### AP: Accounts Payable

| Current route               | Current role                                                                      | Future Financial OS home | Notes                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `/bills`                    | Canonical AP bills list with summary, filters, projects, and create action.       | AP                       | Keep as canonical route for now.                                                |
| `/bills/new`                | New AP bill.                                                                      | AP                       | Preserve route and API behavior.                                                |
| `/bills/[id]`               | AP bill detail.                                                                   | AP                       | Preserve payment and status behavior.                                           |
| `/bills/[id]/edit`          | AP bill edit.                                                                     | AP                       | No AP formula changes.                                                          |
| `/financial/bills`          | Redirects to `/bills`.                                                            | AP                       | Keep alias.                                                                     |
| `/financial/bills/new`      | Financial namespace AP bill create route.                                         | AP                       | Preserve if currently linked or used.                                           |
| `/financial/bills/[id]`     | Financial namespace AP bill detail route.                                         | AP                       | Preserve route compatibility.                                                   |
| `/financial/expenses`       | Expense list, receipt workflow, filters, project linking, and inbox interactions. | AP                       | Canonical expense surface.                                                      |
| `/financial/expenses/new`   | New expense.                                                                      | AP                       | Preserve receipt and project-link behavior.                                     |
| `/financial/expenses/[id]`  | Expense detail.                                                                   | AP                       | Preserve receipt preview and edit behavior.                                     |
| `/financial/inbox`          | Receipt/expense inbox triage.                                                     | AP                       | Keep under AP as receipt intake.                                                |
| `/financial/receipt-queue`  | Receipt queue workspace.                                                          | AP                       | Related inbox route; future AP intake lane.                                     |
| `/financial/commissions`    | Commission summary and commission payment tracking.                               | AP, Reports              | Treat as AP-like owed/paid obligation. Keep accrual/payment distinction intact. |
| `/labor/payroll`            | Payroll summary and worker payout workflow.                                       | AP                       | Visually group under Financial > AP; route can stay under Labor.                |
| `/labor/payments`           | Worker payments list and receipts.                                                | AP                       | Worker payout history. Keep People cross-links.                                 |
| `/labor/advances`           | Worker advances.                                                                  | AP                       | Netting component for worker balances.                                          |
| `/labor/reimbursements`     | Worker reimbursements.                                                            | AP                       | Reimbursement obligations and payout workflow.                                  |
| `/financial/reimbursements` | Older worker reimbursement surface.                                               | AP                       | Preserve route if linked; prefer canonical `/labor/reimbursements` visually.    |

### Cash

| Current route         | Current role                                                          | Future Financial OS home | Notes                                                            |
| --------------------- | --------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `/financial/accounts` | Accounts and cash overview using bank transaction and expense totals. | Cash                     | Future Cash landing or Accounts page.                            |
| `/financial/bank`     | Bank transactions and reconciliation workspace.                       | Cash                     | Canonical bank transaction route.                                |
| `/financial/deposits` | Deposit review from received payments.                                | Cash, AR                 | Keep in both AR and Cash navigation as the same route.           |
| `/dashboard/cashflow` | Cashflow dashboard.                                                   | Cash, Reports            | Keep in Dashboard; cross-link from Financial OS Reports or Cash. |

### Reports And Guardrails

| Current route/API                       | Current role                                             | Future Financial OS home             | Notes                                                                                |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `/settings/project-financial-review`    | Contract value review and profit readiness guardrail.    | Reports, Settings                    | Keep under Settings/Admin or Reports cross-link; do not duplicate remediation logic. |
| `/projects/[id]/profit`                 | Project-level profit and forecast detail.                | Reports, Project Workspace Financial | Preserve as project drill-down.                                                      |
| `/projects/[id]?tab=financial`          | Project Workspace financial tab.                         | Reports, Project Workspace Financial | Project-scoped financial source.                                                     |
| `/projects/[id]?tab=closeout`           | Project closeout financial context.                      | Reports, Project Workspace Closeout  | Cross-link from Financial closeout reports later.                                    |
| `/api/projects/financial-review`        | Project financial review data source.                    | Reports                              | Existing API contract must stay stable.                                              |
| `/api/projects/financial-snapshots`     | Project snapshot comparison data source.                 | Reports                              | Existing API contract must stay stable.                                              |
| `/api/projects/[id]/financial-snapshot` | Project snapshot drill-down data source.                 | Reports                              | Existing API contract must stay stable.                                              |
| `/api/system/qa-check`                  | Static page smoke targets and financial data guardrails. | Reports, Admin Center                | Useful source for QA/data quality status.                                            |
| `/api/system/data-quality-check`        | Data quality and number checks.                          | Reports, Admin Center                | Future data quality report source.                                                   |
| `/system-health`                        | System health and financial table checks.                | Settings/Admin Center, Reports       | Cross-link for data readiness, not a Financial OS core route.                        |

## Future Financial OS Map

### Overview

Purpose: executive financial command center.

Initial sources:

- `/financial` as the canonical shell.
- `/financial/owner` for owner dashboard KPIs.
- `/finance` for legacy revenue/bills/expenses/labor/profit overview while it remains active.
- `/dashboard/cashflow` for cashflow trend context.

Overview should show:

- Cash collected.
- Invoiced.
- Open AR.
- Open AP.
- Profit and margin.
- Cashflow.
- Risk projects.
- Missing receipt and contract review alerts.

Do not recompute these in the shell. Reuse existing helpers and label whether a number is cash basis, invoice basis, AP basis, or project-profit basis.

### AR

Purpose: customer money owed to HH.

Initial modules:

- Estimates: `/estimates` and `/financial/estimates` alias.
- Invoices: `/financial/invoices` and invoice subroutes.
- Payments Received: `/financial/payments` and `/financial/payments-received` alias.
- Deposits: `/financial/deposits`.
- Customer balances: future rollup from customers, invoices, payments, and deposits.

AR rules:

- Invoice status and derived balance logic remain the source of truth.
- Void invoices and void payments remain excluded according to current helpers.
- Deposits are collection/cash grouping records, not new revenue.
- Do not double count invoice payments and payment-received records.
- Customer balance reporting should be added as a read-only rollup before any workflow changes.

### AP

Purpose: money HH owes or has paid out.

Initial modules:

- Bills: `/bills`, `/bills/new`, `/bills/[id]`, `/bills/[id]/edit`, plus `/financial/bills` aliases.
- Expenses: `/financial/expenses`, `/financial/expenses/new`, `/financial/expenses/[id]`.
- Receipt intake: `/financial/inbox`, `/financial/receipt-queue`.
- Subcontract bills: existing project subcontract bill routes and helpers.
- Worker payroll: `/labor/payroll`.
- Worker payments: `/labor/payments`.
- Worker reimbursements: `/labor/reimbursements` and `/financial/reimbursements`.
- Worker advances: `/labor/advances`.
- Commissions: `/financial/commissions`.

AP rules:

- AP bills remain AP obligations and payment tracking.
- Project actual cost must not accidentally double count generic AP bills plus expenses/subcontract bills.
- Subcontract bills remain distinct from generic AP bills unless a future migration explicitly unifies them.
- Worker balance remains: unpaid labor owed plus pending/approved reimbursements minus deducted advances, using the existing worker balance path.
- Commission accrual and commission payment tracking must stay separate.

### Cash

Purpose: actual money movement and reconciliation.

Initial modules:

- Accounts: `/financial/accounts`.
- Bank transactions: `/financial/bank`.
- Deposits: `/financial/deposits`.
- Cashflow: `/dashboard/cashflow`.
- Future reconciliation dashboard: same source routes, new shell only.

Cash rules:

- Bank transactions are cash evidence and reconciliation records.
- Deposits connect AR collection to cash, but do not create extra invoice revenue.
- Expense payments and AP payments should be linked to cash only through existing matching/reconciliation behavior.
- Cash overview must distinguish system expenses, bank balance, reconciled total, unreconciled total, and cash difference using current definitions.

### Reports

Purpose: read-only financial intelligence and data quality.

Initial reports:

- Project profit report from project financial snapshots and `/projects/[id]/profit`.
- Labor cost report from payroll/labor cost data.
- Data quality report from `/api/system/data-quality-check` and `/api/system/qa-check`.
- Financial closeout report from Project Workspace Closeout and project snapshots.
- Contract value review from `/settings/project-financial-review`.
- Owner/risk projects report from `/financial/owner`.

Reports should be linked from Financial OS without changing the underlying data model. First reports can be index cards that deep-link into existing pages.

## Route Compatibility Plan

1. Keep all existing routes working.
2. Keep `/financial` as the canonical Financial OS entry point.
3. Keep `/bills` canonical for AP bills until there is a tested reason to promote `/financial/bills`.
4. Keep `/labor/*` payroll, payments, advances, and reimbursements routes physical for now; group them visually under Financial > AP.
5. Keep `/financial/estimates -> /estimates`, `/financial/bills -> /bills`, and `/financial/payments-received -> /financial/payments` redirects.
6. Prefer aliases or redirects before deleting or moving routes.
7. Add new optional aliases only after the grouping shell is stable:
   - `/financial/overview` -> `/financial`
   - `/financial/ar/invoices` -> `/financial/invoices`
   - `/financial/ar/payments-received` -> `/financial/payments`
   - `/financial/ar/deposits` -> `/financial/deposits`
   - `/financial/ap/bills` -> `/bills`
   - `/financial/ap/expenses` -> `/financial/expenses`
   - `/financial/ap/payroll` -> `/labor/payroll`
   - `/financial/ap/reimbursements` -> `/labor/reimbursements`
   - `/financial/ap/advances` -> `/labor/advances`
   - `/financial/cash/accounts` -> `/financial/accounts`
   - `/financial/cash/bank-transactions` -> `/financial/bank`
   - `/financial/reports/project-profit` -> reports index or project financial review shell
8. Update sidebar, command palette, breadcrumbs, and mobile nav only through the central IA registry where practical.
9. Keep active state aware of aliases, especially `/financial/bills`, `/bills`, `/financial/payments-received`, and `/financial/estimates`.
10. Do not change API contracts or introduce new database queries in the navigation-only phase.

## Financial Formula Guardrails

These guardrails apply to all Financial OS phases:

1. No formula changes in Phase 3.1 navigation/grouping.
2. Do not modify invoice totals, invoice payment totals, invoice balance, invoice status, due-date aging, void handling, or payment received behavior.
3. Do not modify deposit creation, deposit totals, or deposit-to-payment relationships.
4. Do not modify AP bill totals, outstanding balance, paid status, due status, or bill payment behavior.
5. Do not modify expense totals, receipt intake status, project linking, or reimbursable expense behavior.
6. Do not modify payroll, worker payments, worker advances, worker reimbursements, or worker balance formulas.
7. Do not modify commission accrual, commission payment, or project commission cost behavior.
8. Do not modify project financial snapshot math:
   - revised contract value.
   - billed amount.
   - paid amount.
   - open AR.
   - actual cost.
   - gross profit.
   - gross margin.
   - cash collected.
   - cash out.
   - cash position.
9. Keep generic AP bill diagnostics separate from canonical project cost unless an explicit future financial design changes that with tests and sign-off.
10. Reports must label basis clearly: invoice basis, cash basis, AP basis, project-profit basis, or data-quality basis.
11. Any future data-model or RLS change requires a separate Supabase-safe plan, column verification, migration review, and regression tests.

## Implementation Phases

### Phase 3.1: Financial OS Navigation Shell

- Update central IA registry and sidebar grouping only.
- Add visible Financial subsections: Overview, AR, AP, Cash, Reports.
- Keep existing hrefs and route aliases.
- Move worker money flows visually under AP while leaving `/labor/*` routes intact.
- Add Reports links to existing project financial review, project profit, data quality, and cashflow surfaces.
- Update command palette only if it reads from the same IA registry.

### Phase 3.2: Overview Composition

- Turn `/financial` into a true Overview shell.
- Reuse `/financial/owner` data and existing finance overview cards.
- Add clear labels for cash basis, invoice basis, AP basis, and project-profit basis.
- Preserve `/financial/owner` as a drill-down or executive dashboard route.

### Phase 3.3: AR Workspace

- Make `/financial/ar` the AR hub.
- Add cards/links for estimates, invoices, payments received, deposits, and future customer balances.
- Reuse current invoice and payment helpers.
- Add focused smoke coverage for invoice list, invoice detail, payment recording, and deposits.

### Phase 3.4: AP Workspace

- Add AP hub or AP section cards for bills, expenses, receipt inbox, subcontract bills, payroll, reimbursements, advances, and commissions.
- Preserve `/bills` as canonical AP bills.
- Keep payroll and worker payout pages route-compatible under `/labor/*`.
- Cross-link People records without moving worker profile routes.

### Phase 3.5: Cash Workspace

- Group accounts, bank transactions, deposits, and cashflow.
- Add reconciliation status summary from current cash overview and bank transaction helpers.
- Do not create new bank matching behavior in this phase.

### Phase 3.6: Reports Index

- Add a read-only Reports landing surface.
- Link to project profit, labor cost, data quality, financial closeout, project financial review, and owner risk reports.
- Reuse existing APIs and project workspace routes.
- Avoid report formula changes; document source helpers for every report card.

### Phase 3.7: Optional Route Aliases

- Add aliases only after visual grouping is stable and tested.
- Prefer redirects over physical file moves.
- Keep analytics or QA checks on old and new routes before deprecating labels.

## Risk Checklist

- Existing routes deleted or moved instead of visually regrouped.
- `/bills` and `/financial/bills` active states drift apart.
- `/financial/payments` and `/financial/payments-received` create duplicate mental models.
- Deposits are counted as new revenue instead of cash/collection evidence.
- Invoice payments and payments received are double counted.
- Generic AP bills are double counted with expenses or subcontract bills in project cost.
- Worker reimbursements are counted once in expenses and again in worker balance without dedupe.
- Worker advances are displayed as costs instead of deductions/offsets.
- Commission accrued cost and commission payments are blended.
- Payroll pages lose People context when moved visually under AP.
- Cash view implies unreconciled bank transactions are booked expenses before current matching rules say so.
- Reports use stale snapshots without warning.
- Contract value review warnings disappear from owner/project profit reporting.
- Supabase client access patterns change accidentally while adding dashboards.
- Mobile sidebar becomes overcrowded under AP.
- Command palette points users to obsolete labels.

## Recommended First PR

Title: `Add Financial OS navigation grouping`

Scope:

- Navigation/UI grouping only.
- No formula changes.
- No schema changes.
- No migrations.
- No API changes.
- No route deletions.
- No Supabase policy changes.

Recommended changes:

1. Update the central IA registry to show Financial sections:
   - Overview
   - AR
   - AP
   - Cash
   - Reports
2. Keep current hrefs:
   - `/financial`
   - `/financial/owner`
   - `/financial/ar`
   - `/estimates`
   - `/financial/invoices`
   - `/financial/payments`
   - `/financial/deposits`
   - `/bills`
   - `/financial/expenses`
   - `/financial/inbox`
   - `/financial/accounts`
   - `/financial/bank`
   - `/financial/commissions`
   - `/labor/payroll`
   - `/labor/payments`
   - `/labor/advances`
   - `/labor/reimbursements`
3. Add Reports nav links to existing safe destinations:
   - `/settings/project-financial-review`
   - `/projects` or project workspace financial/profit drill-downs where context is required.
   - `/dashboard/cashflow`
   - `/system-health`
4. Preserve aliases:
   - `/financial/estimates`
   - `/financial/bills`
   - `/financial/payments-received`
   - legacy `/finance/*` routes.
5. Add or update focused navigation smoke coverage for:
   - `/financial`
   - `/financial/owner`
   - `/financial/ar`
   - `/financial/invoices`
   - `/financial/payments`
   - `/financial/deposits`
   - `/bills`
   - `/financial/expenses`
   - `/financial/inbox`
   - `/financial/accounts`
   - `/financial/bank`
   - `/financial/commissions`
   - `/labor/payroll`
   - `/labor/payments`
   - `/labor/advances`
   - `/labor/reimbursements`

Acceptance criteria:

- Financial navigation reads as Overview, AR, AP, Cash, Reports.
- Every existing route above still loads or redirects as it does today.
- Mobile navigation remains usable with no horizontal overflow.
- Command palette finds key financial modules.
- `git diff --check`, lint, TypeScript, and focused navigation smoke pass in implementation PR.
- No financial formula, schema, migration, API contract, or RLS change appears in the diff.
