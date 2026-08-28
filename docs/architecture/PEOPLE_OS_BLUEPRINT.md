# HH Project OS Phase 4: People OS Blueprint

Audit mode: plan only. This report does not change code, schema, migrations, API contracts, payroll formulas, financial formulas, deployment settings, Supabase policies, or production data.

## Executive Summary

HH Project already has the core people surfaces needed for a Construction ERP, but they are split by workflow history:

- Customers live in `/customers` and connect to projects, estimates, invoices, payments, and change orders.
- Workers live in `/workers`, while time, payroll, reimbursements, advances, payments, receipts, balances, and some legacy worker routes still live under `/labor/*`.
- Vendors live at `/financial/vendors`, with `/vendors` redirecting there, because vendors are primarily AP/expense payees today.
- Subcontractors live at `/subcontractors`, with `/labor/subcontractors` legacy redirects, and include contract, billing, payment, AP, W-9, and insurance context.
- Project Workspace V3 already has a lightweight People tab that links customer, worker, subcontractor, vendor/payee, and commission-person context from existing project data.

Phase 4 should make the long-term People OS explicit without merging tables or changing money math. The safe path is a read-model-first operating system:

1. Keep existing profile and financial modules working.
2. Group People as Customers, Workers, Vendors, Subcontractors, and future All Contacts.
3. Build a read-only contact index from existing tables before creating any new contact schema.
4. Preserve payroll, worker balance, AR, AP, subcontract, invoice, and project formulas.
5. Add unified `contacts` and `contact_roles` only after a separate schema-verified migration plan, reconciliation report, and rollback path.

The recommended first PR is navigation/read-model only: no schema changes, no payroll formula changes, no financial formula changes, no route deletion, and no API contract changes.

## Current People Route Map

### Customers

| Current route         | Current role                                                                                                       | Future People OS home    | Notes                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `/customers`          | Customer list and profile management. Loads `customers` through `getAllCustomers()` and renders `CustomersClient`. | Customers                | Canonical customer entry point. Also appears under Projects today because customers are project-facing. |
| `/customers/[id]`     | Customer detail with editable profile fields and related work.                                                     | Customers                | Related work includes projects, estimates, and change orders through the customer API.                  |
| `/api/customers`      | Authenticated customer list/create API using the server internal Supabase client.                                  | Customers read/write API | Keep contract stable; no People OS schema changes in Phase 4.                                           |
| `/api/customers/[id]` | Customer detail/update/delete API. Checks related projects before deletion.                                        | Customers read/write API | Deletion guard is important for project/customer integrity.                                             |

### Workers

| Current route                       | Current role                                                                                                            | Future People OS home            | Notes                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/workers`                          | Worker profile list. Uses `workers-db` with fallback to `labor-db`.                                                     | Workers                          | Canonical worker profile route.                                                                        |
| `/workers/[id]`                     | Worker dashboard with profile, rate history, labor ledger, invoices, and financial summary fetched through worker APIs. | Workers                          | Best long-term worker profile surface.                                                                 |
| `/workers/[id]/edit`                | Worker edit route.                                                                                                      | Workers                          | Keep route compatibility even if edit UX later moves into the profile.                                 |
| `/workers/[id]/statement`           | Worker statement with earnings and payments.                                                                            | Workers, Financial/AP            | Uses labor entries and payments. Treat as financial readout; do not change formula in People OS shell. |
| `/workers/[id]/statement/print`     | Printable worker statement.                                                                                             | Workers, Documents               | Preserve print route and output.                                                                       |
| `/workers/summary`                  | Date-range worker summary. Calls `/api/workers/summary` for work days, earned, paid, and outstanding.                   | Workers, Financial/AP            | Useful People dashboard tile, but its money values are payroll-sensitive.                              |
| `/labor/workers`                    | Legacy/alternate labor worker management surface.                                                                       | Workers legacy compatibility     | Keep route. Prefer `/workers` visually.                                                                |
| `/labor/workers/[id]`               | Redirects to `/workers/[id]`.                                                                                           | Workers compatibility            | Keep redirect.                                                                                         |
| `/labor/workers/[id]/balance`       | Worker balance detail route.                                                                                            | Financial/AP, Workers drill-down | Keep financial guardrails.                                                                             |
| `/worker/[workerId]/monthly-report` | Worker monthly report and print artifacts.                                                                              | Workers, Financial/AP, Documents | Preserve route; can become a Worker profile report link.                                               |
| `/api/labor/workers/*`              | Worker APIs for list, detail, balance, pay, rate history, and financial summary.                                        | Worker profile and payroll APIs  | Uses server internal/admin patterns in sensitive routes. Do not loosen RLS.                            |

### Worker Money And Labor Adjacencies

These are People-related but should remain visually under Financial/AP where Phase 3 placed them.

| Current route            | Current role                                  | Future People OS relationship                | Notes                                                                    |
| ------------------------ | --------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `/labor/payroll`         | Payroll summary and pay-worker workflow.      | Worker profile deep-link, Financial/AP owner | Uses `buildPayrollSummaryRows()`. Do not change payroll formulas.        |
| `/labor/payments`        | Worker payment ledger and receipt preview.    | Worker profile deep-link, Financial/AP owner | Payment records remain the payout ledger.                                |
| `/labor/advances`        | Worker advances.                              | Worker profile deep-link, Financial/AP owner | Advances net against worker balances when deducted.                      |
| `/labor/reimbursements`  | Worker reimbursements and receipt workflow.   | Worker profile deep-link, Financial/AP owner | Reimbursements can overlap expense/receipt workflows; keep dedupe rules. |
| `/labor/worker-balances` | Worker balance list.                          | Worker profile deep-link, Financial/AP owner | Formula is settlement-sensitive. Keep as AP/payroll readout.             |
| `/labor/worker-invoices` | Worker invoice tracking.                      | Worker profile deep-link, Financial/AP owner | Worker payables, not a generic contact feature.                          |
| `/labor/receipts`        | Worker receipts filtered by optional project. | Documents, Workers                           | Treat as worker-related documents.                                       |
| `/financial/workers`     | Older worker reimbursement balance surface.   | Financial/AP compatibility                   | Keep route or redirect in a later compatibility PR after usage audit.    |

### Vendors

| Current route        | Current role                                                                                      | Future People OS home | Notes                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `/vendors`           | Redirects to `/financial/vendors`.                                                                | Vendors compatibility | Keep alias.                                                              |
| `/financial/vendors` | Vendor registry UI backed by `/api/vendors`.                                                      | Vendors, Financial/AP | Canonical vendor surface today. Vendor names also appear in expenses/AP. |
| `/api/vendors`       | Authenticated vendor list/create API using server internal Supabase and runtime column discovery. | Vendor API            | Preserve response shape and column fallback behavior.                    |
| `/api/vendors/[id]`  | Vendor update/delete/detail API.                                                                  | Vendor API            | Keep API contract stable.                                                |

### Subcontractors

| Current route                         | Current role                                                                                                                                 | Future People OS home              | Notes                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `/subcontractors`                     | Subcontractor list with insurance alerts, contracts, scheduled amount, billed-to-date, paid-to-date, AP outstanding, and remaining contract. | Subcontractors                     | Canonical subcontractor entry point.                               |
| `/subcontractors/[id]`                | Subcontractor profile with W-9, insurance, contracts, progress payments, and AP-linked financial summary.                                    | Subcontractors                     | Important AP/contract guardrail surface.                           |
| `/projects/[id]/subcontracts`         | Project-specific subcontracts list.                                                                                                          | Project Workspace People/Financial | Keep as project drill-down.                                        |
| `/projects/[id]/subcontracts/[subId]` | Project subcontract detail, bills, schedule, and payments.                                                                                   | Project Workspace People/Financial | Do not collapse into generic vendor AP without explicit migration. |
| `/labor/subcontractors`               | Redirects to `/subcontractors`.                                                                                                              | Subcontractors compatibility       | Keep redirect.                                                     |
| `/labor/subcontractors/[id]`          | Redirects to `/subcontractors/[id]`.                                                                                                         | Subcontractors compatibility       | Keep redirect.                                                     |

### Project People Links

| Current surface             | Current role                                                                              | Future People OS home    | Notes                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `/projects/[id]?tab=people` | Project Workspace V3 People panel.                                                        | Project Workspace People | Derives Customer, Workers, Subcontractors, Vendors/Payees, and Commission from project data. |
| Customer project link       | Uses `displayProject.customerId` when available, otherwise customer/client text fallback. | Customers                | Keep fallbacks until contact normalization is proven.                                        |
| Worker project link         | Derived from task worker names and labor entry worker names.                              | Workers                  | Name-derived today; future contact links need reconciliation.                                |
| Vendor/payee project link   | Derived from AP bill vendor names.                                                        | Vendors, Financial/AP    | Name-derived today; avoid assuming vendor IDs exist on every bill/expense.                   |
| Commission people           | Derived from commission `person_name`.                                                    | Future Sales Rep role    | Treat as future `Sales Rep` role, not a vendor by default.                                   |

## Current Table/Model Map

This map is based on current route/helper usage, not a migration proposal.

| Current table/model                         | Current role                                                                                      | People OS interpretation                            | Guardrail                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `customers`                                 | Customer profile source with name, contact person, company, email, phone, address, notes, status. | Source for Customer contacts.                       | Do not break `projects.customer_id`, project client fallbacks, estimate/invoice customer matching, or customer deletion guard. |
| `projects`                                  | Project/customer relationship and project-scoped people links.                                    | Project relationship source.                        | Keep project `customer_id`, `client`, and legacy name matching until a verified contact link exists.                           |
| `invoices`                                  | Customer AR documents.                                                                            | Customer financial history.                         | Do not change invoice status, derived balance, void, payment, or deposit behavior.                                             |
| `payments_received`                         | Customer payment records.                                                                         | Customer AR collection history.                     | Do not double count payments and deposits.                                                                                     |
| `workers`                                   | Worker profile source used by `/workers`, worker APIs, payroll summary, and rate history.         | Source for Worker contacts.                         | Worker identity is payroll-sensitive; preserve IDs and rate history.                                                           |
| `labor_workers`                             | Labor-entry FK compatibility table and name source in labor helpers.                              | Worker compatibility/source bridge.                 | Do not delete or bypass; labor entries may reference this table.                                                               |
| `worker_rate_history`                       | Worker rate history used by worker profile and labor snapshots.                                   | Worker payroll metadata.                            | Contact migration must not mutate rates or effective dates.                                                                    |
| `labor_entries`                             | Project labor entries with worker, project, date, session/hours, and cost snapshots.              | Worker project participation and labor cost source. | Do not change labor cost snapshots, unpaid/paid settlement, or project labor formulas.                                         |
| `worker_payments`                           | Worker payout ledger and receipt source.                                                          | Worker AP/payroll payment history.                  | Payments are an audit ledger; linked settlement logic must remain intact.                                                      |
| `worker_advances`                           | Worker advances/deductions.                                                                       | Worker AP/payroll offset source.                    | Only deducted advances offset outstanding worker balance.                                                                      |
| `worker_reimbursements`                     | Worker reimbursement obligations and paid state.                                                  | Worker AP/payroll reimbursement source.             | Pending/unpaid reimbursements affect balances; paid state and receipt links matter.                                            |
| `worker_invoices`                           | Worker invoice/payable records.                                                                   | Worker AP/payroll document source.                  | Preserve paid/open status and project allocation behavior.                                                                     |
| `labor_invoices` and `labor_payments`       | Legacy labor invoice/payment models exposed through labor helpers.                                | Worker compatibility ledgers.                       | Keep in read models until fully reconciled with newer worker tables.                                                           |
| `vendors`                                   | Vendor/payee registry used by `/financial/vendors` and vendor APIs.                               | Source for Vendor contacts.                         | Vendor names still appear on expenses/AP; do not assume every AP row has a vendor ID.                                          |
| `expenses` and expense lines                | Expense/AP records with vendor/payee names and project links.                                     | Vendor/project spend context.                       | Avoid duplicate AP counting when linking vendors to contacts.                                                                  |
| `ap_bills`                                  | AP bills, project links, vendor/payee names, paid/balance amounts.                                | Vendor/subcontractor payable context.               | Keep AP bill status, paid amount, and balance logic unchanged.                                                                 |
| `subcontractors`                            | Subcontractor profile with contact details, active state, W-9, insurance, notes.                  | Source for Subcontractor contacts.                  | Do not merge with vendors until contract/AP semantics are preserved.                                                           |
| `subcontracts`                              | Project-subcontractor commitments.                                                                | Subcontractor project relationship source.          | Contract amount is committed cost; keep separate from generic AP bills.                                                        |
| `subcontract_bills`                         | Subcontract-specific bills.                                                                       | Subcontractor AP source.                            | Do not double count with linked `ap_bills`.                                                                                    |
| `subcontract_payments`                      | Payments against subcontract bills/contracts.                                                     | Subcontractor payment source.                       | Keep current paid-to-date and remaining contract formulas.                                                                     |
| `payment_schedule_items`                    | Scheduled subcontract/AP payments with optional AP bill links.                                    | Subcontractor payable schedule source.              | Linked AP bills change billing basis; preserve current summary logic.                                                          |
| `commissions` and `commission_payments`     | Sales/person commission obligations and payments.                                                 | Future Sales Rep role.                              | Keep commission accrual and payment distinction.                                                                               |
| `documents`, `site_photos`, receipt storage | Documents and attachments tied to projects, receipts, W-9s, statements.                           | Future contact document links.                      | Do not move storage paths or access patterns in People OS shell.                                                               |

## Future People OS Map

### Customers

Purpose: people and companies that buy work from HH.

Initial surface:

- `/customers`
- `/customers/[id]`
- Project Workspace People customer card
- AR customer balance links in future Financial OS

Future read model:

- Profile fields from `customers`.
- Related projects from `projects.customer_id` plus legacy client name fallback.
- Related estimates/change orders from current customer detail API.
- Related invoices, payments received, deposits, and AR balance as read-only rollups.

### Workers

Purpose: people who perform labor and are paid through payroll/worker AP.

Initial surface:

- `/workers`
- `/workers/[id]`
- `/workers/summary`
- Worker profile links from Project Workspace People
- Financial/AP links to payroll, payments, advances, reimbursements, balances, invoices, receipts

Future read model:

- Profile fields from `workers`.
- Compatibility names from `labor_workers`.
- Rate history from worker rate helpers.
- Labor participation from `labor_entries`.
- Open balance, reimbursements, advances, payments, invoices, and statements as read-only financial tiles.

### Vendors

Purpose: companies or people HH buys from that are not necessarily subcontractors.

Initial surface:

- `/financial/vendors`
- `/vendors` redirect
- Vendor/payee names from expenses and AP bills
- Vendor/payee project links from Project Workspace People

Future read model:

- Profile fields from `vendors`.
- Expense and AP usage by vendor name until FK links exist.
- Project spend context from expenses, AP bills, and project cost dashboard.
- Optional merge candidates with subcontractors only as suggestions, never automatic merges.

### Subcontractors

Purpose: trade partners with contracts, commitments, schedule/bill/payment flow, W-9, and insurance requirements.

Initial surface:

- `/subcontractors`
- `/subcontractors/[id]`
- `/projects/[id]/subcontracts`
- `/projects/[id]/subcontracts/[subId]`
- `/labor/subcontractors*` redirects

Future read model:

- Profile fields from `subcontractors`.
- Project commitments from `subcontracts`.
- Billed, paid, AP outstanding, scheduled, and remaining contract from current subcontract financial helpers.
- Documents from W-9, insurance, contracts, and project document links.

### Future All Contacts

Purpose: one searchable directory across customers, workers, vendors, subcontractors, architects, engineers, inspectors, and sales reps.

First version should be read-only and generated from current source tables:

- Customer contacts from `customers`.
- Worker contacts from `workers`, with `labor_workers` as compatibility enrichment.
- Vendor contacts from `vendors`.
- Subcontractor contacts from `subcontractors`.
- Sales Rep contacts from commission person names once identity confidence is high.
- Architect, Engineer, and Inspector contacts from future project/document/inspection metadata once those sources are explicit.

Do not introduce a single-write All Contacts module until duplicate detection, role assignment, source ownership, RLS, and rollback behavior are designed.

## Unified Contacts + Roles Plan

### Target Direction

Future schema direction, after a separate verified migration plan:

- `contacts`: one row per person or organization, with normalized display name, company/person type, email, phone, address, status, notes, and audit metadata.
- `contact_roles`: many-to-many role assignments from a contact to one or more roles.
- Role types:
  - Customer
  - Worker
  - Vendor
  - Subcontractor
  - Architect
  - Engineer
  - Inspector
  - Sales Rep

### Source Ownership

Use source ownership to avoid accidental financial drift:

| Source module  | Owns                                                       | Future contact behavior                                                            |
| -------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Customers      | AR/customer-facing identity and project client link.       | Customer role reads from customer source until migration is complete.              |
| Workers        | Payroll identity, rate history, labor entries, statements. | Worker role must preserve worker ID and payroll ledger links.                      |
| Vendors        | Expense/AP payee identity.                                 | Vendor role can normalize payee display but must preserve historical vendor names. |
| Subcontractors | Contract identity, W-9, insurance, subcontract AP.         | Subcontractor role must preserve contract relationships and AP summaries.          |
| Commissions    | Sales/person payout identity.                              | Sales Rep role should start as read-only from commission people.                   |

### Migration Principles

1. Start with a read-only union view or application read model.
2. Add duplicate candidate reporting before any merge flow.
3. Require explicit user confirmation for merges.
4. Store source table and source ID on any future contact link.
5. Support companies and individuals. Do not force every row into a person shape.
6. Support multiple roles on the same contact, but keep role-specific source IDs.
7. Keep old routes and APIs as compatibility surfaces until at least one full release cycle after dual-read verification.
8. Only add `contacts` and `contact_roles` after schema columns are verified per `AGENTS.md` and a migration rollback plan exists.

### Suggested Future Read Model Shape

For a read-only People OS shell, shape each contact card like this without changing storage:

| Field              | Source                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `displayName`      | Customer/vendor/subcontractor/worker name, with existing fallbacks.                                    |
| `contactType`      | Person, company, or unknown when the source does not distinguish.                                      |
| `roles`            | Derived role labels from source membership.                                                            |
| `primaryEmail`     | Source email where present.                                                                            |
| `primaryPhone`     | Source phone where present.                                                                            |
| `sourceRefs`       | Array of `{ sourceTable, sourceId, route }`.                                                           |
| `projectRefs`      | Current project links from source modules.                                                             |
| `financialRefs`    | Links only, not recomputed numbers, for AR/AP/payroll/subcontract ledgers.                             |
| `dataQualityFlags` | Missing email/phone, duplicate name candidate, stale insurance, inactive status, orphaned vendor name. |

## Payroll/Worker Balance Guardrails

These guardrails apply to all People OS phases:

1. Do not change payroll formulas in People OS navigation or read-model work.
2. Preserve `buildPayrollSummaryRows()` behavior:
   - `earned = laborOwed + workerInvoices + laborInvoices`
   - `shouldPay = earned + reimbursements`
   - `paid = workerPayments + workerAdvances`
   - `balance = shouldPay - paid`
3. Preserve worker balance behavior from `workerOutstandingBalanceFromUnsettledItems()`:
   - `balance = unpaid laborOwed + unpaid reimbursements - deducted advances`
   - Worker payments remain an audit ledger and must not be subtracted a second time after item-level settlement.
4. Preserve `isLaborUnpaidForWorkerPayroll()` settlement rules, including `worker_payment_id` and legacy `labor_entry_ids` mapping.
5. Do not merge or rewrite `workers` and `labor_workers` in a shell PR. The current bridge prevents FK and environment drift problems.
6. Do not mutate worker rate history when creating contact read models.
7. Do not convert advances into expenses or reimbursements.
8. Do not mark reimbursements paid from a People profile without using existing reimbursement/payment workflows.
9. Keep worker statement and monthly report routes working.
10. Keep service/internal Supabase access patterns for protected payroll tables. Do not loosen RLS for People OS.

## Vendor/Subcontractor AP Guardrails

1. Vendors and subcontractors may look like the same real-world company, but they are not interchangeable in the data model today.
2. Vendor AP comes from expenses and generic AP bills; subcontractor AP comes from subcontracts, subcontract bills, payment schedules, linked AP bills, and subcontract payments.
3. Preserve current subcontract summary logic:
   - `contractAmount`
   - `scheduledAmount`
   - `billedToDate`
   - `paidToDate`
   - `apOutstanding`
   - `remainingContract`
4. Do not double count `subcontract_bills` and linked `ap_bills`.
5. Do not migrate vendor names on historical expenses/AP bills without a reconciliation report.
6. Do not turn every subcontractor into a vendor automatically. Use merge candidates and explicit role assignment later.
7. Preserve W-9 and insurance metadata on subcontractor profiles.
8. Keep `/subcontractors` as the canonical subcontractor route and `/financial/vendors` as the canonical vendor registry until a tested People OS shell decides otherwise.

## Customer/Project/Invoice Guardrails

1. Do not change project/customer matching or invoice/customer matching in a People OS shell.
2. Preserve `customers` as the source for customer profile fields until a contact migration is approved.
3. Preserve `projects.customer_id`, project `client`/`client_name` fallbacks, and estimate client name fallbacks.
4. Preserve invoice status, derived balance, void handling, payment-received links, and deposit behavior.
5. Do not merge customers by name or email automatically; customer duplicates can have financial history.
6. Keep customer deletion blocked when linked projects exist.
7. Customer AR rollups should be read-only at first and should label their source helpers.
8. Future contacts must not change historical invoice display names unless explicitly designed and audited.

## Route Compatibility Plan

1. Keep all current People, Labor, Financial, Project, and API routes working.
2. Keep canonical visible destinations:
   - Customers: `/customers`
   - Workers: `/workers`
   - Vendors: `/financial/vendors`
   - Subcontractors: `/subcontractors`
3. Keep compatibility routes:
   - `/vendors` -> `/financial/vendors`
   - `/labor/subcontractors` -> `/subcontractors`
   - `/labor/subcontractors/[id]` -> `/subcontractors/[id]`
   - `/labor/workers/[id]` -> `/workers/[id]`
4. Do not delete `/labor/payroll`, `/labor/payments`, `/labor/advances`, `/labor/reimbursements`, `/labor/worker-balances`, `/labor/worker-invoices`, or `/labor/receipts`.
5. Do not move worker-money routes physically. Keep them visually under Financial/AP and cross-link from Workers.
6. Do not move subcontract project routes. Keep `/projects/[id]/subcontracts*` as project workspace drill-downs.
7. If future aliases are added, prefer redirects first:
   - `/people` -> future People OS hub
   - `/people/customers` -> `/customers`
   - `/people/workers` -> `/workers`
   - `/people/vendors` -> `/financial/vendors`
   - `/people/subcontractors` -> `/subcontractors`
   - `/people/contacts` -> future read-only All Contacts
8. Update sidebar, command palette, breadcrumbs, and mobile nav through the central IA registry where practical.
9. Active state should recognize canonical routes and legacy aliases.
10. No route deletion until usage is audited and redirects have been deployed for a stable period.

## Safe Migration Phases

### Phase 4.1: Navigation And Read-Model Shell

Scope:

- Group People as Customers, Workers, Vendors, Subcontractors, and future All Contacts.
- Add or plan a People hub that links to existing routes.
- Keep worker money grouped in Financial/AP but visible from worker profiles.
- Add read-only cards/counts from existing APIs/helpers only if implementation is needed.
- No schema changes, formula changes, API contract changes, or route deletion.

### Phase 4.2: Contact Candidate Index

Scope:

- Build a read-only candidate index from `customers`, `workers`, `vendors`, and `subcontractors`.
- Show duplicates and missing contact data as data-quality flags.
- Use source table/source ID links rather than new contact IDs.
- Add tests that verify source routes still load.

### Phase 4.3: Role-Aware Detail Panels

Scope:

- Add role-specific detail panels on a future contact detail shell.
- Customer panel deep-links to AR/project history.
- Worker panel deep-links to labor/payroll/balance history.
- Vendor panel deep-links to AP/expenses.
- Subcontractor panel deep-links to contracts/AP/insurance/W-9.
- No writes from the unified panel yet.

### Phase 4.4: Verified Contacts Schema Proposal

Scope:

- Separately design `contacts` and `contact_roles`.
- Verify every source table column with information schema before any query or migration change.
- Include RLS, backfill, duplicate handling, rollback, and reconciliation plan.
- Keep legacy source tables as sources of truth during backfill.

### Phase 4.5: Dual-Read, Then Dual-Write

Scope:

- Compare unified contact reads against legacy source reads.
- Add mismatch reports before writes.
- Only then introduce controlled dual-write for safe fields.
- Keep legacy routes and APIs operational.

### Phase 4.6: Controlled Cutover

Scope:

- Promote contacts only after reconciliation stays clean.
- Keep aliases/redirects.
- Freeze route deletion until usage data says old routes are unused.
- Keep financial/payroll ledgers tied to original source IDs or verified contact-role links.

## Risk Checklist

- [ ] Contact dedupe by name/email merges unrelated customers, workers, vendors, or subcontractors.
- [ ] A worker who is also a vendor gets one contact row but loses payroll-safe worker ID linkage.
- [ ] Worker balances change because payments are subtracted twice or advances/reimbursements are reclassified.
- [ ] Worker rate history changes while editing a contact profile.
- [ ] `workers` and `labor_workers` drift is ignored and labor entries lose names or FK compatibility.
- [ ] Vendor and subcontractor AP is combined and double counts subcontract bills/AP bills.
- [ ] Historical expense vendor names are overwritten without reconciliation.
- [ ] Customer contact normalization breaks project, estimate, invoice, payment, or deposit matching.
- [ ] Customer deletion or merge bypasses linked project/invoice safeguards.
- [ ] RLS is loosened to make unified contacts easier.
- [ ] New People queries assume columns without schema verification.
- [ ] Mobile navigation becomes overcrowded with financial worker routes.
- [ ] Legacy redirects or active sidebar state break existing bookmarks.
- [ ] Project Workspace People relies on display names as if they were verified contact IDs.
- [ ] Future All Contacts writes before read-model reconciliation is complete.

## Recommended First PR

Recommended first PR: People OS navigation/read-model shell only.

Scope:

- Keep the current six-part HH Project OS top-level navigation.
- Make the People grouping read clearly as:
  - Customers -> `/customers`
  - Workers -> `/workers`
  - Vendors -> `/financial/vendors`
  - Subcontractors -> `/subcontractors`
  - Future All Contacts -> documented or disabled/read-only placeholder only if the UI pattern supports it cleanly.
- Preserve worker-money routes under Financial/AP and add cross-links from worker/profile surfaces only if needed.
- Preserve `/vendors`, `/labor/subcontractors*`, and `/labor/workers/[id]` redirects.
- Keep Project Workspace People tab as a read-only relationship panel that deep-links to current modules.
- Add focused navigation smoke for `/customers`, `/workers`, `/workers/summary`, `/financial/vendors`, `/vendors`, `/subcontractors`, `/labor/subcontractors`, `/labor/payroll`, `/labor/payments`, `/labor/advances`, and `/labor/reimbursements` when implementing.

Explicit non-goals:

- No schema changes.
- No migrations.
- No payroll formula changes.
- No financial formula changes.
- No API contract changes.
- No Supabase policy changes.
- No route deletion.
- No automatic contact merges.
- No writeable All Contacts module.

Acceptance checks for the first PR:

- Existing routes load and keep active navigation state.
- Mobile navigation remains usable.
- Command palette finds Customers, Workers, Vendors, and Subcontractors.
- Worker payroll, worker balance, reimbursement, advance, payment, customer AR, vendor AP, and subcontract AP numbers are visually unchanged.
- `git diff --check`, lint, typecheck, and focused navigation smoke pass.
