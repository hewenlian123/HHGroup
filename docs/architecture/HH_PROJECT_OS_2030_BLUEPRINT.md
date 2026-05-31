# HH Project OS 2030 Architecture Blueprint

Audit mode: plan only. This report does not change code, schema, migrations, API contracts, routes, financial formulas, or deployment settings.

## Executive Summary

HH Project already contains most of the building blocks of a construction ERP: projects, estimates, change orders, customers, invoices, payments, deposits, bills, expenses, bank transactions, workers, payroll, vendors, subcontractors, tasks, schedule, site photos, inspections, materials, documents, system health, metrics, logs, and backups.

The main architecture issue is not missing capability. It is information architecture drift: the app currently exposes module-heavy navigation with overlapping route families (`/finance` and `/financial`, `/bills` and `/financial/bills`, `/workers` and `/labor/workers`, `/subcontractors` and `/labor/subcontractors`, plus standalone Operations and System sections).

The recommended five-year direction is to keep existing routes working while reorganizing the product around six stable operating systems:

- Dashboard: executive command center, owner/ops summary, cashflow, exceptions.
- Projects: project delivery workspace, estimates, change orders, customers, and future permit/RFI/submittal/warranty workflows.
- Financial: overview, AR, AP, cash, reports.
- People: customers, workers, vendors, subcontractors, then unified contacts with roles.
- Documents: documents, plans, permits, contracts, photos, inspections, closeout files.
- Settings: company, users, roles, preferences, admin center.

The safest path is compatibility-first: add aliases, redirects, route registry, and navigation regrouping before moving physical route files. The first implementation PR should be a navigation/route compatibility PR only. It should not touch financial formulas, database schema, Supabase query shapes, or existing API contracts.

## Current IA Map

### Evidence Reviewed

- Primary sidebar: `src/components/layout/sidebar.tsx`
- Mobile bottom nav: `src/components/layout/bottom-nav.tsx`
- Topbar breadcrumbs: `src/components/layout/topbar.tsx`
- Command palette: `src/components/command/neo-command-palette.tsx`
- Finance hub routes: `src/app/financial/page.tsx`, `src/app/finance/page.tsx`
- Settings subnav: `src/components/settings/settings-sub-nav.tsx`
- Project workspace tabs: `src/app/projects/[id]/project-detail-tabs-client.tsx`
- Existing route inventory: `docs/FEATURE_MODULES_AND_PAGES.md`
- Data flow map: `docs/DATA_AND_INTEGRATION.md`
- Current table families from migrations: `projects`, `customers`, `workers`, `labor_workers`, `vendors`, `subcontractors`, `documents`, `project_tasks`, `invoices`, `payments_received`, `deposits`, `ap_bills`, `expenses`, `expense_lines`, `bank_transactions`, `subcontracts`, `subcontract_bills`, `project_change_orders`, `project_change_order_items`.

### Current Sidebar

| Current sidebar section | Current items                                                                                                                      | Future top-level home                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Projects                | Projects, Estimates, Change Orders, Customers                                                                                      | Projects                                                                           |
| Operations              | Tasks, Punch List, Schedule, Site Photos, Inspection Log, Material Catalog, Inbox draft                                            | Mostly Projects and Documents; Inbox draft moves to Financial AP                   |
| Finance                 | Owner dashboard, Invoices, Payments Received, Commission Payments, Deposits, Bills, Expenses, Accounts                             | Financial                                                                          |
| Labor                   | Time Entries, Reimbursements, Worker Balances, Worker Payments, Worker Advances, Receipt Uploads, Worker Invoices, Payroll Summary | People for workers/time; Financial AP for payroll/payables; Documents for receipts |
| People                  | Worker Profile, Worker Summary, Vendors, Subcontractors                                                                            | People                                                                             |
| System                  | System Health, System Metrics, System Logs, Backups                                                                                | Settings -> Admin Center                                                           |
| Standalone              | Documents, Settings                                                                                                                | Documents, Settings                                                                |

Current mobile bottom nav is Dashboard, Projects, Time Entries, Expenses, More. It should eventually become Dashboard, Projects, Financial, People, Documents or Dashboard, Projects, Financial, Documents, Settings depending on mobile usage data.

### Current Route Families Mapped To Future IA

| Current route family                                                                                                                            | Current role                                                                                                          | Future IA home                                                          | Compatibility note                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/`, `/dashboard`, `/dashboard/cashflow`                                                                                                        | Home, executive dashboard, cashflow                                                                                   | Dashboard                                                               | Keep `/` redirecting to `/dashboard`.                                                       |
| `/owner`, `/financial/owner`, `/financial/dashboard`                                                                                            | Owner/financial executive views                                                                                       | Dashboard and Financial -> Reports                                      | Keep current routes; surface from Dashboard and Financial Reports.                          |
| `/offline`                                                                                                                                      | Offline fallback                                                                                                      | Dashboard shell                                                         | Keep hidden route.                                                                          |
| `/design-system`                                                                                                                                | Internal UI showcase                                                                                                  | Settings -> Admin Center                                                | Keep internal/admin only.                                                                   |
| `/projects`, `/projects/new`, `/projects/[id]`                                                                                                  | Core project list and detail                                                                                          | Projects -> Projects                                                    | Keep canonical.                                                                             |
| `/projects/[id]/labor`, `/projects/[id]/profit`                                                                                                 | Project labor/profit views                                                                                            | Project Workspace V3 -> Financial and People                            | Preserve as deep links or redirect after V3 tabs exist.                                     |
| `/projects/[id]/subcontracts*`                                                                                                                  | Project subcontract management and subcontract bills                                                                  | Project Workspace V3 -> People and Financial AP                         | Preserve project-scoped routes.                                                             |
| `/projects/[id]/change-orders*`, `/change-orders`                                                                                               | Change order hub and project-scoped change orders                                                                     | Projects -> Change Orders                                               | Keep both hub and project-scoped routes.                                                    |
| `/projects/daily-logs`, `/projects/schedule`, `/schedule`                                                                                       | Daily logs and schedule                                                                                               | Project Workspace V3 -> Schedule                                        | Keep route family; later add project filters and aliases.                                   |
| `/projects/documents`, `/documents`                                                                                                             | Project docs and document center                                                                                      | Documents                                                               | Keep `/documents` as canonical document center.                                             |
| `/estimates*`, `/financial/estimates`                                                                                                           | Estimate authoring, preview, print, snapshot                                                                          | Projects -> Estimates and Financial -> AR Estimates                     | Keep `/estimates` canonical; `/financial/estimates` can remain alias.                       |
| `/customers*`                                                                                                                                   | Customer list and detail                                                                                              | Projects -> Customers and People -> Customers                           | Keep route; future contacts model owns data.                                                |
| `/tasks`, `/tasks/new`                                                                                                                          | Operational tasks                                                                                                     | Project Workspace V3 -> Tasks                                           | Keep `/tasks`; `/tasks/new` already redirects to `/tasks`.                                  |
| `/punch-list`, `/punch-list/new`                                                                                                                | Punch list                                                                                                            | Project Workspace V3 -> Tasks or Closeout                               | Keep `/punch-list`; `/punch-list/new` already redirects.                                    |
| `/site-photos`, `/site-photos/upload`                                                                                                           | Jobsite photos                                                                                                        | Documents -> Site Photos and Project Workspace V3 -> Photos             | Keep current routes; upload already redirects to list.                                      |
| `/inspection-log`                                                                                                                               | Inspection log                                                                                                        | Documents -> Inspection Log and Project Workspace V3 -> Inspections     | Keep route family.                                                                          |
| `/materials/catalog`                                                                                                                            | Material catalog                                                                                                      | Project Workspace V3 -> Materials and Settings -> Preferences/Libraries | Keep route; later split catalog vs project selections.                                      |
| `/procurement/purchase-orders`                                                                                                                  | Purchase orders                                                                                                       | Projects -> Procurement/Materials and Financial -> AP                   | Keep hidden/secondary until procurement IA matures.                                         |
| `/estimating/cost-codes`                                                                                                                        | Estimate cost code library                                                                                            | Projects -> Estimates and Settings -> Preferences/Libraries             | Keep current route.                                                                         |
| `/financial`, `/finance`                                                                                                                        | Finance hubs                                                                                                          | Financial -> Overview                                                   | Converge on `/financial`; keep `/finance` as legacy overview alias.                         |
| `/financial/ar`                                                                                                                                 | AR summary                                                                                                            | Financial -> AR                                                         | Keep as AR landing page.                                                                    |
| `/financial/invoices*`, `/finance/invoices`                                                                                                     | Customer invoices                                                                                                     | Financial -> AR -> Invoices                                             | Keep `/financial/invoices`; `/finance/invoices` already redirects.                          |
| `/financial/payments`, `/financial/payments-received`                                                                                           | Payments received                                                                                                     | Financial -> AR -> Payments Received                                    | Keep `/financial/payments`; legacy payments-received redirects.                             |
| `/financial/deposits`                                                                                                                           | Deposits created from payments                                                                                        | Financial -> AR -> Deposits and Cash                                    | Keep route.                                                                                 |
| `/bills*`, `/financial/bills*`, `/finance/bills`                                                                                                | AP bills                                                                                                              | Financial -> AP -> Bills                                                | Current canonical is `/bills`; preserve redirects before considering a future flip.         |
| `/financial/expenses*`, `/finance/expenses`                                                                                                     | Expenses and receipt-backed costs                                                                                     | Financial -> AP -> Expenses                                             | Keep `/financial/expenses`; `/finance/expenses` redirects.                                  |
| `/financial/inbox`, `/financial/receipt-queue`, `/(dashboard)/receipt-queue`                                                                    | Expense receipt inbox and queue                                                                                       | Financial -> AP -> Inbox, Documents -> Receipts                         | Keep routes; later consolidate labels.                                                      |
| `/financial/accounts`, `/financial/bank`                                                                                                        | Accounts, bank transactions, reconciliation                                                                           | Financial -> Cash                                                       | Keep routes.                                                                                |
| `/financial/commissions`                                                                                                                        | Commission payments                                                                                                   | Financial -> AP or Reports                                              | Keep route; report as selling cost/payable.                                                 |
| `/financial/reimbursements`, `/labor/reimbursements`                                                                                            | Worker reimbursements                                                                                                 | Financial -> AP -> Payroll/Reimbursements and People -> Worker detail   | Keep both entry points until People OS is ready.                                            |
| `/financial/workers`, `/workers`, `/workers/summary`, `/workers/[id]*`                                                                          | Worker financial and people views                                                                                     | People -> Workers, Financial -> AP Payroll for balances                 | Keep `/workers` as People-facing canonical; labor worker detail redirects already exist.    |
| `/labor`, `/labor/daily`, `/labor/review`, `/labor/timesheets`, `/labor/entries`, `/labor/monthly`, `/labor/payroll*`, `/labor/cost-allocation` | Time entries, review, payroll, labor cost                                                                             | People -> Workers/Time and Financial -> AP Payroll                      | Keep all routes; regroup navigation before moving paths.                                    |
| `/labor/payments`, `/labor/advances`, `/labor/worker-balances`, `/labor/receipts`, `/labor/worker-invoices`, `/labor/invoices*`                 | Worker payables, receipts, invoices                                                                                   | Financial -> AP Payroll and People -> Worker detail                     | Keep routes; do not change balance formulas.                                                |
| `/vendors`, `/people/vendors`, `/financial/vendors`                                                                                             | Vendor list                                                                                                           | People -> Vendors                                                       | Current aliases redirect to `/financial/vendors`; future alias should be `/people/vendors`. |
| `/subcontractors*`, `/labor/subcontractors*`, `/settings/subcontractors`                                                                        | Subcontractor directory and settings management                                                                       | People -> Subcontractors and Settings -> Preferences                    | Current labor aliases redirect to `/subcontractors`; keep.                                  |
| `/documents`, `/projects/documents`, `/upload-receipt`, `/receipt`, `/receipt/print/[id]`                                                       | Document center, project docs, receipt upload/print                                                                   | Documents                                                               | Keep public receipt routes stable.                                                          |
| `/settings*`                                                                                                                                    | Company, account, expenses, security, users, permissions, categories, lists, subcontractors, project financial review | Settings                                                                | Rename Security/Permissions to Roles only after auth semantics are clear.                   |
| `/system-health`, `/system-metrics`, `/system-logs`, `/system/backups`, `/backups`, `/settings/system-health`                                   | Admin health, metrics, logs, backups                                                                                  | Settings -> Admin Center                                                | Existing aliases should remain.                                                             |
| `/system-tests`, `/system-tests/ui`, `/api/test/*`                                                                                              | Internal QA/test surfaces                                                                                             | Settings -> Admin Center, hidden                                        | Keep out of primary nav.                                                                    |
| `/login`, `/logout`, `/auth/callback`                                                                                                           | Auth routes                                                                                                           | Settings/Auth infrastructure, hidden                                    | Keep route contracts stable.                                                                |

## Future IA Map

### Dashboard

- Executive overview: portfolio health, active projects, AR/AP attention, cashflow, recent activity.
- Exception feed: overdue invoices, unpaid bills, missing receipts, high-cost projects, health warnings.
- Quick actions: create invoice, review receipts, open projects, add labor, upload document.

### Projects

- Projects
- Estimates
- Change Orders
- Customers
- Future: Permits, RFI, Submittals, Warranty

Projects is the delivery OS. It should own project context and expose links into Financial, People, and Documents rather than duplicating their business logic.

### Financial

- Overview
- AR: Estimates, Invoices, Payments Received, Deposits
- AP: Bills, Expenses, Subcontract Bills, Payroll
- Cash: Accounts, Bank Transactions, Reconciliation
- Reports

Financial is the money OS. It must preserve existing source-of-truth helpers and formulas. Navigation can change before math changes; math should only change behind dedicated financial integrity tests.

### People

- Customers
- Workers
- Vendors
- Subcontractors
- Future: unified Contacts + Roles

People is the party OS. Customers may still appear under Projects because project intake starts with customers, but the long-term data owner should be Contacts with role assignments.

### Documents

- Documents
- Plans
- Permits
- Contracts
- Site Photos
- Inspection Log
- Closeout Docs

Documents is the evidence OS. It should hold files, metadata, project links, contact links, financial document links, work item links, tags, and retention status.

### Settings

- Company
- Users
- Roles
- Preferences
- Admin Center: System Health, Metrics, Logs, Backups

Settings should absorb System as Admin Center and reduce module-specific setup sprawl over time.

## Route Compatibility Plan

1. Keep every existing route working.
2. Prefer aliases and redirects before deleting, renaming, or physically moving route files.
3. Introduce a central route/IA registry before changing the sidebar, bottom nav, topbar breadcrumbs, command palette, and quick actions.
4. Regroup navigation labels first; defer filesystem route moves until usage is stable.
5. Do not change database schema, Supabase query contracts, API response shapes, or financial formulas in navigation PRs.
6. Add route smoke coverage for old and new aliases before any visible IA change.
7. Preserve external/public routes such as `/receipt`, `/upload-receipt`, print routes, PDF routes, auth callback routes, and existing invoice/estimate URLs.

Recommended canonical direction:

| Area      | Future canonical path              | Existing paths to preserve                                                                                                                      |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | `/dashboard`                       | `/`, `/owner`, `/financial/owner`, `/dashboard/cashflow`                                                                                        |
| Projects  | `/projects`                        | `/estimates`, `/change-orders`, `/tasks`, `/schedule`, `/punch-list`, `/materials/catalog`                                                      |
| Financial | `/financial`                       | `/finance`, `/bills`, `/financial/bills`, `/financial/payments-received`, `/financial/owner`                                                    |
| People    | `/people` or direct existing roots | `/customers`, `/workers`, `/financial/vendors`, `/vendors`, `/people/vendors`, `/subcontractors`, `/labor/workers/*`, `/labor/subcontractors/*` |
| Documents | `/documents`                       | `/projects/documents`, `/site-photos`, `/inspection-log`, `/upload-receipt`, `/receipt`                                                         |
| Settings  | `/settings`                        | `/system-health`, `/system-metrics`, `/system-logs`, `/system/backups`, `/backups`, `/settings/system-health`                                   |

Compatibility rule: a route can be visually moved in navigation only after existing deep links, tests, print links, PDF links, and public entry points continue to work.

## Project Workspace V3 Plan

Current project detail uses four visible tabs: Overview, Financial, Work, Documents. The code already imports or references project documents, tasks, closeout, materials, commission, punch list, cost lines, financial snapshot, recent expenses, subcontracts, and change orders. V3 should expose those capabilities as first-class tabs:

| V3 tab      | Current sources to compose                                                                                                | Purpose                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Overview    | Project header, status, budget/contract, summary KPIs, recent activity                                                    | One-page project health snapshot.                                  |
| Financial   | Project financial snapshot, invoices, estimates, bills/subcontracts, expenses, labor, reimbursements, commissions, profit | Project-level money center without changing formulas.              |
| Schedule    | `/schedule`, `/projects/schedule`, daily logs                                                                             | Date-based plan, milestones, field schedule.                       |
| Tasks       | `/tasks`, project tasks, punch list                                                                                       | Work assignments, open issues, punch items.                        |
| People      | Customer, workers, vendors, subcontractors, commissions, project roles                                                    | Project party list and responsibilities.                           |
| Documents   | Project documents and document center filters                                                                             | Contracts, invoices, estimates, receipts, files linked to project. |
| Photos      | `/site-photos` with project filters                                                                                       | Field photo timeline.                                              |
| Materials   | Material catalog, project material selections                                                                             | Material decisions, selections, procurement references.            |
| Inspections | `/inspection-log` with project filters                                                                                    | Inspection events, pass/fail status, notes.                        |
| Closeout    | Existing closeout punch, completion, warranty, final invoice PDF flows                                                    | Completion package and handoff evidence.                           |

Implementation posture:

- Keep `/projects/[id]` as the workspace shell.
- Keep existing subroutes working as deep links or redirects to selected tabs only after tab routing is implemented.
- Use query or hash tab state before adding new nested route segments.
- Preserve current project financial snapshot, profit readiness warnings, and cost component logic.
- Add V3 progressively by lifting existing components, not by rewriting financial or document logic.

## Financial OS Plan

Financial should become a predictable OS with five sections.

| Section  | Includes                                                                                                 | Current routes                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview | Financial landing, owner dashboard, company dashboard, cashflow highlights                               | `/financial`, `/finance`, `/financial/owner`, `/financial/dashboard`, `/dashboard/cashflow`                                                                                                  |
| AR       | Estimates, invoices, payments received, deposits, aging, customer balances                               | `/estimates`, `/financial/estimates`, `/financial/ar`, `/financial/invoices*`, `/financial/payments`, `/financial/deposits`                                                                  |
| AP       | Bills, expenses, receipt inbox, subcontract bills, reimbursements, payroll, worker payables, commissions | `/bills*`, `/financial/expenses*`, `/financial/inbox`, `/financial/receipt-queue`, `/labor/reimbursements`, `/labor/payments`, `/labor/advances`, `/labor/payroll`, `/financial/commissions` |
| Cash     | Accounts, bank transactions, reconciliation, cash movement                                               | `/financial/accounts`, `/financial/bank`, deposits where cash-facing                                                                                                                         |
| Reports  | Owner dashboard, project financial review, labor cost, profit, data quality                              | `/financial/owner`, `/settings/project-financial-review`, `/finance/labor-cost`, `/projects/[id]/profit`, `/system-health` summaries                                                         |

Guardrails:

- No financial formula changes in IA work.
- Keep current helper modules as source of truth until a dedicated finance refactor is planned.
- Treat estimate, invoice, payment, deposit, bill, expense, reimbursement, payroll, commission, and project snapshot calculations as financial integrity surfaces.
- Any future ledger or transaction layer should start as read-only reporting over existing tables before becoming a write path.

## People OS Plan

Current people data is split across customers, workers, labor workers, vendors, subcontractors, and settings-managed subcontractors. The safe path is a role-based people model introduced gradually.

### Safe Migration Direction

1. Stabilize navigation:
   - People -> Customers links to `/customers`.
   - People -> Workers links to `/workers`.
   - People -> Vendors links to `/financial/vendors` or future `/people/vendors` alias.
   - People -> Subcontractors links to `/subcontractors`.
2. Add read-only people search across existing tables without changing writes.
3. Add a contact identity abstraction in application code, not schema, to normalize labels, phone/email/address, insurance/W9, and role badges.
4. Plan future schema only after verified column inventory and duplicate detection:
   - `contacts`: person/company identity.
   - `contact_roles`: customer, worker, vendor, subcontractor, owner, estimator, PM, site lead, project-specific role.
5. Backfill contacts from existing tables with a reversible mapping table or source references.
6. Move writes one role at a time only after tests prove no duplicate creation, lost W9/insurance fields, payroll breakage, or customer/project link breakage.

Rules:

- Do not merge People data by name alone.
- Do not collapse workers and labor workers until worker balance/payroll source-of-truth rules are explicitly mapped.
- Keep customer, vendor, worker, and subcontractor routes stable through the transition.

## Documents OS Plan

Current document center already has a useful base: document metadata includes file name/path/type, project link, related module, related id, uploader, upload date, and notes. The future Documents OS should generalize that pattern.

### Future Document Types

- Documents
- Plans
- Permits
- Contracts
- Site Photos
- Inspection Log attachments
- Closeout Docs
- Receipts
- Estimates, invoices, bills, payments, deposits, worker payment receipts

### Linking Model

Documents should be attachable to:

- Project
- Contact
- Financial document
- Financial transaction
- Work item
- Inspection
- Material selection
- Closeout package

Implementation path:

1. Keep `/documents` as canonical center.
2. Add filter presets before adding new routes: plans, permits, contracts, receipts, photos, inspections, closeout.
3. Keep existing site photo and receipt routes working.
4. Treat `related_module` and `related_id` as the current compatibility layer.
5. Future `document_links` should be additive and backfilled from `project_id`, `related_module`, and `related_id`.

## Future Data Model Plan

This is direction only. It is not a migration plan and does not assert current columns beyond the audited table families. Before any future query or migration work, verify target columns through `information_schema.columns` as required by project rules.

| Future model             | Purpose                                                                                                     | Current sources to bridge                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts`               | Unified person/company identity                                                                             | `customers`, `workers`, `labor_workers`, `vendors`, `subcontractors`                                                                                        |
| `contact_roles`          | Role assignments across company and projects                                                                | Customer, worker, vendor, subcontractor records; future project roles                                                                                       |
| `projects`               | Central job record                                                                                          | Existing `projects` remains central                                                                                                                         |
| `financial_documents`    | Typed financial headers: estimate, invoice, bill, subcontract bill, worker invoice, payment request         | `estimates`, `invoices`, `ap_bills`, legacy `bills`, `subcontract_bills`, `worker_invoices`                                                                 |
| `financial_transactions` | Money events and ledger-like reporting rows                                                                 | `payments_received`, `deposits`, `expense_lines`, `bank_transactions`, worker payments, advances, reimbursements, subcontract payments, commission payments |
| `work_items`             | Unified operational work: task, punch, schedule item, daily log, inspection, material action, closeout item | `project_tasks`, tasks, punch list, schedule, daily logs, inspection log, material selections, closeout tables                                              |
| `documents`              | File metadata and document properties                                                                       | Existing `documents` table and storage files                                                                                                                |
| `document_links`         | Many-to-many links from documents to projects, contacts, financial docs, transactions, work items           | Existing `documents.project_id`, `related_module`, `related_id`, receipt/photo links                                                                        |

Data model sequencing:

- Phase A: read-only facades and reporting views in application code.
- Phase B: verified schema proposal with column inventory and RLS plan.
- Phase C: additive tables only, no destructive migrations.
- Phase D: reversible backfill with source IDs.
- Phase E: one write path at a time, behind tests and audit logs.

## AI-Ready Reporting Plan

The AI-ready layer should answer business questions from stable IDs, source references, statuses, dates, amounts, and project/contact links. It should not invent formulas; it should call the same source-of-truth helpers used by the UI.

| Future question                 | Required data                                                                                  | Current/future source direction                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Which projects are profitable?  | Contract value, billed, collected, actual cost, pending costs, snapshot warnings, margin       | Project financial snapshot, invoices, payments, expenses, labor, AP bills, subcontract bills, commissions |
| What is outstanding AR?         | Invoice status, total, paid total, balance due, due date, customer, project, payment links     | Invoices, payments received, deposits, customers, projects                                                |
| What is unpaid AP?              | Bill/expense/subcontract bill status, amount, balance, due date, vendor/subcontractor, project | AP bills, bills, expenses, subcontract bills, worker payables                                             |
| Who do we owe?                  | Payee contact, role, open balances, approved/unapproved status, last payment                   | Vendors, subcontractors, workers, bills, reimbursements, worker balances, subcontract payments            |
| Which receipts are missing?     | Expense records, receipt attachments, worker receipts, upload queue, document links, status    | Expenses, expense attachments, receipt queue, worker receipts, documents                                  |
| Where is labor cost high?       | Labor entries, worker role/rate, hours, project, cost code, schedule phase, budget comparison  | Labor entries, workers/labor workers, project financial snapshot, project budget/cost code data           |
| What cash needs reconciliation? | Bank transaction amount/date/description, linked expense/payment/deposit/account, match status | Bank transactions, accounts, expenses, payments, deposits                                                 |

Minimum AI layer requirements:

- Stable source ID for every answer: `source_type`, `source_id`, route href.
- Project and contact linkage wherever possible.
- Normalized money fields with currency and sign.
- Status vocabulary with canonical groups: draft, open, approved, paid, void, pending review.
- Due dates, transaction dates, upload dates, and created/updated timestamps.
- Provenance: whether a value is stored, derived, imported, OCR-suggested, manually entered, or backfilled.
- Warning flags from financial snapshot and data-quality checks.
- Permissions/RLS posture before exposing answers through AI tools.

## Implementation Phases

### Phase 0: Blueprint And Guardrails

- Keep this report as the IA north star.
- Freeze constraints for first PR: no schema, no migrations, no API contracts, no financial formulas.
- Define route compatibility checklist.

### Phase 1: Navigation Compatibility PR

- Create a single IA route registry for sidebar, bottom nav, topbar labels, command palette, and quick actions.
- Regroup visible navigation to Dashboard, Projects, Financial, People, Documents, Settings.
- Keep existing hrefs where they are already canonical.
- Add aliases only where low risk, especially People aliases.
- Add route smoke tests for old route families and redirects.

### Phase 2: Project Workspace V3 Shell

- Expand `/projects/[id]` from four tabs to V3 tabs.
- Compose existing components first.
- Keep legacy subroutes working.
- Add project filters to Tasks, Schedule, Photos, Documents, Materials, and Inspections before changing physical route locations.

### Phase 3: Financial OS Consolidation

- Create Financial sections: Overview, AR, AP, Cash, Reports.
- Preserve all source-of-truth helpers and tests.
- Make `/financial` the product-level home while `/finance` remains legacy.
- Keep `/bills` canonical until a dedicated bill-route migration is proven safe.

### Phase 4: People OS Read Model

- Add read-only contact search/facade over customers, workers, vendors, subcontractors.
- Add duplicate detection report.
- Add role badges and project role display.
- Do not merge write paths yet.

### Phase 5: Documents OS Link Layer

- Add document filter presets and project/contact/financial/work item link UI.
- Backfill link metadata only after schema plan is approved.
- Keep storage paths and public receipt routes stable.

### Phase 6: Data Model Evolution

- Design additive `contacts`, `contact_roles`, `financial_documents`, `financial_transactions`, `work_items`, and `document_links`.
- Verify actual columns before every query or migration.
- Add RLS and index plan before migrations.
- Backfill with reversible source references.
- Move writes one module at a time.

## Risk Checklist

- Route breakage: old bookmarks, PDF/print routes, public receipt routes, and deep links must keep working.
- Financial drift: no formula, status, balance, rounding, or duplicate-counting change in IA PRs.
- Schema drift: no Supabase query or migration changes without column verification.
- RLS exposure: future Contacts/Documents/AI layers must not broaden access accidentally.
- Data duplication: Customers, workers, vendors, and subcontractors must not be merged by name alone.
- Payroll risk: worker balances, advances, payments, reimbursements, and worker invoices need dedicated tests before any path or model change.
- AP/AR ambiguity: payments received, deposits, bills, expenses, and bank transactions should keep clear source ownership.
- UI sprawl: do not create new visual languages for Projects, Financial, People, and Documents.
- Mobile nav risk: the current bottom nav is optimized around Time Entries and Expenses; regroup carefully with usage testing.
- Admin risk: System Health, Metrics, Logs, Backups, test routes, and dangerous maintenance APIs should move visually under Settings without weakening auth or production safety.
- AI answer risk: AI-ready reports must cite source IDs and avoid inferred numbers unless the source helper explicitly calculates them.

## Recommended First PR

Recommended first PR: "HH Project OS IA compatibility shell".

Scope:

- Add a central IA/route registry for the six top-level groups.
- Update sidebar grouping to Dashboard, Projects, Financial, People, Documents, Settings while keeping existing route hrefs.
- Move System items under Settings -> Admin Center in navigation only.
- Move Labor payroll/payables entries visually under Financial AP and worker/profile entries under People.
- Move Operations entries visually under Projects or Documents.
- Preserve all old routes and current redirects.
- Update command palette and mobile bottom nav labels only after the sidebar route registry is stable.
- Add route smoke coverage for current aliases and redirected routes.

Explicit non-goals for the first PR:

- No financial formula changes.
- No database changes.
- No Supabase query changes.
- No API contract changes.
- No route deletion.
- No migrations.
- No deployment.
