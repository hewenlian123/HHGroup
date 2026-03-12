# Estimate module – Supabase migration summary

## 1. Supabase schema

Migration file: `supabase/migrations/202603081000_estimates.sql`

### Tables

**`public.estimates`**
- `id` uuid PK default `gen_random_uuid()`
- `created_at` timestamptz not null default now()
- `updated_at` date not null default current_date
- `number` text not null (e.g. EST-0001)
- `client` text not null default ''
- `project` text not null default ''
- `status` text not null default 'Draft' check (Draft, Sent, Approved, Rejected, Converted)
- `approved_at` date null
- Unique on `number`

**`public.estimate_meta`**
- `estimate_id` uuid PK FK → estimates(id) ON DELETE CASCADE
- `client_name`, `client_phone`, `client_email`, `client_address` text
- `project_name`, `project_site_address` text
- `cost_category_names` jsonb default '{}'
- `tax`, `discount`, `overhead_pct`, `profit_pct` numeric
- `estimate_date`, `valid_until` date null
- `notes` text null

**`public.estimate_items`**
- `id` uuid PK default gen_random_uuid()
- `estimate_id` uuid not null FK → estimates(id) ON DELETE CASCADE
- `cost_code` text, `desc` text, `qty` numeric, `unit` text, `unit_cost` numeric, `markup_pct` numeric
- Index on `estimate_id`

**`public.estimate_snapshots`**
- `id` uuid PK
- `estimate_id` uuid not null FK → estimates(id) ON DELETE CASCADE
- `version` int not null
- `created_at` date, `status_at_snapshot` text (Approved, Converted)
- `frozen_payload` jsonb not null
- Unique on (estimate_id, version)

### Functions
- `public.next_estimate_number()` returns text – uses sequence `estimate_number_seq` for EST-NNNN.
- `public.set_estimates_updated_at()` trigger – sets `updated_at` on update.

### RLS
All four tables have RLS enabled with per-table policies: `*_select_all`, `*_insert_all`, `*_update_all`, `*_delete_all` for `anon` (dev-friendly; lock down with real auth later).

---

## 2. Files changed

### New
- `hh-unified-web/supabase/migrations/202603081000_estimates.sql` – schema and RLS
- `hh-unified-web/src/lib/estimates-db.ts` – all estimate Supabase access

### Modified
- `hh-unified-web/src/lib/data/index.ts` – estimate APIs now async and delegate to `estimates-db`; `convertEstimateSnapshotToProject` uses Supabase + mock projects
- `hh-unified-web/src/lib/mock-data.ts` – removed all estimate-related code (estimateList, estimateItems, estimateMeta, estimateSnapshots, createEstimate, createEstimateWithItems, setEstimateStatus, createEstimateSnapshot, createNewVersionFromSnapshot, convertEstimateSnapshotToProject, getEstimateSnapshots*, updateEstimateMeta, addLineItem, updateLineItem, deleteLineItem, duplicateLineItem, deleteEstimate, EstimateMetaRecord, EstimateDraftItem, EstimateFrozenPayload, EstimateSnapshot, EstimateStatus). Kept: costCodeMaster, projectsFromEstimates, ProjectFromEstimate, SnapshotBudgetBreakdown
- `hh-unified-web/src/app/estimates/page.tsx` – `await getEstimateList()`, removed unused Badge import
- `hh-unified-web/src/app/estimates/actions.ts` – `await deleteEstimate()`
- `hh-unified-web/src/app/estimates/new/actions.ts` – `await createEstimateWithItems`, `getEstimateById`, `getEstimateSummary`, `getEstimateMeta`, `getEstimateItems`
- `hh-unified-web/src/app/estimates/[id]/page.tsx` – all estimate getters awaited; draft cookie meta normalized to EstimateMetaRecord; cast draft.estimate to EstimateListItem
- `hh-unified-web/src/app/estimates/[id]/actions.ts` – all estimate mutations and snapshot/status actions awaited
- `hh-unified-web/src/app/estimates/[id]/print/page.tsx` – await getEstimateById, getEstimateMeta, getEstimateItems, getEstimateSummary
- `hh-unified-web/src/app/estimates/[id]/preview/page.tsx` – same
- `hh-unified-web/src/app/estimates/[id]/snapshot/page.tsx` – await getEstimateById, getEstimateMeta, getEstimateItems
- `hh-unified-web/src/app/estimates/[id]/snapshot/[version]/page.tsx` – await getEstimateSnapshot; explicit types for filter/reduce
- `hh-unified-web/src/app/projects/page.tsx` – async page; pre-fetch estimate numbers for sources; `getColumns(estimateNumbers)` for table

---

## 3. Queries used (create / list / detail)

### Create estimate
- **RPC** `next_estimate_number()` – get next EST-NNNN.
- **Insert** `estimates` (number, client, project, updated_at).
- **Insert** `estimate_meta` (estimate_id, client_name, client_address, project_name, project_site_address, estimate_date).

### Create estimate with items
- Same as create estimate, then:
- **Update** `estimate_meta` (tax, discount, overhead_pct, profit_pct, cost_category_names) when provided.
- **Insert** `estimate_items` per item (estimate_id, cost_code, desc, qty, unit, unit_cost, markup_pct).

### List estimates
- **Select** `estimates` id, number, client, project, status, updated_at, approved_at, order by updated_at desc.
- For each row, grand total is computed in app via `getEstimateMeta` + `getEstimateItems` and `estimateLineTotal` (subtotal + overhead + profit + tax - discount).

### Get estimate by id (detail)
- **Select** `estimates` (same columns as list) where id = $1, single.
- Grand total computed same way as list.

### Get estimate meta
- **Select** `estimate_meta` * where estimate_id = $1, single.

### Get estimate items
- **Select** `estimate_items` * where estimate_id = $1, order cost_code.

### Update estimate meta
- **Select** `estimates` status, **Select** `estimate_meta` * where estimate_id = $1; if status !== 'Draft' return false.
- **Update** `estimate_meta` with provided fields; optionally **Update** `estimates` client, project, updated_at.

### Line items
- **Add:** **Select** estimates status; if Draft, **Insert** estimate_items, then **Update** estimates updated_at.
- **Update:** **Select** estimates status; if Draft, **Update** estimate_items where id and estimate_id.
- **Delete:** **Select** estimates status; if Draft, **Delete** estimate_items where id and estimate_id; **Update** estimates updated_at.
- **Duplicate:** **Select** estimate_items for source; **Insert** new row with same cost_code, desc + " (copy)", qty, unit, unit_cost, markup_pct.

### Delete estimate
- **Delete** `estimates` where id = $1 (cascade removes estimate_meta, estimate_items, estimate_snapshots).

### Snapshots & status
- **getEstimateSnapshots:** **Select** estimate_snapshots * where estimate_id = $1 order version.
- **createEstimateSnapshot:** **Select** estimates, get meta + items; **Select** max(version) from estimate_snapshots; **Insert** estimate_snapshots (frozen_payload jsonb); **Update** estimates status = Approved, approved_at.
- **createNewVersionFromSnapshot:** get latest Approved snapshot; **Delete** estimate_items for estimate; **Insert** estimate_items from frozen payload; **Update** estimate_meta from payload; **Update** estimates status = Draft, approved_at = null.
- **setEstimateStatus:** **Update** estimates set status, updated_at, approved_at (set or clear by status).

---

## 4. Apply migration

From project root:

```bash
cd hh-unified-web
npx supabase db push
# or
npx supabase migration up
```

Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set so the app can talk to Supabase.
