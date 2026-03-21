# App-wide data sync (HH Unified Web)

After any **create / update / delete**, client code should call:

```ts
import { syncRouterAndClients } from "@/lib/sync-router-client";

void syncRouterAndClients(router, "optional-reason");
```

instead of `router.refresh()` alone.

## What this does

1. **`router.refresh()`** — Revalidates Next.js App Router server components and props from the server (works with existing `revalidatePath` in server actions).
2. **`hh:app-sync` event** — Notifies client-only screens that keep their own copy of data (Supabase/API) to refetch.

## Subscribing from a client page

```ts
import { useOnAppSync } from "@/hooks/use-on-app-sync";

useOnAppSync(
  useCallback(() => {
    void reloadFromApi();
  }, [reloadFromApi]),
  [reloadFromApi]
);
```

Use a **debounced** listener (built into `useOnAppSync`) so several mutations in a row don’t spam the network.

## Scope

- **Not** a multi-user WebSocket layer; for true realtime from other devices, add Supabase Realtime (or similar) later.
- **Does** keep the current session consistent: RSC tree + mounted client fetchers stay aligned after local mutations and after sync triggered from any screen.

## Modules with `useOnAppSync` (rollout)

| Area | Notes |
|------|--------|
| **Labor** | Daily, main labor client, entries, timesheet, workers/subcontractors (+ detail), invoices (all surfaces), payments, balances, reimbursements, advances, review, worker invoices, payroll (+ summary), **receipts** (API refresh + project names, no full reload), **cost-allocation** (split `loadProjects` / `loadReport`). |
| **Estimates** | Detail + new editor (company tax defaults). |
| **Expenses** | List, detail pages/clients, **new expense** lookups, `ExpensesClient` (Supabase list). |
| **Financial** | Invoices (page + `InvoicesClient` + both detail UIs + **new invoice**), AR, bank (`bank-client` + **data** bank page `reloadAll`), payments received, deposits, workers balances view, reimbursements (expense-based), **financial** overview client, **commissions** (sync instead of full reload on pay). |
| **Accounts / vendors / categories** | Settings categories, financial vendors, financial accounts. |
| **Projects** | `ProjectsClient` (Supabase), `ProjectsListClient`, project detail tabs + legacy detail client, change-order **edit** client, subcontract detail clients. |
| **Change orders** | `ChangeOrdersView` → `syncRouterAndClients`. |
| **Bills / documents** | `BillsListClient`, `DocumentsListClient` → RSC refresh on sync. |
| **Customers / workers** | `CustomersClient` (props + sync), `WorkersListClient`, customer **detail** (`/customers/[id]`). |
| **Materials** | Catalog page. |
| **Operations** | Schedule, site photos, inspection log. |
| **Settings** | Company profile, users, permissions, subcontractors table. |
| **System** | Logs, health (guardian + integrity), backups. |
| **Other** | Tasks, punch list (existing), **upload receipt** options. |

After mutations, keep calling `syncRouterAndClients`; any screen that keeps its own fetched state should also subscribe with `useOnAppSync` (or only `syncRouterAndClients` if it is 100% server-props driven).
