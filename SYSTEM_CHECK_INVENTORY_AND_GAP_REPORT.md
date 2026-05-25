# System Check Inventory And Gap Report

Generated: 2026-05-25

Scope: inventory only. This report reviews the existing System Health, System QA, Supabase Data / Number Check, production safety, and financial integrity coverage. It does not add a scanner, change UI/API behavior, alter schema, run migrations, or touch production data.

## A. Executive Summary

HH Unified Web already has a meaningful System module:

- `/system-health` renders System Health, System QA, Supabase Data / Number Check, System Guardian, destructive action safety, active issues, and schema/storage summaries.
- `/api/system/data-quality-check` is the main read-only data quality scanner. It checks project contract anomalies, project snapshot math, expense/header line totals, invoice item/payment math, estimate item precision, labor amount math, reimbursement dedupe risk, and company profile test markers.
- `/api/system/qa-check` aggregates page availability, destructive-route safety, schema/system health, company profile cleanup, project contract review, Supabase Data / Number Check, preview readiness, and mobile route coverage.
- `/api/system/integrity` exists, but today it is a narrow project-task integrity checker, not a full financial integrity scanner.
- Production safety is stronger after recent work: production write tests are blocked by default, dangerous maintenance routes are guarded, and system responses redact secrets.

The largest gap is not another generic data-quality pass. The missing piece is a read-only relationship/dependency scanner:

- TEST / safe to delete / PROD-SMOKE marker inventory across all production modules.
- Invoice/payment/deposit dependency graph and orphan checks.
- Expense/expense_lines/attachment orphan checks.
- Estimate/payment schedule consistency and orphan checks.
- Worker reimbursement/payment/balance relationship checks.
- Project dashboard/owner dashboard parity against `ProjectFinancialSnapshot`.

Recommendation: keep `/api/system/data-quality-check` as the numeric/data-quality scanner and add a small, separate read-only `/api/system/integrity-scan` for relationship/dependency graph checks. Wire only a compact summary into `/system-health` in Phase 1. Do not add cleanup actions in Phase 1.

## B. Existing System Check Inventory

### System Health page

File: `src/app/system-health/page.tsx`

Current visible system areas include:

- System Health summary.
- Supabase Data / Number Check.
- System QA.
- System Guardian.
- Active issues.
- Destructive Action Safety.
- Data Integrity.
- Schema/storage/table status.
- Optional modules.
- Environment/commit metadata.

The page already handles partial/undefined QA responses defensively and separates action-required, optional module, data cleanup, and informational categories.

### System Health API

File: `src/app/api/system-health/route.ts`

Current coverage:

- App route status.
- Supabase server client availability.
- Required table reachability:
  - `projects`
  - `customers`
  - `expenses`
  - `expense_lines`
  - `invoices`
  - `invoice_items`
  - `labor_entries`
  - `workers`
  - `worker_payments`
  - `worker_advances`
  - `worker_reimbursements`
  - `bank_transactions`
  - `company_profile`
  - `app_security_settings`
- Optional table reachability:
  - `expense_options`
  - `payment_methods`
  - `ap_bills`
  - `ap_bill_payments`
  - `payments_received`
  - `payment_received_attachments`
  - `project_change_orders`
  - `project_change_order_items`
  - `estimates`
  - `estimate_items`
  - `worker_receipts`
  - `subcontract_bills`
  - `subcontract_payments`
  - `activity_logs`
- Storage bucket reachability:
  - `branding`
  - `worker-receipts`
  - `expense-attachments`
  - `payment-attachments`
  - `attachments`
- Company profile E2E marker detection.
- App Security / PIN row presence and initialization.
- Project Financial Snapshot dependency summary.
- `/api/schema-check` missing schema aggregation.
- Optional AP/payment-method modules are treated as optional/disabled instead of failed.

### System QA API

File: `src/app/api/system/qa-check/route.ts`

Current coverage:

- Page availability and visible error scanning.
- Test/debug copy visibility scanning.
- Destructive route safety checks.
- Schema and System Health checks.
- Company profile data cleanup tracking.
- Financial data guardrail: project contract value review.
- Supabase Data / Number Check aggregation.
- Receipt/attachment/PDF preview readiness.
- Mobile route coverage list.

### Supabase Data / Number Check API

Files:

- `src/app/api/system/data-quality-check/route.ts`
- `src/lib/system-data-quality.ts`

Current behavior:

- Requires authenticated/PIN session.
- Uses server internal Supabase client.
- Read-only.
- Uses `select("*").limit(500)` per table.
- Checks up to 60 project financial snapshots with bounded concurrency.
- Returns sanitized issues with module, severity, entity, issue code, message, current value, expected value, recommended action, and link.
- Limits returned issues per module to avoid page noise.

### System Guardian API

File: `src/app/api/system/guardian/route.ts`

Current coverage:

- Database connectivity check.
- Storage reachability check.
- Calls `/api/system/integrity`.
- Checks broad route/table reachability for app modules.
- Distinguishes likely schema cache issues when possible.

### Current System Integrity API

Files:

- `src/app/api/system/integrity/route.ts`
- `src/app/api/system/integrity/cleanup/route.ts`

Current coverage is intentionally narrow:

- Orphaned `project_tasks` where project is missing.
- Ghost `project_tasks` with missing/blank title.
- Duplicate project tasks by project/title.
- Overdue incomplete task count.
- Stale test data only for very specific terms:
  - `Workflow Test`
  - `Test Worker`
  - `Test Project`
  - `Test Vendor`
- Cleanup route exists, but it is dangerous maintenance and is guarded by `guardDangerousMaintenanceRequest`.

Important limitation: this is not a full financial or production marker dependency scanner.

### Schema Check API

File: `src/app/api/schema-check/route.ts`

Current coverage:

- Required table and column existence.
- Direct Postgres information_schema path when DB URL is available.
- Supabase client fallback when direct DB URL is unavailable.
- Supports single table/column checks via query params.
- Sanitizes errors before returning.

## C. Existing API / Helper / UI Files

Reviewed System API/UI/helper files:

- `src/app/system-health/page.tsx`
- `src/app/settings/system-health/page.tsx`
- `src/app/api/system-health/route.ts`
- `src/app/api/system/guardian/route.ts`
- `src/app/api/system/integrity/route.ts`
- `src/app/api/system/integrity/cleanup/route.ts`
- `src/app/api/system/data-quality-check/route.ts`
- `src/app/api/system/qa-check/route.ts`
- `src/app/api/schema-check/route.ts`
- `src/app/api/system-metrics/route.ts`
- `src/app/api/system-logs/route.ts`
- `src/app/api/system/backup/route.ts`
- `src/lib/system-data-quality.ts`
- `src/lib/system-log-store.ts`
- `src/lib/system-response-safety.ts`
- `src/lib/production-safety.ts`
- `src/lib/auth-boundary.ts`
- `src/lib/financial/project-financial-snapshot.ts`
- `src/lib/financial/project-financial-review.ts`
- `src/lib/project-cost-dashboard.ts`
- `src/lib/finance-owner-dashboard.ts`
- `tests/system-health-command-center.spec.ts`
- `tests/system-data-quality-check.spec.ts`
- `tests/system-qa-check.spec.ts`
- `tests/production-safety.spec.ts`
- `tests/full-system-smoke-and-data-flow.spec.ts`
- `tests/project-financial-snapshot-api.spec.ts`
- `tests/financial-owner-dashboard.spec.ts`

## D. Current Data Quality Checks

Current checks in `src/lib/system-data-quality.ts`:

### Projects

- Missing project name.
- Missing project status.
- Contract/budget review via `getProjectContractReviewIssues`.
- Project financial snapshot API failure.
- Invalid, negative, or component-mismatched `actualCost`.
- Pending expense/reimbursement costs that are excluded from confirmed actual cost.

### Expenses

- Header amount with more than two decimal places.
- Expense line amount with more than two decimal places.
- Header amount missing while lines exist.
- Header amount vs expense line sum mismatch.
- Header-only amount without lines.
- Finalized expense missing project assignment.
- Pending/needs-review expense cost exists.
- Negative expense amount.

### Invoices

- Invoice amount fields with more than two decimal places.
- Invoice item quantity/rate/amount mismatch.
- Invoice item fractional currency fields.
- Subtotal vs item sum mismatch.
- Paid amount greater than invoice total.
- Balance due mismatch.
- Paid invoice with open balance.
- Unpaid/draft/open invoice with payments.
- Void/cancelled payments possibly counted in paid amount.

### Estimates

- Estimate total/subtotal/tax/amount fractional-cent display risk.
- Estimate item quantity/rate/amount mismatch.
- Estimate item fractional currency fields.
- Estimate subtotal vs item sum mismatch.
- Negative estimate total.

### Labor / Workers

- Labor entry negative hours/rate/amount.
- Labor entry amount mismatch vs hours times rate.
- Void/rejected labor entry with positive amount.
- Worker payment zero amount.
- Worker payment negative amount.
- Worker advance negative amount.

### Reimbursements

- Missing reimbursement amount.
- Negative reimbursement amount.
- Pending/approved reimbursement exists and should not be counted as confirmed actual cost.
- Reimbursement linked to expense path, which creates dedupe risk.

### Company Profile

- E2E-ST / E2E-ZIP / test marker fields.
- Missing company name.

## E. Current Financial Integrity Checks

Existing financial integrity coverage is strongest around project snapshots and invoice/estimate/expense math, but it is not yet a full relationship graph scanner.

### ProjectFinancialSnapshot

File: `src/lib/financial/project-financial-snapshot.ts`

Current snapshot formula:

- `revisedContractValue = contractValue + approvedChangeOrders`
- `actualCost = expenseCost + laborCost + reimbursementCost + subcontractCost`
- `grossProfit = revisedContractValue - actualCost`
- `grossMargin = grossProfit / revisedContractValue` when contract is positive

Current source concepts:

- Confirmed vs pending expenses.
- Confirmed vs pending reimbursements.
- Reimbursement dedupe diagnostics.
- Labor cost.
- Subcontract cost.
- Invoice/payment/AR summary.
- Contract trust/guard diagnostics.

### Project Cost Dashboard

File: `src/lib/project-cost-dashboard.ts`

Current behavior:

- Uses canonical project financial calculations for project cost display.
- Aligns expense, labor, reimbursement, and subcontract components with snapshot-style cost categories.

### Owner Dashboard

File: `src/lib/finance-owner-dashboard.ts`

Recent behavior:

- Owner Dashboard top projects/underwater projects prefer `ProjectFinancialSnapshot`.
- Project ranking uses:
  - revenue = `revisedContractValue`
  - expense = `actualCost`
  - profit = `grossProfit`
  - profitPct = `grossMargin`

### Project Financial Review

File: `src/lib/financial/project-financial-review.ts`

Current coverage:

- Missing contract/budget.
- Zero contract/budget.
- $1 placeholder contract/budget.
- Suspicious huge contract/budget.
- Significant budget vs contract mismatch.

## F. Current Security / Production Safety Checks

### Auth and API boundaries

Files:

- `src/lib/auth-boundary.ts`
- `src/lib/production-safety.ts`
- `src/lib/system-response-safety.ts`

Current coverage:

- `requireAuthenticatedUser`.
- `requireAdminUser`.
- `requireInternalAdminAccess`.
- Local test auth bypass only outside production.
- Dangerous maintenance guard via `guardDangerousMaintenanceRequest`.
- Production safety lock header support.
- Internal admin secret support.
- Secret redaction for DB URLs, service role keys, admin secrets, PIN secrets, and JWT-like tokens.

### Production write prevention

Files/tests:

- `tests/e2e-supabase-url-guard.ts`
- `playwright.config.ts`
- `tests/production-safety.spec.ts`
- production smoke/script guards

Current coverage:

- Production app URLs are read-only by default for Playwright write tests.
- `ALLOW_PROD_TEST_WRITES=1` is required for intentional production write runs.
- Hosted Supabase URLs are blocked for E2E DB mutations unless explicitly overridden.
- Production read-only specs are allowlisted.
- Dangerous maintenance APIs are expected to return 403 when production safety lock is active.

### Backup / logs / metrics

Files:

- `src/app/api/system/backup/route.ts`
- `src/app/api/system-logs/route.ts`
- `src/app/api/system-metrics/route.ts`

Current coverage:

- Backup route is guarded dangerous maintenance.
- Logs are sanitized before being returned.
- Metrics route returns row counts for core tables.

## G. Current Test Marker / Cleanup Coverage

Current coverage exists, but it is split between test cleanup helpers, production safety guards, and a narrow System Integrity route.

### Existing marker detection

- Company profile E2E marker detection is in System Health/Data Quality.
- `/api/system/integrity` checks only narrow `Workflow Test`, `Test Worker`, `Test Project`, `Test Vendor` terms in project task/project data.
- E2E cleanup scripts detect broader test markers for local/test cleanup.
- Production write guard blocks most future accidental production marker creation.

### Existing cleanup paths

- `tests/e2e-cleanup-db.ts` cleans local/test data, guarded against hosted Supabase by default.
- `src/lib/cleanup-test-data.ts` and production cleanup APIs exist, but broad production cleanup is intentionally dangerous and guarded.
- `/api/system/integrity/cleanup` can delete project task integrity categories and stale project/task test data, but only after dangerous maintenance guard passes and explicit confirmation.

### Key limitation

There is no read-only production marker inventory that scans all modules for strong markers such as:

- `TEST`
- `safe to delete`
- `PROD-SMOKE`
- `E2E`
- `Playwright`
- `Smoke Test`
- `Full Flow`
- `Payment Schedule`
- `Invoice Payment Flow`
- `Schedule Invoice`

There is also no built-in dependency graph report for marker rows before cleanup.

## H. Current Orphan / Relationship Coverage

Existing relationship coverage:

- `project_tasks` orphan/ghost/duplicate checks in `/api/system/integrity`.
- Schema/table existence checks in `/api/schema-check` and `/api/system-health`.
- Data Quality groups child rows by parent ID for calculations:
  - `expense_lines` grouped by `expense_id`
  - `invoice_items` grouped by `invoice_id`
  - `invoice_payments` grouped by `invoice_id`
  - `estimate_items` grouped by `estimate_id`
- Project snapshot logic dedupes reimbursement/expense paths.

Missing relationship coverage:

- `invoice_items` without invoice.
- `invoice_payments` without invoice.
- `invoice_payments` without `payments_received` when linked.
- `payments_received` without invoice/payment context.
- `deposits` linked to missing invoice/payment.
- `payment_received_attachments` linked to missing payment.
- `expense_lines` without expense.
- `expense_attachments` without expense/object.
- `estimate_payment_schedule_items` linked to missing estimate/invoice.
- `labor_entries` linked to missing worker/project.
- `worker_reimbursements` linked to missing worker/project/expense.
- `worker_receipts` linked to missing worker/reimbursement/project/storage object.
- `project_change_orders`/`change_orders` linked to missing project.
- Marker dependency graph across project/customer/invoice/payment/deposit/expense/labor chains.

## I. Missing Checks / Gaps

### Missing: Test Marker Data scanner

Current System checks do not broadly inventory production marker residue across customers, projects, estimates, invoices, payments, deposits, expenses, labor, worker receipts, storage paths, and notes/reference fields.

### Missing: Dependency graph scanner

The recent production cleanup needed manual exact-ID dependency graph work. The System module does not yet generate a read-only dependency graph for a marker row before cleanup.

### Missing: Invoice/payment/deposit orphan scanner

Data Quality catches invoice math contradictions but does not fully validate `payments_received`, `invoice_payments`, `deposits`, and payment attachments as a relationship graph.

### Missing: Expense/expense_lines orphan scanner

Data Quality catches header/line sum mismatches for expenses it loads, but does not explicitly flag orphan `expense_lines` whose parent expense is missing, or attachment rows whose parent expense/object is missing.

### Missing: Worker balance reconciliation scanner

Current Data Quality detects obvious labor/payment/reimbursement anomalies. It does not reconcile worker payable from labor entries, reimbursements, advances, and payments into a per-worker balance report.

### Missing: Estimate/payment schedule consistency scanner

Estimate item totals are checked, but there is no System-level scan for payment schedule totals, schedule item orphan links, schedule invoice linkage, or convert-to-invoice consistency.

### Missing: Project dashboard vs ProjectFinancialSnapshot parity scanner

Owner Dashboard now uses snapshot values for project ranking, and tests cover the main path. System Health does not yet have a scanner that compares dashboard/project-cost output against `ProjectFinancialSnapshot` for sampled projects.

### Missing: Production test write prevention scan

The codebase has production write guards and tests. System Health does not expose a read-only check summarizing whether the guard is configured, nor does it scan recent marker pollution risk.

## J. Duplicate Risk If Adding New Scanner

Avoid duplicating these existing checks:

- Required/optional table reachability: already in `/api/system-health`.
- Column existence/schema drift: already in `/api/schema-check`.
- Project contract value review: already in `project-financial-review` and System QA.
- Numeric anomalies: already in `/api/system/data-quality-check`.
- Company profile E2E marker: already checked in System Health and Data Quality.
- Destructive route guard verification: already in System QA and `tests/production-safety.spec.ts`.
- Project task orphan/ghost/duplicate checks: already in `/api/system/integrity`.

New scanner should focus on relationship/dependency graph integrity, not reimplement row-level numeric validators.

## K. Recommended Phase 1 System Integrity Scanner Design

### API recommendation

Create a new read-only route:

- `/api/system/integrity-scan`

Rationale:

- `/api/system/data-quality-check` should remain the numeric/data-quality scanner.
- `/api/system/integrity` currently has a different response contract for project task cleanup categories.
- A relationship/dependency graph scan needs different result shapes:
  - module summaries
  - orphan counts
  - marker rows
  - linked parent/child counts
  - exact IDs
  - skip/safety reasons
- Keeping it separate avoids overloading Data Quality and reduces duplicate/noise risk.

### Reuse existing code

Reuse:

- `requireAuthenticatedUser` from `src/lib/auth-boundary.ts`.
- `getServerSupabaseInternalNoStore` from Supabase server helpers.
- `safeErrorMessage` and `redactSensitiveText` from `src/lib/system-response-safety.ts`.
- `ProjectFinancialSnapshot` helpers for cost/profit parity.
- `getProjectContractReviewIssues` for contract guard context.
- Existing System Health issue categories and compact UI display patterns.

### Phase 1 read-only checks

Keep Phase 1 small:

1. Test marker inventory:
   - Scan exact strong marker patterns across safe text fields.
   - Return counts and top rows only.
   - Do not delete or propose automatic cleanup in the API.

2. Invoice/payment/deposit relationships:
   - `invoice_items` without invoice.
   - `invoice_payments` without invoice.
   - `invoice_payments.payment_received_id` without `payments_received`.
   - `payments_received.invoice_id` missing invoice when present.
   - `deposits.invoice_id`/`payment_id` missing target when present.
   - `payment_received_attachments` missing payment target when table/columns exist.

3. Expense relationships:
   - `expense_lines` without expense.
   - `expense_attachments` without expense when schema supports it.
   - Header/line mismatch can link to existing Data Quality instead of duplicating.

4. Estimate relationships:
   - `estimate_items` without estimate.
   - `estimate_payment_schedule_items` without estimate.
   - Schedule items linked to missing invoice.
   - Schedule total vs estimate total warning when fields are present and safe to verify.

5. Worker relationships:
   - `labor_entries` missing worker/project.
   - `worker_reimbursements` missing worker/project/expense linkage where required.
   - `worker_receipts` missing worker/reimbursement/project linkage where fields exist.

6. Project financial parity sample:
   - For a limited number of projects, compare snapshot actual cost components and dashboard-facing values.
   - Report parity issues only; do not modify calculations.

### System Health UI recommendation

Add a compact section later:

- Title: `System Integrity Scanner`
- Summary counts:
  - Critical relationship issues
  - Warning marker/data cleanup issues
  - Modules scanned
  - Rows sampled
- Top issues table:
  - severity
  - module
  - entity
  - issue code
  - safe link
  - recommended action

Do not add cleanup buttons in Phase 1.

### Phase 2

Defer:

- Full worker payable reconciliation.
- Storage object orphan scan.
- Dependency graph cleanup SQL proposal generator.
- Scan history persistence.
- Scheduled scan/cron.
- Admin cleanup workflow.
- Broad production cleanup endpoint replacement.

### Database table recommendation

Phase 1 does not need a database table. Run on demand and return sanitized results.

Consider a table later only if the product needs:

- scan history
- trend charts
- owner acknowledgements
- scheduled scan results

Possible future table: `system_integrity_scan_runs`. Do not add it now.

### Scheduled job recommendation

No scheduled job now. Add on-demand scanner first, then decide whether a weekly read-only run is useful.

## L. Do Not Build Yet

Do not build the scanner until the Phase 1 scope is approved.

Do not add:

- Cleanup endpoint.
- Destructive action.
- Migration.
- New persistent table.
- GitHub Action.
- Watcher.
- Production data mutation.
- UI redesign.

## M. Suggested Next Codex Prompt

```text
Use using-superpowers.
Use hh-code-logic-ui-review.
Also apply hh-supabase-safety, hh-playwright-qa, hh-financial-integrity-guard, hh-financial-regression-guard, verification-before-completion.

Please implement Phase 1 of the read-only System Integrity Scanner.

Scope:
- Add /api/system/integrity-scan as read-only and authenticated.
- Do not add cleanup.
- Do not add migration.
- Do not modify production data.
- Reuse system-response-safety redaction and auth-boundary.
- Return compact sanitized summaries and top issues.

Checks:
1. Strong TEST marker inventory across customers/projects/estimates/invoices/payments/deposits/expenses/labor/worker receipts.
2. Invoice/payment/deposit orphan/link checks.
3. Expense/expense_lines/attachment orphan checks.
4. Estimate/payment schedule orphan/link checks.
5. Worker reimbursement/receipt relationship checks.
6. Small sampled project snapshot parity summary.

UI:
- Add a compact System Integrity Scanner section to /system-health.
- Do not add cleanup buttons.

Tests:
- Add targeted Playwright/API test proving auth is required, secrets are redacted, known mocked issues display, and no cleanup endpoint is called.
```

## N. Final Status

This was an inventory/report-only pass.

No System UI, API, helper, schema, migration, production data, test workflow, or deployment changes were made by this report.

Recommended next step: review and approve the Phase 1 scanner scope before any implementation.
