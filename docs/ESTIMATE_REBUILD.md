# Estimate Module Rebuild — Deliverables

This document summarizes the Estimate module rebuild: Supabase-only data, no mock data, and a single coherent flow (create → save → list → open → edit → save).

---

## 1. Estimate Files Removed / Replaced

The rebuild **replaced** the following (no separate “deleted” files; implementation was overwritten):

| Location                                             | Change                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/estimates-db.ts`                            | **Replaced** — Rewritten for Supabase only (estimates, estimate_meta, estimate_categories, estimate_items). Removed mock/fallback logic.                                                                                                                           |
| `src/lib/data/index.ts`                              | **Updated** — Estimate exports now delegate to `estimates-db.ts`; `getEstimateList`, `getEstimateById`, `getEstimateCategories`, `getEstimateSummary`, `createEstimateWithItems`, `updateEstimateMeta`, line-item and snapshot/convert helpers updated or stubbed. |
| `src/app/estimates/page.tsx`                         | **Replaced** — List page now uses `getEstimateList()` only (no cookies).                                                                                                                                                                                           |
| `src/app/estimates/estimate-list-row.tsx`            | **Replaced** — Row links to `/estimates/[id]`, Edit link, Delete with confirm + server action.                                                                                                                                                                     |
| `src/app/estimates/actions.ts`                       | **Replaced** — `deleteEstimateAction` only (calls `deleteEstimate`, revalidate, redirect).                                                                                                                                                                         |
| `src/app/estimates/new/page.tsx`                     | **Replaced** — Loads cost codes, renders `NewEstimateEditor`; create flow uses `createEstimateWithItemsAction`.                                                                                                                                                    |
| `src/app/estimates/new/actions.ts`                   | **Replaced** — `createEstimateWithItemsAction` calls `createEstimateWithItems` with full payload (meta + categoryNames + items).                                                                                                                                   |
| `src/app/estimates/[id]/page.tsx`                    | **Replaced** — Loads estimate, meta, items, categories, summary, cost codes; redirects to `/estimates` if missing; renders `EstimateEditor`.                                                                                                                       |
| `src/app/estimates/[id]/actions.ts`                  | **Retained** — Same actions; `saveEstimateMetaAction`, `addLineItemAction`, `updateLineItemAction`, `deleteLineItemAction`, `duplicateLineItemAction`, `saveCostCategoryNameAction`. Snapshot/approve/convert/send/reject call stubbed data APIs.                  |
| `src/app/estimates/[id]/snapshot/[version]/page.tsx` | **Replaced** — Now redirects to `/estimates/[id]` (no snapshot payload dependency).                                                                                                                                                                                |

**Legacy UI kept** (used by preview/print or for future use; not part of core create→edit flow):

- `src/app/estimates/[id]/estimate-header.tsx`
- `src/app/estimates/[id]/estimate-read-only.tsx`
- `src/app/estimates/[id]/add-line-item-button.tsx`
- `src/app/estimates/[id]/estimate-proposal-content.tsx`
- `src/app/estimates/[id]/preview/page.tsx`
- `src/app/estimates/[id]/print/page.tsx`
- `src/app/estimates/[id]/snapshot/page.tsx`

---

## 2. New / Rebuilt Files (Core Module)

| File                                                  | Purpose                                                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/estimates-db.ts`                             | Single Supabase data layer: types, `lineTotal`, `computeSummary`, create/list/get/update/delete for estimates, meta, categories, items. |
| `src/app/estimates/page.tsx`                          | Estimate list: table with Estimate #, Client, Project, Status, Total, Updated, Actions.                                                 |
| `src/app/estimates/estimate-list-row.tsx`             | Table row with link to `/estimates/[id]`, Edit, Delete.                                                                                 |
| `src/app/estimates/actions.ts`                        | `deleteEstimateAction`.                                                                                                                 |
| `src/app/estimates/new/page.tsx`                      | New estimate page; uses `NewEstimateEditor`.                                                                                            |
| `src/app/estimates/new/actions.ts`                    | `createEstimateWithItemsAction`.                                                                                                        |
| `src/app/estimates/new/new-estimate-editor.tsx`       | Client editor for new estimate (left: info + line items; right: summary + Save/Cancel).                                                 |
| `src/app/estimates/[id]/page.tsx`                     | Detail page: loads data, renders `EstimateEditor`.                                                                                      |
| `src/app/estimates/[id]/estimate-summary-sidebar.tsx` | Summary sidebar: Material, Labor, Subcontractor, Subtotal, Tax, Discount, Markup, Total.                                                |
| `src/app/estimates/_components/estimate-editor.tsx`   | Edit-only editor: Estimate Information, Cost Breakdown (categories + line items), Summary; Save / Back.                                 |
| `src/app/estimates/[id]/estimate-line-item-row.tsx`   | Editable line item row (title, description below row, qty, unit, unit price, cost code, total, duplicate/delete).                       |
| `src/app/estimates/[id]/actions.ts`                   | Server actions for save meta, add/update/delete/duplicate line items, save category name; snapshot/approve/convert stubbed.             |

---

## 3. Supabase Queries Used

All in `src/lib/estimates-db.ts` unless noted.

| Operation            | Table / RPC                   | Method                                                                                     |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Next estimate number | `rpc("next_estimate_number")` | RPC                                                                                        |
| Create estimate      | `estimates`                   | insert, select id                                                                          |
| Create meta          | `estimate_meta`               | insert                                                                                     |
| Create categories    | `estimate_categories`         | upsert (onConflict: estimate_id, cost_code)                                                |
| Create items         | `estimate_items`              | insert                                                                                     |
| List estimates       | `estimates`                   | select id, number, client, project, status, updated_at, approved_at; order updated_at desc |
| Get estimate meta    | `estimate_meta`               | select \* by estimate_id                                                                   |
| Get categories       | `estimate_categories`         | select cost_code, display_name by estimate_id                                              |
| Get items            | `estimate_items`              | select \* by estimate_id; order cost_code                                                  |
| Update meta          | `estimate_meta`               | update by estimate_id                                                                      |
| Update estimates row | `estimates`                   | update client, project, updated_at by id                                                   |
| Upsert categories    | `estimate_categories`         | upsert by estimate_id, cost_code                                                           |
| Add line item        | `estimate_items`              | insert, select \*                                                                          |
| Update line item     | `estimate_items`              | update by id and estimate_id                                                               |
| Delete line item     | `estimate_items`              | delete by id and estimate_id                                                               |
| Touch estimate       | `estimates`                   | update updated_at by id                                                                    |
| Delete estimate      | `estimates`                   | delete by id                                                                               |

**Tables:** `estimates`, `estimate_meta`, `estimate_categories`, `estimate_items`.  
**RPC:** `next_estimate_number`.

---

## 4. Final Route Structure

| Route                                | Type        | Description                                                                                                            |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/estimates`                         | Dynamic (ƒ) | List: Estimate #, Client, Project, Status, Total, Updated; row/number → `/estimates/[id]`.                             |
| `/estimates/new`                     | Dynamic (ƒ) | Full editor for new estimate (info + line items + summary); Save → create in Supabase → redirect to `/estimates/[id]`. |
| `/estimates/[id]`                    | Dynamic (ƒ) | Load estimate from Supabase; same editor layout as new; edit and save.                                                 |
| `/estimates/[id]/preview`            | Dynamic (ƒ) | Preview (legacy; uses proposal content).                                                                               |
| `/estimates/[id]/print`              | Dynamic (ƒ) | Print view (legacy).                                                                                                   |
| `/estimates/[id]/snapshot`           | Dynamic (ƒ) | Snapshot entry (legacy).                                                                                               |
| `/estimates/[id]/snapshot/[version]` | Dynamic (ƒ) | Redirects to `/estimates/[id]`.                                                                                        |

---

## 5. Field Model (Consistent)

**Estimate information:** Client/Customer, Project, Address, Estimate Number, Estimate Date, Valid Until, Status, Sales Person, Notes.

**Summary:** Material Cost, Labor Cost, Subcontractor Cost, Subtotal, Tax, Discount, Markup, Total.

**Cost breakdown:** Cost categories; Add Category; Add Line Item. Each line: Title, Description (below row), Quantity, Unit, Unit Price, Cost Code, Total.

Supabase is the single source of truth for `estimates`, `estimate_categories`, and `estimate_items` (with `estimate_meta` for extended fields).
