# Migration comparison: repo vs production (rzublljldebswurgdqxp)

## Repo migrations (chronological)

All `.sql` files under `supabase/migrations/` with numeric prefix, sorted by timestamp.
Excluded: `RUN_ESTIMATES_MIGRATIONS.sql` (convenience script; individual migrations used).

## Production applied migrations (before sync)

| Version      | Name                              |
|-------------|------------------------------------|
| 20260309093225 | hh_production_core_schema_v1   |
| 20260309093415 | enable_rls_and_dev_policies   |
| 20260309093840 | projects_add_budget_spent_updated |
| 20260309094720 | project_change_orders_add_total_date |

## Production tables (before sync)

workers, estimates, estimate_meta, estimate_items, estimate_snapshots, estimate_categories,
projects, expenses, expense_lines, invoices, invoice_payments, labor_workers, labor_entries,
commitments, project_change_orders, project_change_order_items, project_budget_items,
accounting_periods, project_cost_codes, labor_payments

## Missing tables in production (required by app) — FIXED

Applied migrations (in order):

1. **set_updated_at_from_invoices** — `public.set_updated_at()` (required by labor_invoices trigger; from 202602280009)
2. **labor_invoices** — 202602261000_labor_invoices.sql
3. **subcontractors** — 202603083000_subcontractors.sql
4. **subcontracts** — 202603083100_subcontracts.sql
5. **subcontract_bills** — 202603083200_subcontract_bills.sql
6. **subcontract_payments** — 202603083500_subcontract_payments.sql
7. **create_subcontract_bill_guard** — 202603083300
8. **approve_subcontract_bill** — 202603083400
9. **record_subcontract_payment** — 202603083600

## Verification (post-apply)

| Table                 | Status   |
|-----------------------|----------|
| labor_invoices        | EXISTS   |
| subcontractors        | EXISTS   |
| subcontracts          | EXISTS   |
| subcontract_bills     | EXISTS   |
| subcontract_payments  | EXISTS   |
| invoice_payments      | EXISTS   |
| project_budget_items  | EXISTS   |
| project_change_orders | EXISTS   |
| project_change_order_items | EXISTS   |

**Final schema status: PASS**

## Required tables (already present)

- invoice_payments
- project_budget_items
- project_change_orders
- project_change_order_items

## Migrations to apply (in order)

1. 202602261000_labor_invoices.sql
2. 202603083000_subcontractors.sql
3. 202603083100_subcontracts.sql
4. 202603083200_subcontract_bills.sql
5. 202603083300_create_subcontract_bill_guard.sql
6. 202603083400_approve_subcontract_bill.sql
7. 202603083500_subcontract_payments.sql
8. 202603083600_record_subcontract_payment.sql

Note: 202602280002_truncate_business_data.sql is NOT applied (destructive; would truncate production data).
