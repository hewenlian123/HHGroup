# Production Launch Checklist

Run the production checklist to verify database integrity, API routes, UI, and tests before deployment.

## Run the checklist

**GET** (checks only, no data changes):

```bash
curl -s "http://localhost:3000/api/production/checklist"
```

**POST** (optional: remove test data, then run checks):

```bash
curl -s -X POST "http://localhost:3000/api/production/checklist" \
  -H "Content-Type: application/json" \
  -d '{"runCleanup": true}'
```

**Clean test data and run all tests** (dedicated endpoint):

```bash
curl -s -X POST "http://localhost:3000/api/production/cleanup-test-data"
```

This deletes rows matching test/demo patterns in dependency order, then runs Full System Test, Run All Tests, and UI Tests. Returns `cleanup.deleted`, `systemTest`, `runAllTests`, `uiTests`, and a `summary`.

**Wipe database completely for production** (removes ALL data; tables/schema unchanged):

```bash
curl -s -X POST "http://localhost:3000/api/production/wipe-database"
```

This deletes every row from main tables in dependency-safe order (no DROP), then runs Full System Test and UI Tests. Use when you want a completely empty database ready for real production data. Returns `wipe.deleted`, `systemTest`, `uiTests`, and `summary`.

## What the checklist does

1. **Database integrity**  
   Calls `/api/schema-check`. Verifies required tables exist: `projects`, `workers`, `estimates`, `project_change_orders`, `project_tasks`, `punch_list`, `project_schedule`, `site_photos`, `inspection_log`, `material_catalog`, `worker_receipts`, `worker_reimbursements`, `expenses`, `expense_lines`, `invoices`, `labor_entries`, `activity_logs`, `payments_received`, `worker_payments`, and required columns.

2. **Remove test data** (when `POST` with `runCleanup: true` or when calling `POST /api/production/cleanup-test-data`)  
   Deletes rows where the relevant column contains: "Workflow Test", "Test", "Test Vendor", "Test Worker", "Test Project", "Example", "Demo". Tables in dependency order: `project_tasks` (title), `punch_list` (issue), `project_schedule` (title), `site_photos` (description), `inspection_log` (notes), `project_change_orders` (title), `worker_receipts` (by test worker/project), `worker_reimbursements` (notes or test worker/project), `worker_payments` (test worker), `labor_entries` (test worker/project), `expense_lines` (test expenses), `expenses` (vendor_name), `payments_received` (customer_name), `invoices` (customer_name), `estimates` (client), `material_catalog` (material_name), `activity_logs` (description or test project), `projects` (name), `workers` (name). Only matching rows are removed; real data is left intact.

3. **CRUD**  
   Runs full system test: create/read/update/delete for Workers, Projects, Receipts, Reimbursements, Expenses, Invoices, Labor, Estimates, Change Orders, Tasks, Punch List, Schedule, Site Photos, Inspection Log, Material Catalog.

4. **API health**  
   Ensures these return successful responses:  
   `/api/projects`, `/api/expenses`, `/api/invoices`, `/api/worker-receipts`, `/api/operations/tasks`, `/api/system-health`.

5. **UI checks**  
   Runs UI smoke tests (e.g. `/projects`, `/estimates`, `/tasks`, `/labor/receipts`, etc.) via `/api/test/run-ui-tests`.

6. **Run all tests**  
   Runs system tests, UI tests, API health (guardian), and schema check via `/api/test/run-all-tests`.

7. **Deployment readiness**  
   Confirms env vars (`NEXT_PUBLIC_SUPABASE_URL`, Supabase keys) and Supabase connection.  
   **You should also:** run `npm run build` and fix any build/console errors before deploying.

## Response summary

- **readyForDeployment**: `true` only when database, CRUD, API, and tests all pass and env/Supabase are set.
- **summary**: `"READY FOR DEPLOYMENT — All checks passed."` or `"NOT READY — Resolve failing checks before deployment."`

## New API routes added for health check

- `GET /api/projects` — project list
- `GET /api/expenses` — expense list  
- `GET /api/invoices` — invoice list  

These are used by the checklist and can be used by other clients.
