# HH Project OS Sidebar Final Pass Blueprint

Audit mode: plan only. This report does not change code, schema, migrations, API contracts, routes, financial formulas, payroll formulas, Supabase policies, deployment settings, or production data.

## Executive Summary

HH Project now has the right navigation foundation for the Construction ERP direction: a central IA registry in `src/lib/navigation/ia.ts`, a sidebar and bottom nav that consume that registry, a command palette fed by the same registry, and a topbar breadcrumb system with entity-name overrides.

The remaining polish is not a route move. It is a visibility and ownership pass:

- Make the sidebar read like the final six-part HH Project OS.
- Reduce primary sidebar depth so Financial does not feel like a long module dump.
- Fix bottom-nav ownership so one mobile section is active at a time.
- Align command palette discoverability with the final IA, including routes that should no longer be primary sidebar items.
- Move breadcrumb labels toward logical IA ownership, especially for routes whose physical path differs from their future home.

The recommended implementation PR should be sidebar polish only: no schema changes, no financial/payroll formula changes, no API changes, no route deletion, and no physical route moves.

## Current Sidebar Audit

### Evidence Reviewed

- IA registry: `src/lib/navigation/ia.ts`
- Sidebar renderer: `src/components/layout/sidebar.tsx`
- Mobile bottom nav: `src/components/layout/bottom-nav.tsx`
- App shell drawer/topbar/bottom nav composition: `src/components/layout/app-shell.tsx`
- Command palette: `src/components/command/neo-command-palette.tsx`
- Topbar breadcrumbs: `src/components/layout/topbar.tsx`
- Settings subnav: `src/components/settings/settings-sub-nav.tsx`
- Route compatibility examples: `/vendors`, `/labor/subcontractors`, `/backups`, `/financial/estimates`, `/financial/bills`, `/financial/payments-received`

### Current Structure

| Section   | Current visible entries                                                                                                                                                                                                                                       | Audit note                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | Dashboard                                                                                                                                                                                                                                                     | Clean and aligned.                                                                                                                  |
| Projects  | Projects, Estimates, Change Orders, Operations: Time Entries, Tasks, Punch List, Schedule, Material Catalog                                                                                                                                                   | Too broad for final sidebar. Customers is missing from Projects even though the target IA includes it.                              |
| Financial | Overview, Owner Dashboard, AR Summary, Estimates, Invoices, Payments Received, Deposits, Bills, Expenses, Receipt Inbox, worker payable routes, Payroll Summary, Commissions, Accounts, Bank Transactions, Cash Flow, Project Financial Review, System Health | Correct Financial OS concepts exist, but the section is long and mixes OS hubs, leaf modules, worker AP, reports, and admin health. |
| People    | Customers, Workers, Vendors, Subcontractors, All Contacts future placeholder                                                                                                                                                                                  | Strong direction. Vendors route is physically `/financial/vendors`, which requires careful active-state ownership.                  |
| Documents | Documents, Site Photos, Inspection Log, Upload Receipt                                                                                                                                                                                                        | Documents core is clean. Upload Receipt is operational intake, not a final primary Documents item.                                  |
| Settings  | Settings, Company, Users, Roles, Account, Expense Preferences, Lists, Categories, Subcontractor Settings, Financial Review, Admin Center: System Health, Metrics, Logs, Backups                                                                               | Admin Center is in the right place, but Settings is too detailed for the final primary sidebar.                                     |

### Current Strengths

- The registry already centralizes section labels, hrefs, icons, aliases, placeholders, command items, and mobile nav items.
- Sidebar active state supports aliases and exact matching.
- Mobile drawer starts closed on small viewports and opens the active section, which keeps first paint less crowded.
- Collapsed desktop/tablet sidebar preserves route access with icon-only labels, titles, and accessible labels.
- `All Contacts` is correctly represented as a disabled future/read-only placeholder, not a writable module.

### Current Friction

- Financial is too long for daily use. It exposes every leaf route in the sidebar instead of presenting the stable OS hubs: Overview, AR, AP, Cash, Reports.
- System Health appears under both Financial Reports and Settings/Admin Center. The final primary owner should be Settings/Admin Center, with Financial Reports linking to financial review/data-quality surfaces only when needed.
- Material Catalog, Time Entries, Punch List, and Upload Receipt are useful routes but make the primary sidebar feel like a module archive.
- Settings exposes several preference/detail pages as first-class sidebar rows. The target calls for Company, Users, Roles, Preferences, and Admin Center.
- Customers intentionally appears in both Projects and People in the target IA. Without an explicit ownership rule, this can read as duplication rather than a deliberate cross-functional entry point.

## Current Bottom-Nav Audit

Current mobile bottom nav comes from `HH_PROJECT_OS_MOBILE_NAV_ITEMS`:

1. Dashboard -> `/dashboard`
2. Projects -> `/projects`
3. Financial -> `/financial`
4. People -> `/workers`
5. Documents -> `/documents`

This is the right five-item mobile shape. It respects 44px touch targets, uses safe-area bottom padding, and avoids adding Settings as a sixth primary mobile item.

Issues to fix in the polish PR:

- Bottom nav does not currently model route ownership as precisely as the sidebar.
- `/financial/vendors` can match Financial by `/financial` prefix and People by People aliases, which can create a dual-active concept.
- Financial bottom-nav aliases should include `/bills` and worker payable routes such as `/labor/payroll`, `/labor/payments`, `/labor/advances`, `/labor/reimbursements`, `/labor/worker-balances`, `/labor/worker-invoices`, and `/labor/receipts`.
- Projects bottom-nav aliases should include `/estimates`, `/change-orders`, `/tasks`, `/punch-list`, `/schedule`, and possibly `/materials/catalog`.
- Documents bottom-nav aliases should include `/site-photos` and `/inspection-log`.
- Settings should remain reachable through the drawer/topbar/avatar rather than crowding the bottom nav.

## Current Command Palette Audit

The command palette is registry-fed through `HH_PROJECT_OS_COMMAND_ITEMS` and currently provides two groups: Navigate and Create.

Current strengths:

- It covers the core OS entries: Dashboard, Projects, Financial, People, Customers, Workers, Vendors, Subcontractors, Documents, Settings.
- It covers important financial work: AR Summary, Invoices, Payments Received, Bills, Expenses, Bank Transactions, Payroll Summary, Project Financial Review.
- Create actions are practical: New Project, New Estimate, New Invoice, Upload Expense.
- Mobile dialog sizing uses safe-area-aware top/bottom positioning and a scrollable list.

Current gaps:

- It does not fully reflect the final sidebar IA. Missing or weakly discoverable commands include Tasks, Schedule, Change Orders, Site Photos, Inspection Log, Material Catalog, Receipt Inbox, Accounts/Cash, Deposits, Worker Balances, Worker Advances, Worker Reimbursements, Worker Receipts, System Metrics, System Logs, and Backups.
- It still groups everything as Navigate/Create. That is workable, but the final command palette should support OS-based search language: Projects, Financial, People, Documents, Settings, Admin Center.
- It should not expose `All Contacts` as a runnable command until a real read-only route exists.
- If Material Catalog leaves the primary sidebar, command palette discoverability becomes more important.

## Current Breadcrumb Audit

Topbar breadcrumbs are built locally in `src/components/layout/topbar.tsx` from path segments plus entity-title overrides. Entity overrides are already used for projects, customers, invoices, workers, bills, estimates, subcontractors, and project subroutes.

Current strengths:

- The topbar keeps breadcrumbs compact by rendering the last two segments and preserving the full trail in the title attribute.
- Entity labels replace UUIDs on important detail routes.
- Breadcrumbs are hidden on mobile to preserve space, while Settings has a small mobile breadcrumb in `SettingsSubNav`.

Current drift:

- Breadcrumbs follow physical routes, not future IA ownership.
- `/labor/payroll` reads as Labor -> Payroll, but final IA places worker payroll under Financial/AP.
- `/labor/payments`, `/labor/advances`, `/labor/reimbursements`, `/labor/worker-balances`, `/labor/worker-invoices`, and `/labor/receipts` should read as Financial/AP in the OS mental model.
- `/financial/vendors` physically reads as Financial -> Vendors, but visually belongs to People -> Vendors.
- `/bills` lacks Financial/AP parent context.
- `/settings/project-financial-review` is physically under Settings but logically belongs to Financial Reports and admin/data-quality guardrails.
- `/materials/catalog` currently reads from physical segments, but if it leaves the sidebar it needs a stable logical parent such as Projects -> Materials.

## Final Recommended Sidebar

This is the target visible primary sidebar. Existing routes should continue to work, and hidden/deep routes should remain reachable through hubs, command palette, quick actions, breadcrumbs, and existing page links.

### Dashboard

| Label     | Href         | Notes                            |
| --------- | ------------ | -------------------------------- |
| Dashboard | `/dashboard` | Future Dashboard Command Center. |

### Projects

| Label         | Href             | Notes                                                                              |
| ------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Projects      | `/projects`      | Canonical project list/workspace.                                                  |
| Estimates     | `/estimates`     | Shared with Financial/AR, but project acquisition belongs here in primary sidebar. |
| Change Orders | `/change-orders` | Keep project-scoped change order subroutes working.                                |
| Customers     | `/customers`     | Intentional shared entry with People; project intake users expect customers here.  |
| Tasks         | `/tasks`         | Treat Punch List as a task/closeout drill-down, not primary sidebar row.           |
| Schedule      | `/schedule`      | Keep project schedule aliases and links.                                           |

### Financial

| Label    | Initial href                                                    | Aliases/covered routes                                                                                                                                                                                                      | Notes                                                                                                               |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Overview | `/financial`                                                    | `/financial/owner`, `/finance`                                                                                                                                                                                              | Owner dashboard remains linked from Overview until Dashboard Command Center absorbs executive KPIs.                 |
| AR       | `/financial/ar`                                                 | `/estimates`, `/financial/invoices`, `/financial/payments`, `/financial/deposits`, `/financial/payments-received`                                                                                                           | AR landing should expose estimates, invoices, payments received, deposits, and customer balances.                   |
| AP       | `/bills` until an AP hub exists                                 | `/financial/expenses`, `/financial/inbox`, `/financial/commissions`, `/labor/payroll`, `/labor/payments`, `/labor/advances`, `/labor/reimbursements`, `/labor/worker-balances`, `/labor/worker-invoices`, `/labor/receipts` | Do not invent `/financial/ap` unless a shell route is added in a separate UI-only PR.                               |
| Cash     | `/financial/accounts`                                           | `/financial/bank`, `/dashboard/cashflow`, `/financial/deposits`                                                                                                                                                             | Accounts is the safest current cash landing.                                                                        |
| Reports  | `/settings/project-financial-review` until a reports hub exists | `/system-health`, project profit routes, closeout links                                                                                                                                                                     | Keep System Health visually under Settings/Admin Center; use Reports for financial review/data quality cross-links. |

### People

| Label          | Href                           | Notes                                                                          |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Customers      | `/customers`                   | Shared with Projects. People owns long-term contact identity.                  |
| Workers        | `/workers`                     | Profile/directory home. Worker money flows remain Financial/AP.                |
| Vendors        | `/financial/vendors`           | Physical path remains for compatibility. Visual owner is People.               |
| Subcontractors | `/subcontractors`              | Keep `/labor/subcontractors*` redirects.                                       |
| All Contacts   | disabled/read-only placeholder | No writable module until Contacts + Roles is designed and migrated separately. |

### Documents

| Label          | Href              | Notes                                                      |
| -------------- | ----------------- | ---------------------------------------------------------- |
| Documents      | `/documents`      | Canonical document center.                                 |
| Site Photos    | `/site-photos`    | Project photo evidence.                                    |
| Inspection Log | `/inspection-log` | Inspection evidence and future project inspections source. |

### Settings

| Label        | Href                           | Notes                                                                                                                                                                |
| ------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company      | `/settings/company`            | Default Settings landing remains via `/settings` redirect.                                                                                                           |
| Users        | `/settings/users`              | User management.                                                                                                                                                     |
| Roles        | `/settings/permissions`        | Keep route name; label as Roles.                                                                                                                                     |
| Preferences  | `/settings/expenses` initially | Cover Expense Preferences, Lists, Categories, and Subcontractor Settings through settings subnav. Add `/settings/preferences` only in a separate shell PR if needed. |
| Admin Center | subheader/group                | System Health, Metrics, Logs, Backups.                                                                                                                               |

## Audit Question Answers

1. Should Material Catalog remain in sidebar?

No, not in the final primary sidebar. Keep `/materials/catalog` working and make it discoverable through Project Workspace Materials, command palette, and project/material page links. If usage is high, keep it as a command and optional Projects secondary link, not a top-level sidebar row.

2. Should Inbox Draft remain visible or move fully into Financial/AP?

Move receipt/inbox work fully into Financial/AP. The current `Receipt Inbox` should remain reachable because it is operationally important, but it should be owned by AP, not Documents. If the final sidebar collapses Financial to five hubs, AP must expose Receipt Inbox immediately on the AP landing or in command palette.

3. Should Time Entries stay under People or move under Projects/Operations?

Time Entries should not live under People primary navigation. People owns worker profiles. Time entry is project operations, while payroll, payments, advances, reimbursements, balances, invoices, and receipts are Financial/AP. For final sidebar, remove Time Entries from primary sidebar and keep it discoverable through Projects/Tasks/Schedule context, quick action Add Labor Entry, and command palette.

4. Are there duplicated navigation concepts?

Yes, some are intentional and some should be reduced:

- Customers in Projects and People is intentional, but needs clear ownership copy: Projects for project intake, People for identity/contact management.
- Estimates are currently visible in Projects and Financial/AR. The final sidebar should show Estimates under Projects, while AR landing and command palette keep them discoverable as receivable pipeline.
- System Health is duplicated in Financial and Settings. Final primary owner should be Settings/Admin Center.
- Upload Receipt, Receipt Inbox, Worker Receipts, and Documents overlap. Final ownership should be AP intake for receipt workflows and Documents for file evidence.
- Vendors are physically under `/financial/vendors` but visually owned by People. Bottom nav and breadcrumbs need explicit route ownership to prevent drift.

5. Are any routes difficult to discover?

Yes. After sidebar simplification, the following need command palette and hub links:

- Material Catalog: `/materials/catalog`
- Punch List: `/punch-list`
- Receipt Inbox: `/financial/inbox`
- Worker Balances: `/labor/worker-balances`
- Worker Receipts: `/labor/receipts`
- Worker Invoices: `/labor/worker-invoices`
- Project Financial Review: `/settings/project-financial-review`
- System Metrics, Logs, Backups: `/system-metrics`, `/system-logs`, `/system/backups`

6. Does mobile navigation need restructuring?

Keep the five-item bottom nav, but add route ownership aliases and prevent dual-active states. The mobile drawer can remain the full IA escape hatch. Do not add Settings to bottom nav unless one of the existing five items is removed, because six items will hurt thumb usability and label fit.

7. Is the command palette aligned with the final IA?

Partially. It is aligned at the OS-entry level, but not yet at the final discoverability level. The polish PR should add missing commands and keywords for hidden/deep routes, and either group commands by OS or enrich search keywords so users can type `AP`, `Cash`, `Reports`, `Admin Center`, `photos`, `inspection`, `materials`, `receipts`, and `payroll`.

## Final Recommended Bottom Nav

Keep five items:

| Label     | Href         | Ownership aliases                                                                                                                                                |
| --------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | `/dashboard` | `/dashboard/cashflow` may remain Financial-owned if Cash takes priority; otherwise Dashboard for executive cashflow.                                             |
| Projects  | `/projects`  | `/estimates`, `/change-orders`, `/tasks`, `/punch-list`, `/schedule`, `/materials/catalog`, project subroutes.                                                   |
| Financial | `/financial` | `/bills`, `/finance`, `/financial/*` except People-owned `/financial/vendors`, worker payable routes under `/labor/*`.                                           |
| People    | `/workers`   | `/customers`, `/workers`, `/workers/summary`, `/financial/vendors`, `/vendors`, `/people/vendors`, `/subcontractors`, `/labor/subcontractors`, `/labor/workers`. |
| Documents | `/documents` | `/site-photos`, `/inspection-log`, document/project document routes.                                                                                             |

Recommended mobile active-state rule:

1. Resolve exact route-owner overrides first.
2. Resolve aliases second.
3. Resolve prefix matches last.
4. Return one active bottom-nav item only.

This prevents `/financial/vendors` from lighting up both Financial and People.

## Final Recommended Command Palette

Keep the create commands, but expand navigation commands around the final IA.

Recommended command groups:

- Dashboard
- Projects
- Financial
- People
- Documents
- Settings
- Create

Recommended commands:

| Group     | Commands                                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | Dashboard, Cash Flow if retained as executive view                                                                                                                                                                                                                                                                    |
| Projects  | Projects, Estimates, Change Orders, Customers, Tasks, Punch List, Schedule, Material Catalog                                                                                                                                                                                                                          |
| Financial | Overview, Owner Dashboard, AR, Invoices, Payments Received, Deposits, AP/Bills, Expenses, Receipt Inbox, Payroll Summary, Worker Payments, Worker Advances, Worker Reimbursements, Worker Balances, Worker Receipts, Worker Invoices, Commissions, Cash/Accounts, Bank Transactions, Reports/Project Financial Review |
| People    | Customers, Workers, Worker Summary, Vendors, Subcontractors                                                                                                                                                                                                                                                           |
| Documents | Documents, Site Photos, Inspection Log, Upload Receipt if kept as a quick intake action                                                                                                                                                                                                                               |
| Settings  | Company, Users, Roles, Preferences, System Health, System Metrics, System Logs, Backups                                                                                                                                                                                                                               |
| Create    | New Project, New Estimate, New Invoice, New Expense, New Bill, Add Labor Entry, Upload Photo, Upload Receipt                                                                                                                                                                                                          |

Search keyword recommendations:

- `ap`, `payables`, `bills`, `worker pay`, `payroll`, `reimbursements`
- `ar`, `receivables`, `collections`, `payments received`, `deposits`
- `cash`, `bank`, `reconcile`, `accounts`
- `reports`, `financial review`, `data quality`, `profit`
- `admin`, `health`, `metrics`, `logs`, `backups`
- `materials`, `catalog`, `punch`, `inspection`, `photos`

Do not add `All Contacts` as a command until there is a real read-only contacts route.

## Final Recommended Breadcrumb Strategy

Breadcrumbs should keep using entity-title overrides, but route labels should come from a central logical ownership map rather than physical path segments alone.

Recommended examples:

| Route family                         | Current physical read                | Recommended logical breadcrumb                   |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------ |
| `/bills`                             | Bills                                | Financial -> AP -> Bills                         |
| `/financial/expenses`                | Financial -> Expenses                | Financial -> AP -> Expenses                      |
| `/financial/inbox`                   | Financial -> Inbox                   | Financial -> AP -> Receipt Inbox                 |
| `/labor/payroll`                     | Labor -> Payroll                     | Financial -> AP -> Payroll                       |
| `/labor/payments`                    | Labor -> Worker Payments             | Financial -> AP -> Worker Payments               |
| `/labor/advances`                    | Labor -> Worker Advances             | Financial -> AP -> Worker Advances               |
| `/labor/reimbursements`              | Labor -> Worker Reimbursements       | Financial -> AP -> Worker Reimbursements         |
| `/labor/worker-balances`             | Labor -> Worker Balances             | Financial -> AP -> Worker Balances               |
| `/financial/vendors`                 | Financial -> Vendors                 | People -> Vendors                                |
| `/subcontractors`                    | Subcontractors                       | People -> Subcontractors                         |
| `/materials/catalog`                 | Material Catalog -> Catalog          | Projects -> Material Catalog                     |
| `/settings/project-financial-review` | Settings -> Project Financial Review | Financial -> Reports -> Project Financial Review |
| `/system-health`                     | System Health                        | Settings -> Admin Center -> System Health        |
| `/system-metrics`                    | System Metrics                       | Settings -> Admin Center -> Metrics              |
| `/system-logs`                       | System Logs                          | Settings -> Admin Center -> Logs                 |
| `/system/backups`                    | System -> Backups                    | Settings -> Admin Center -> Backups              |

Implementation guidance:

- Add a route-owner/breadcrumb registry next to or inside `src/lib/navigation/ia.ts`.
- Keep path-segment fallback for unknown routes.
- Preserve entity-title overrides for detail pages.
- Keep compact topbar display, but use the logical full trail in the title attribute.
- Mobile can continue hiding topbar breadcrumbs; individual pages and Settings subnav should carry context.

## Visual Polish Recommendations

- Reduce sidebar visual density by showing final OS entries and moving deep leafs to command palette and landing pages.
- Keep the current compact, dark, premium admin style. Avoid marketing-style cards, oversized icons, decorative gradients, or new color systems.
- Use section labels and subheaders sparingly. Once Financial is five links, remove extra subheaders inside Financial.
- Keep a consistent 13px row label, 15px icon, 44px touch target on mobile/tablet, and compact desktop row height.
- Prefer distinct icons for major concepts:
  - Projects: FolderKanban
  - Estimates/Invoices/Documents: FileText/FileStack variants
  - Financial/AR/AP/Cash: CircleDollarSign, Receipt, Wallet/Landmark
  - People: Users, with vendors/subcontractors optionally differentiated by Building2/HardHat-style icons only if already available and consistent
  - Settings/Admin: Settings, ShieldCheck, Activity, BarChart, ScrollText, Archive
- Keep active state restrained: one gold accent, one left rail, no competing badges except high-value alerts.
- Future placeholders should remain muted and disabled, with no hover style that implies clickability.
- In collapsed mode, avoid showing dozens of leaf icons. The final shorter sidebar will make collapsed navigation feel intentional instead of dense.

## Mobile Recommendations

- Keep bottom nav at five items.
- Keep drawer width near current `210px` and `max-w-[85vw]`.
- Fix active route ownership before adding more aliases.
- Add bottom-nav aliases for Projects, Financial, People, and Documents so route families activate the right icon.
- Ensure no horizontal overflow after label changes. Labels should remain short: Dashboard, Projects, Financial, People, Documents.
- Keep Settings out of bottom nav and reachable from hamburger drawer, avatar, and command palette.
- Keep quick actions for high-frequency create/intake workflows: Add Labor Entry, New Expense, Upload Receipt, Upload Photo, New Project.
- If sidebar sections remain collapsible in the mobile drawer, consider opening only the active section plus Dashboard by default to reduce scrolling.
- Maintain at least 44px touch targets for drawer rows, topbar buttons, command palette rows, and quick action sheet rows.

## Future Scalability

The sidebar should stay stable as new Construction ERP modules arrive:

- Projects can later add Permits, RFIs, Submittals, Warranty, but only after each has a real route or hub card.
- Financial can add dedicated `/financial/ap`, `/financial/cash`, and `/financial/reports` shells later without changing existing route contracts.
- People can add `/people` or `/contacts` as a read-only index after Contacts + Roles is designed.
- Documents can add Plans, Permits, Contracts, Closeout Docs inside the Documents OS without crowding the primary sidebar immediately.
- Settings can add a real Admin Center hub later while preserving direct `/system-*` routes.

## Risk Checklist

- Do not delete or move existing routes.
- Do not create schema changes, migrations, or Supabase policy changes.
- Do not change API contracts.
- Do not change financial, payroll, worker balance, invoice, payment, AP, project profit, or closeout formulas.
- Do not make `All Contacts` writable or imply a working contacts module before it exists.
- Do not point sidebar items to non-existent hub routes such as `/financial/ap`, `/financial/cash`, `/financial/reports`, `/people`, or `/settings/admin` unless those shell routes are intentionally added in a separate UI-only PR.
- Preserve aliases and redirects before visual regrouping hides leaf routes.
- Avoid dual-active bottom-nav states, especially `/financial/vendors`.
- Keep `/upload-receipt` and public receipt/print routes stable.
- Keep System Health, Metrics, Logs, and Backups under Settings/Admin Center as primary ownership.
- Add command palette coverage for any route removed from primary sidebar.
- Verify mobile drawer, bottom nav, command palette, and breadcrumbs after polish.

## Recommended Implementation PR

Title: `Polish HH Project OS sidebar IA`

Scope: sidebar polish only.

Allowed changes:

1. Update `src/lib/navigation/ia.ts` to define the final primary sidebar structure.
2. Keep all current hrefs, aliases, redirects, and legacy routes working.
3. Add route-owner aliases for bottom nav so only one mobile item is active per route.
4. Expand command palette entries and keywords for routes removed from primary sidebar.
5. Add a logical breadcrumb ownership map or helper that aligns physical routes with future IA labels.
6. Keep visual changes limited to spacing, hierarchy, labels, active state, and disabled placeholder treatment.
7. Update focused navigation tests only.

Explicitly out of scope:

- No schema changes.
- No migrations.
- No Supabase policy changes.
- No API changes.
- No financial formula changes.
- No payroll or worker balance formula changes.
- No route deletion.
- No deploy.

Suggested validation for the implementation PR:

- `git diff --check`
- `npm run lint`
- `npx tsc --noEmit`
- Focused navigation Playwright smoke covering desktop sidebar, mobile drawer, bottom nav active state, command palette search, and topbar breadcrumbs for representative routes:
  - `/dashboard`
  - `/projects`
  - `/estimates`
  - `/tasks`
  - `/schedule`
  - `/financial`
  - `/financial/ar`
  - `/bills`
  - `/financial/expenses`
  - `/financial/vendors`
  - `/workers`
  - `/subcontractors`
  - `/documents`
  - `/site-photos`
  - `/inspection-log`
  - `/settings/company`
  - `/system-health`
