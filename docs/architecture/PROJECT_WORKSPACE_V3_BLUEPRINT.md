# HH Project OS Phase 2: Project Workspace V3 Blueprint

Audit mode: plan only. This report does not change code, schema, migrations, API contracts, routes, financial formulas, deployment settings, or Supabase data.

## Executive Summary

Project detail is already more than a basic tab page internally. `/projects/[id]` loads project financials, invoices, estimates, AP bills, expenses, labor, tasks, schedule, documents, materials, punch list, closeout, commissions, subcontracts, change orders, and activity in one server-rendered workspace (`src/app/projects/[id]/page.tsx`). The visible UI currently compresses those capabilities into four primary tabs: Overview, Financial, Work, and Documents (`src/app/projects/[id]/project-detail-tabs-client.tsx`).

Project Workspace V3 should make the underlying structure explicit with ten top-level project tabs:

- Overview
- Financial
- Schedule
- Tasks
- People
- Documents
- Photos
- Materials
- Inspections
- Closeout

The safest Phase 2 implementation is a shell-only PR: add the V3 tab structure, reuse the existing data and components, preserve every current route and query-param deep link, and avoid any financial formula or schema change. The first PR should be mostly IA/UI composition inside `/projects/[id]`, with compatibility aliases from current tab keys into the new tabs.

## Current Project Detail Map

### Primary Route

| Surface            | Current behavior                                                                                                                                                                                                                                                      | Evidence                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/projects/[id]`   | Server page resolves project, validates tab query, fetches all major project-related datasets, and renders `ProjectDetailTabsClient`.                                                                                                                                 | `src/app/projects/[id]/page.tsx:71`, `src/app/projects/[id]/page.tsx:132`, `src/app/projects/[id]/page.tsx:263` |
| Dynamic rendering  | Project detail is forced dynamic.                                                                                                                                                                                                                                     | `src/app/projects/[id]/page.tsx:34`                                                                             |
| Legacy tab aliases | `?tab=financial` maps to `cost`; `?tab=documents` maps to `docs`.                                                                                                                                                                                                     | `src/app/projects/[id]/page.tsx:36`                                                                             |
| Accepted tab keys  | Includes visible and legacy/detail keys: `overview`, `financial`, `work`, `documents`, `cost`, `tasks`, `schedule`, `docs`, `budget`, `expenses`, `labor`, `subcontracts`, `bills`, `activity`, `change-orders`, `materials`, `closeout`, `commission`, `punch-list`. | `src/app/projects/[id]/page.tsx:41`, `src/app/projects/[id]/page.tsx:83`                                        |

### Data Loaded Today

| Current data                                                                    | Purpose                                                            | Evidence                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project, canonical profit, project cost dashboard                               | Header KPIs, cost, profit, margin, financial warnings.             | `src/app/projects/[id]/page.tsx:133`, `src/app/projects/[id]/page.tsx:154`                                                                                                                                                         |
| Billing summary, invoices, estimates                                            | AR, collected, open AR, related estimates.                         | `src/app/projects/[id]/page.tsx:134`, `src/app/projects/[id]/page.tsx:152`, `src/app/projects/[id]/page.tsx:243`                                                                                                                   |
| Tasks, workers, schedule, activity logs, punch list                             | Work management and project health.                                | `src/app/projects/[id]/page.tsx:135`, `src/app/projects/[id]/page.tsx:136`, `src/app/projects/[id]/page.tsx:142`, `src/app/projects/[id]/page.tsx:151`                                                                             |
| Documents, materials, closeout                                                  | Project files, selections, generated closeout documents.           | `src/app/projects/[id]/page.tsx:138`, `src/app/projects/[id]/page.tsx:140`, `src/app/projects/[id]/page.tsx:148`                                                                                                                   |
| Labor entries, subcontracts, AP bills, commissions, change orders, budget items | Project cost sources, commitments, AP references, revenue changes. | `src/app/projects/[id]/page.tsx:137`, `src/app/projects/[id]/page.tsx:139`, `src/app/projects/[id]/page.tsx:143`, `src/app/projects/[id]/page.tsx:144`, `src/app/projects/[id]/page.tsx:146`, `src/app/projects/[id]/page.tsx:147` |

### Visible Tabs Today

| Current visible tab | Contents today                                                                   | V3 implication                                                                                               |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Overview            | Financial summary, cost breakdown, project health, client link, recent activity. | Keep as project command center.                                                                              |
| Financial           | Revenue, cost, profit, commissions, cost detail, invoices, AP bills.             | Keep as financial center; do not alter formulas.                                                             |
| Work                | Tasks, schedule summary, activity, punch list.                                   | Split into Schedule and Tasks.                                                                               |
| Documents           | Documents, material selections, closeout.                                        | Split into Documents, Materials, Closeout; add Photos and Inspections later from existing operation modules. |

Evidence: visible tab list is defined at `src/app/projects/[id]/project-detail-tabs-client.tsx:966` through `src/app/projects/[id]/project-detail-tabs-client.tsx:991`.

### Hidden Or Compatibility Tab Panels Today

The client still contains panels for more granular keys such as `schedule`, `expenses`, `budget`, `activity`, `change-orders`, `materials`, `closeout`, `commission`, `punch-list`, `subcontracts`, `bills`, and `labor` (`src/app/projects/[id]/project-detail-tabs-client.tsx:1275`, `src/app/projects/[id]/project-detail-tabs-client.tsx:1820`, `src/app/projects/[id]/project-detail-tabs-client.tsx:1903`, `src/app/projects/[id]/project-detail-tabs-client.tsx:1962`, `src/app/projects/[id]/project-detail-tabs-client.tsx:2006`, `src/app/projects/[id]/project-detail-tabs-client.tsx:2094`).

These keys are normalized into the four visible dashboard tabs by `normalizeDashboardTab` (`src/app/projects/[id]/project-detail-tabs-client.tsx:389`). V3 should preserve those old keys as aliases while exposing the new ten-tab structure.

### Existing Project-Scoped Deep Routes

| Route                                       | Current role                                          | V3 home                                  |
| ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `/projects/[id]`                            | Main project workspace.                               | V3 shell.                                |
| `/projects/[id]/labor`                      | Full project labor breakdown by worker and cost code. | Financial plus People.                   |
| `/projects/[id]/profit`                     | Profit and forecast detail.                           | Financial.                               |
| `/projects/[id]/subcontracts`               | Project subcontract list and subcontract financials.  | People plus Financial.                   |
| `/projects/[id]/subcontracts/[subId]`       | Subcontract detail.                                   | People plus Financial AP.                |
| `/projects/[id]/subcontracts/[subId]/bills` | Subcontract AP bill management.                       | Financial AP.                            |
| `/projects/[id]/change-orders/new`          | Project-scoped change order creation.                 | Financial/revenue and Overview activity. |
| `/projects/[id]/change-orders/[coId]`       | Change order detail.                                  | Financial/revenue and Documents.         |
| `/projects/[id]/edit`                       | Redirect/placeholder to detail.                       | Keep route compatibility.                |

## Future V3 Tab Map

| V3 tab      | Job to be done                                               | Initial shell contents                                                                                                    | Later expansion                                                                |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Overview    | See project status, risk, recent movement, and next actions. | Existing header KPIs, financial summary, project health, recent activity, client/address details.                         | AI/project exceptions, pinned notes, next best actions.                        |
| Financial   | Understand project money in one place.                       | Existing revenue, cost, profit, invoices, estimates, AP bills, expenses, labor, subcontracts, commissions, change orders. | Forecasting, retainage, AR/AP aging, cash view.                                |
| Schedule    | Manage milestones and project dates.                         | Existing project schedule table and link to company schedule.                                                             | Calendar/Gantt, dependencies, daily logs.                                      |
| Tasks       | Manage work assignments, punch list, and open issues.        | Existing `ProjectTasksTab` and `ProjectPunchListTab`.                                                                     | Task board, field checklist templates, recurring tasks.                        |
| People      | See all parties tied to the project.                         | Customer, workers from tasks/labor, subcontractors, vendors from expenses/bills, commission people.                       | Unified project roles, contacts, responsibilities.                             |
| Documents   | Find project files and generated documents.                  | Existing `ProjectDocumentsTab` and links to `/documents?project_id=...`.                                                  | Tags, document type lanes, document links to financial/work records.           |
| Photos      | Review field photo timeline.                                 | Link or embedded project-filtered site photos from `/site-photos`.                                                        | Inline upload, photo tags, photo-to-punch flow.                                |
| Materials   | Manage material selections and catalog references.           | Existing `ProjectMaterialsTab`.                                                                                           | Procurement, PO links, supplier status.                                        |
| Inspections | Track inspections and compliance evidence.                   | Project-filtered inspection log from `/inspection-log`.                                                                   | Inspection checklist templates, passed/failed evidence, closeout dependencies. |
| Closeout    | Complete turnover package.                                   | Existing `ProjectCloseoutTab`: punch, warranty, completion, generated PDFs.                                               | Closeout checklist, lien releases, final payment/retainage gate.               |

## Existing Routes And Components Feeding Each Tab

### Overview

| Feed                                                                 | Existing source                                                | Notes                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Project header and status                                            | `ProjectDetailTabsClient` header.                              | Keep as top workspace chrome.                 |
| Contract value, collected, need collect, actual cost, profit, margin | Existing header metrics and financial snapshot fallback logic. | No formula changes.                           |
| Project health counts                                                | Tasks, schedule, punch list, missing receipts, needs review.   | Already computed in client from loaded props. |
| Recent activity                                                      | `activityLogs`, then `recentExpenseLines` fallback.            | Keep the fallback order.                      |
| Client/customer                                                      | `project.customerId`, `project.client`, project address.       | Link customer if present.                     |

### Financial

| Feed                       | Existing route/component/helper                                                | Notes                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Project financial snapshot | `/api/projects/[id]/financial-snapshot`, `useProjectFinancialSnapshotSummary`. | Preserve warnings and profit readiness behavior.                                                |
| Canonical profit           | `getCanonicalProjectProfit`, `src/lib/profit-engine.ts`.                       | Source of truth for revenue/cost/profit.                                                        |
| Cost dashboard             | `getProjectCostDashboard`, `ProjectCostLinesTable`.                            | Good existing table and mobile card pattern.                                                    |
| Invoices                   | `getInvoicesWithDerived({ projectId })`, links to `/financial/invoices/[id]`.  | Keep AR formulas.                                                                               |
| Estimates                  | `getEstimateList()` filtered by project/client name.                           | Shell-only PR can keep current heuristic; future PR should add safer relation if schema allows. |
| Expenses                   | `RecentExpenseLines`, `/financial/expenses?project_id=...`.                    | Keep project-scoped query link.                                                                 |
| Labor                      | Existing inline labor table and `/projects/[id]/labor`.                        | Keep deep route for full log.                                                                   |
| AP bills                   | `getApBillsByProject`, `/bills`, `/financial/bills`.                           | Do not count generic `ap_bills` as canonical project cost.                                      |
| Subcontracts               | `getSubcontractsByProject`, `/projects/[id]/subcontracts`.                     | Show commitments and link out.                                                                  |
| Commissions                | `ProjectCommissionTab`, `/financial/commissions`.                              | Accrued commission cost is included; commission payments are tracking only.                     |
| Change orders              | `getChangeOrdersByProject`, project change-order routes.                       | Treat approved COs as revenue through existing canonical helper.                                |
| Profit detail              | `/projects/[id]/profit`.                                                       | Preserve route as detailed financial analysis.                                                  |

### Schedule

| Feed               | Existing source                    | Notes                                              |
| ------------------ | ---------------------------------- | -------------------------------------------------- |
| Project milestones | `getProjectSchedule(projectId)`.   | Current detail already renders schedule rows.      |
| Company schedule   | `/schedule`, `/projects/schedule`. | Keep as broader calendar link.                     |
| Daily logs         | `/projects/daily-logs`.            | Future expansion; do not force into Phase 2 shell. |

### Tasks

| Feed           | Existing source                                                                                        | Notes                                    |
| -------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Project tasks  | `ProjectTasksTab`, `getProjectTasks(projectId)`, `createProjectTaskAction`, `updateProjectTaskAction`. | Reuse as-is in shell.                    |
| Punch list     | `ProjectPunchListTab`, `/punch-list?project_id=...`.                                                   | Keep route and project filter.           |
| Task directory | `/tasks`, `/tasks/new`.                                                                                | Preserve global operations entry points. |

### People

| Feed              | Existing source                                                   | Notes                                                                    |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Customer/client   | `project.customerId`, `/customers/[id]`, `/customers`.            | V3 People tab can start read-only.                                       |
| Assigned workers  | `workers` and task assignments; `laborEntries` worker names.      | Use existing rows; avoid new join/query in first PR.                     |
| Subcontractors    | `subcontracts`, `/projects/[id]/subcontracts`, `/subcontractors`. | Keep project-scoped route for full management.                           |
| Vendors           | Expense and AP bill vendor names.                                 | Read-only summary first.                                                 |
| Commission people | `commissions`, `ProjectCommissionTab`.                            | Decide whether this remains Financial or appears as project people role. |

### Documents

| Feed              | Existing source                                              | Notes                                                                                      |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Project documents | `ProjectDocumentsTab`, `getDocumentsByProject(projectId)`.   | Existing upload/preview/download/delete can be reused.                                     |
| Document center   | `/documents?project_id=...`.                                 | Existing document center supports `project_id`, `file_type`, date, search, and pagination. |
| Generated PDFs    | Materials and closeout generation save to project documents. | Preserve current generation flows.                                                         |
| Related records   | `related_module` and `related_id` in document metadata.      | Future document link model should extend this instead of replacing it.                     |

### Photos

| Feed                | Existing source                                                              | Notes                                                           |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Site photos data    | `getSitePhotos(projectId)` and `/api/operations/site-photos?project_id=...`. | Supports project filtering today.                               |
| Site photos page    | `/site-photos`.                                                              | Keep route; V3 can embed a project-filtered compact list later. |
| Photo-to-punch flow | Site photos can create punch-list items.                                     | Good future bridge into Tasks.                                  |

### Materials

| Feed                        | Existing source                                             | Notes                                    |
| --------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| Project material selections | `ProjectMaterialsTab`, `getSelectionsByProject(projectId)`. | Reuse component in first PR.             |
| Material catalog            | `/materials/catalog`, `getMaterialCatalog()`.               | Keep global catalog route.               |
| Material selection PDF      | `/api/projects/[id]/materials/generate-pdf`.                | Generated document remains in Documents. |

### Inspections

| Feed                | Existing source                                       | Notes                                                                               |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Inspection log data | `getInspectionLogs()`, `inspection_log` table helper. | Existing API currently returns all entries; client filters by project locally.      |
| Inspection page     | `/inspection-log`.                                    | Keep route; V3 shell can link first, then add project-filtered embed in a later PR. |
| Status model        | `passed`, `failed`, `pending`.                        | Suitable for project tab summary badges.                                            |

### Closeout

| Feed                   | Existing source                                                     | Notes                                                          |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Closeout punch         | `ProjectCloseoutTab`, `/api/projects/[id]/closeout/punch`.          | Reuse.                                                         |
| Warranty               | `/api/projects/[id]/closeout/warranty`.                             | Reuse.                                                         |
| Completion certificate | `/api/projects/[id]/closeout/completion`, generated completion PDF. | Reuse.                                                         |
| Final invoice PDF      | `/api/projects/[id]/closeout/generate-final-invoice-pdf`.           | Keep financial guardrails around contract/paid/balance values. |

## Route Compatibility Plan

1. Keep `/projects/[id]` as the canonical workspace shell.
2. Keep all existing physical subroutes working:
   - `/projects/[id]/labor`
   - `/projects/[id]/profit`
   - `/projects/[id]/subcontracts`
   - `/projects/[id]/subcontracts/[subId]`
   - `/projects/[id]/subcontracts/[subId]/bills`
   - `/projects/[id]/change-orders/new`
   - `/projects/[id]/change-orders/[coId]`
3. Keep existing global routes working:
   - `/tasks`
   - `/punch-list`
   - `/schedule`
   - `/site-photos`
   - `/inspection-log`
   - `/materials/catalog`
   - `/documents`
   - `/financial/expenses`
   - `/bills`
   - `/financial/invoices`
   - `/subcontractors`
   - `/workers`
   - `/customers`
4. Preserve query-param deep links before changing tab internals:
   - `?tab=overview` -> Overview
   - `?tab=financial`, `?tab=cost`, `?tab=budget`, `?tab=expenses`, `?tab=labor`, `?tab=subcontracts`, `?tab=bills`, `?tab=commission`, `?tab=change-orders` -> Financial
   - `?tab=work`, `?tab=tasks`, `?tab=punch-list`, `?tab=activity` -> Tasks or Overview depending on intent
   - `?tab=schedule` -> Schedule
   - `?tab=documents`, `?tab=docs` -> Documents
   - `?tab=materials` -> Materials
   - `?tab=closeout` -> Closeout
5. Add new V3 tab keys without deleting old keys:
   - `people`
   - `photos`
   - `inspections`
6. Prefer URL query state for the first PR (`/projects/[id]?tab=people`) rather than nested route moves.
7. Only after V3 tabs are stable should subroutes optionally redirect to selected tabs. Even then, preserve old URLs through redirects and tests.

## Mobile Layout Plan

Project Workspace V3 must stay operational, not decorative. Mobile should feel like a compact native project console.

1. Header
   - Keep project name, status, and core KPIs compact.
   - Use a horizontally scrollable KPI strip or 2-column KPI grid, not a tall marketing hero.
   - Keep Edit and More actions reachable with at least 44px touch targets.

2. Tabs
   - Use a horizontally scrollable tab bar with stable min-height 44px.
   - Consider grouping secondary tabs under a "More" segmented menu only if ten tabs feel crowded after visual QA.
   - Preserve active state clearly and avoid wrapping tab labels.

3. Tab content
   - Prefer mobile cards for dense tables where already available, such as `ProjectCostLinesTable`.
   - For tasks, schedule, documents, bills, labor, inspections, and photos, use list rows/cards with one primary action per row.
   - Avoid nested scroll containers except table overflow regions.

4. Bottom safe area
   - Keep current bottom padding pattern from the workspace shell (`max-md:!pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]`).
   - Test with the mobile bottom nav visible.

5. Drawers and modals
   - Reuse Radix/shadcn/HH base drawer and modal patterns.
   - Ensure upload, task, cost-line, document preview, material, commission, and closeout flows remain scrollable on iPhone-sized viewports.

## Financial Safety Guardrails

No Phase 2 shell work should touch financial formulas. The current formula boundaries are explicit and should be preserved.

1. Canonical project profit remains the source of truth:
   - Revenue = base contract plus approved change orders.
   - Actual cost = labor cost plus expense cost plus subcontract cost plus commission cost.
   - `ap_bills` are AP/payment tracking and are not canonical project cost.
   - Profit = revenue - actualCost.
   - Margin = profit / revenue when revenue is positive.
   - Evidence: `src/lib/profit-engine.ts:52`.

2. Project detail should continue using financial snapshot warnings:
   - Use `/api/projects/[id]/financial-snapshot`.
   - Preserve "Needs review" and profit readiness warnings.
   - Preserve fallback to legacy summary when snapshot API fails.
   - Evidence: `src/app/projects/[id]/project-detail-tabs-client.tsx:142`, `src/app/projects/[id]/project-detail-tabs-client.tsx:704`.

3. Do not move cost calculations into UI-only tab components.
   - Keep helpers in `src/lib/profit-engine.ts`, `src/lib/project-cost-dashboard.ts`, `src/lib/financial/project-financial-snapshot-db.ts`, and existing invoice/payment helpers.

4. Do not double count AP and subcontract costs.
   - Project Workspace Financial can display AP bills as obligations, but canonical cost must continue using approved subcontract bills and canonical helpers.

5. Do not change invoice, payment, deposit, bill, payroll, reimbursement, commission, or closeout final invoice math in the shell PR.

6. If later PRs add People/Photos/Inspections data fetching, they must not alter financial props or tests in the same PR.

7. Existing financial tests to keep green for any future implementation:
   - `tests/project-financial-snapshot-api.spec.ts`
   - `tests/project-financial-review.spec.ts`
   - `tests/bills-project-ap-outstanding.spec.ts`
   - `tests/subcontractor-ap-linkage.spec.ts`
   - `tests/bills-manual-subcontract-linkage.spec.ts`

## Implementation Phases

### Phase 2.0: Blueprint

- Create this report only.
- No code, schema, API, formula, deployment, or migration changes.
- Validation: `git diff --check`.

### Phase 2.1: V3 Shell-Only First PR

Goal: expose V3 tabs using existing data/components.

Scope:

- Add a central project workspace tab registry near the project detail component or in a small local module.
- Replace visible tabs `Overview`, `Financial`, `Work`, `Documents` with:
  - Overview
  - Financial
  - Schedule
  - Tasks
  - People
  - Documents
  - Photos
  - Materials
  - Inspections
  - Closeout
- Reuse current components:
  - `ProjectTasksTab`
  - `ProjectPunchListTab`
  - `ProjectDocumentsTab`
  - `ProjectMaterialsTab`
  - `ProjectCloseoutTab`
  - `ProjectCostLinesTable`
  - existing schedule, labor, bills, invoices, subcontracts, change orders tables
- Add placeholder/read-only panels for People, Photos, and Inspections only where the needed data is not already loaded in `/projects/[id]`.
- Keep old `?tab=` values working through alias normalization.
- Do not change route files outside project workspace unless a nav label/test must be updated.
- Do not change API contracts or financial math.

Validation:

- `git diff --check`
- `npm run lint`
- `npx tsc --noEmit`
- Focused Playwright route smoke:
  - `/projects`
  - first available `/projects/[id]`
  - `/projects/[id]?tab=financial`
  - `/projects/[id]?tab=schedule`
  - `/projects/[id]?tab=tasks`
  - `/projects/[id]?tab=documents`
  - `/projects/[id]?tab=materials`
  - `/projects/[id]?tab=closeout`
- Mobile viewport smoke for the tab rail and key panels.

### Phase 2.2: People Tab Read Model

Goal: make project parties visible without schema changes.

- Customer/client card from existing project fields.
- Workers from tasks and labor entries.
- Subcontractors from `subcontracts`.
- Vendors/payees from expenses and AP bills.
- Commission people from `commissions`.
- Links to existing People routes.
- No unified contacts schema yet.

### Phase 2.3: Photos And Inspections Embeds

Goal: bring existing operations records into project context.

- Photos: use `/api/operations/site-photos?project_id=...` or direct helper if moved server-side.
- Inspections: add project-filtered read path only after confirming the current API/client shape; first implementation can link to `/inspection-log` with project context.
- Preserve `/site-photos` and `/inspection-log`.

### Phase 2.4: Financial Detail Polish

Goal: make Financial tab easier to scan while preserving formulas.

- Split Financial panel into AR, Cost, AP, Forecast/Profit, Change Orders.
- Keep snapshot warnings near profit/cost.
- Keep AP obligations visually separate from canonical cost.
- Keep `/projects/[id]/profit` as full analysis.

### Phase 2.5: Documents And Closeout Link Layer

Goal: make evidence easy to find without schema changes first.

- Improve project document filtering by type.
- Surface generated material/closeout PDFs in Documents and Closeout.
- Link closeout prerequisites: open punch, warranty, completion, final invoice PDF.
- Any future `document_links` schema belongs in a later dedicated schema PR, not Phase 2 shell.

## Risk Checklist

| Risk                                                 | Level      | Why it matters                                                              | Guardrail                                                                          |
| ---------------------------------------------------- | ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Breaking deep links to old tab keys                  | Medium     | Tests and users may link to `?tab=cost`, `?tab=change-orders`, etc.         | Keep aliases and query-param compatibility.                                        |
| Ten tabs overcrowd mobile                            | Medium     | Project workspace must stay thumb-friendly.                                 | Use horizontal scroll, 44px targets, mobile smoke before commit.                   |
| Financial formula drift                              | High       | Project profit, AP, AR, and cost are sensitive.                             | Shell-only PR; reuse current props/helpers; run snapshot tests.                    |
| AP double counted as project cost                    | High       | AP bills are obligations but not canonical project cost.                    | Keep AP display separate from canonical cost cards.                                |
| People tab implies unified contacts too early        | Medium     | Current data remains split across customers/workers/vendors/subcontractors. | Build read-only party view from current sources; no schema change.                 |
| Photos/inspections require extra client fetches      | Low/Medium | Could slow project detail or add auth/API drift.                            | Link first or lazy-load tab content; preserve global routes.                       |
| Existing `ProjectDetailClient` confusion             | Low        | Unused client exists with older tabs/formulas.                              | Do not revive it; later cleanup PR can remove only after search/test confirmation. |
| Document delete/upload behavior changes accidentally | Medium     | Documents are evidence and storage-backed.                                  | Reuse `ProjectDocumentsTab` unchanged in shell PR.                                 |
| Closeout final invoice PDF behavior changes          | High       | Closeout touches financial balances.                                        | Do not alter closeout APIs or math in shell PR.                                    |
| Server page fetch grows heavier                      | Medium     | `/projects/[id]` already fetches many datasets.                             | First PR reuses current fetches; future tabs can lazy-load after perf review.      |

## Recommended First PR

Title: `Add Project Workspace V3 shell`

Scope:

- Add a V3 tab registry for project detail.
- Update `/projects/[id]` tab UI to show:
  - Overview
  - Financial
  - Schedule
  - Tasks
  - People
  - Documents
  - Photos
  - Materials
  - Inspections
  - Closeout
- Reuse existing data and components.
- Keep old `?tab=` aliases working.
- Keep all current project routes working.
- Add no schema changes.
- Add no migrations.
- Add no API contract changes.
- Add no financial formula changes.

Suggested file touch list:

- `src/app/projects/[id]/project-detail-tabs-client.tsx`
- Optional local helper: `src/app/projects/[id]/project-workspace-tabs.ts`
- Focused tests only if required: project detail navigation smoke/mobile tab smoke.

Do not include:

- Supabase migrations.
- Query shape rewrites.
- New financial calculations.
- Route deletion or physical route moves.
- Broad design-system refactors.

Acceptance criteria:

- `/projects/[id]` renders the V3 tab shell.
- Old tab links still land on a sensible V3 tab.
- Existing subroutes still load.
- Financial snapshot warnings and metrics remain unchanged.
- Mobile tab rail is usable and has no horizontal page overflow.
- Focused navigation smoke passes.
