# Estimate Module Audit

## Root Causes

### 1. List vs detail data inconsistency
- **Cause**: List page merged Supabase list with cookie fallback (`ESTIMATE_LIST_COOKIE`). Rows from cookie could have stale totals or estimates that only existed in cookie, so list and detail could show different data.
- **Fix**: Use Supabase as single source of truth. List = `getEstimateList()` only; remove cookie merge.

### 2. Summary values incorrect or not loading
- **Cause**: `getEstimateSummary` could throw (e.g. when meta/items fetch failed), and detail page fallback built summary only when `!summary && meta && items.length > 0`, so empty items could leave summary null and sidebar showed "Save the estimate to see totals."
- **Fix**: Make `getEstimateSummary` return a full summary (with zeros) whenever meta exists; detail page fallback uses same formula; ensure summary is never null when we have an estimate.

### 3. Field model inconsistency (Tax/Discount vs Overhead/Profit)
- **Cause**: UI showed four separate fields (Tax, Discount, Overhead %, Profit %) while Summary sidebar showed Tax, Discount, **Markup** (overhead+profit), Total. Confusing and redundant.
- **Fix**: Standardize on Summary model: Material Cost, Labor Cost, Subcontractor Cost, Subtotal, Tax, Discount, **Markup**, Total. In Estimate Information form: one **Markup %** input (persisted as overhead_pct + profit_pct in DB, displayed as single field; save as 50/50 split).

### 4. New estimate not persisting all fields
- **Cause**: `createEstimateWithItems` only accepted clientName, projectName, address, tax, discount, overheadPct, profitPct, costCategoryNames, items. Estimate Date, Valid Until, Notes, Sales Person were not persisted.
- **Fix**: Extend schema (sales_person), extend createEstimate/createEstimateWithItems and payload to persist estimateDate, validUntil, notes, salesPerson.

### 5. Detail page incomplete
- **Cause**: Sales Person had no binding; Overhead % and Profit % were separate; category/line-item structure matched new editor but save/load could diverge.
- **Fix**: Bind Sales Person; replace Overhead % / Profit % with single Markup %; ensure saveEstimateMetaAction writes all fields and revalidates.

### 6. List total derivation
- **Cause**: List total came from `computeGrandTotal(estimateId)` which uses same formula as getEstimateSummary. When list was merged with cookie, cookie totals could be from creation time and not match current DB.
- **Fix**: List uses only Supabase; total always from `computeGrandTotal` in getEstimateList.

---

## Schema / field mapping

### Supabase tables

| Table | Purpose |
|-------|--------|
| **estimates** | Core row: id, number, client (denorm), project (denorm), status, updated_at, approved_at |
| **estimate_meta** | Extended info: client_name, client_phone, client_email, client_address, project_name, project_site_address, cost_category_names (jsonb), tax, discount, overhead_pct, profit_pct, estimate_date, valid_until, notes, **sales_person** (added) |
| **estimate_categories** | Per-estimate category display names: estimate_id, cost_code, display_name |
| **estimate_items** | Line items: id, estimate_id, cost_code, desc (title\ndescription), qty, unit, unit_cost, markup_pct |

### UI field model (standardized)

**Estimate Information:** Client / Customer, Project, Address, Estimate Number, Estimate Date, Valid Until, Status, Sales Person, Notes.  
**Summary:** Material Cost, Labor Cost, Subcontractor Cost, Subtotal, Tax, Discount, Markup, Total.  
**Cost breakdown:** Cost categories (editable name), Add Category, Add Line Item; each line: Title, Description (below row), Qty, Unit, Unit Price, Cost Code, Total.

### Removed / renamed
- **Removed**: Cookie-based list fallback; separate Overhead % and Profit % inputs on detail form.
- **Renamed / unified**: "Markup" in Summary = overhead + profit (single line). Form has one "Markup %" that backs both overhead_pct and profit_pct (stored as 50/50).

---

## Totals formula (single source of truth)

- Line total: `qty * unitCost * (1 + markupPct)`
- Subtotal: sum of line totals
- Markup: `subtotal * (overhead_pct + profit_pct)`
- Grand total: `subtotal + markup + tax - discount`

List total and detail Summary both use this via `computeGrandTotal` / `getEstimateSummary`.

---

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/202603081200_estimate_meta_sales_person.sql` | **New.** Add `sales_person` column to `estimate_meta`. |
| `src/lib/estimates-db.ts` | Meta type + `salesPerson`; `createEstimate` / `createEstimateWithItems` accept and persist `estimateDate`, `validUntil`, `notes`, `salesPerson`; `updateEstimateMeta` accepts `salesPerson`; `toMetaRecord` reads `sales_person`. |
| `src/lib/data/index.ts` | `getEstimateSummary` returns `null` when `meta` is null; `createEstimate` / `createEstimateWithItems` payload types extended with `estimateDate`, `validUntil`, `notes`, `salesPerson`. |
| `src/app/estimates/page.tsx` | List from Supabase only; removed cookie merge and `ESTIMATE_LIST_COOKIE` / `parseFallbackRows`. |
| `src/app/estimates/actions.ts` | Delete action: removed list-cookie cleanup; kept draft-cookie cleanup. |
| `src/app/estimates/new/actions.ts` | Persist `estimateDate`, `validUntil`, `notes`, `salesPerson`; removed all cookie logic (list + draft) after create; redirect to `/estimates/${id}`. |
| `src/app/estimates/new/new-estimate-editor.tsx` | `handleSave` passes `estimateDate`, `validUntil`, `notes`, `salesPerson` to action. |
| `src/app/estimates/[id]/page.tsx` | Replaced Overhead % / Profit % with single **Markup (%)** input; Sales Person input bound to `meta.salesPerson`. |
| `src/app/estimates/[id]/actions.ts` | `saveEstimateMetaAction`: reads `markupPct` from form, sets `overheadPct` and `profitPct` to half each; reads and passes `salesPerson`. |
| `src/app/estimates/[id]/estimate-line-item-row.tsx` | Hidden form includes `markupPct` so line item save persists markup. |

---

## Removed / renamed (summary)

- **Removed**: List fallback from cookie (`ESTIMATE_LIST_COOKIE` merge on list page; cookie set in new estimate action). List is Supabase-only.
- **Removed**: Post-create cookie draft and list update in `createEstimateWithItemsAction`. After save we redirect to detail; list comes from `getEstimateList()`.
- **Renamed (UI only)**: Detail form shows one **Markup (%)** instead of separate Overhead % and Profit %. Stored in DB still as `overhead_pct` and `profit_pct` (saved as 50/50 split).
- **Added**: `sales_person` on `estimate_meta`; persisted from new and detail; bound on detail form.
