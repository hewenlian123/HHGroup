# HH Group Server / Data Performance Audit

Read-only source, migration, local Postgres statistics, and browser/server-log audit. No schema or index change was made.

## Highest-confidence findings

1. **P0 correctness/security boundary outside this performance batch — Project Detail fallback/client inconsistency.** The page verifies one owner/admin session, then mixes verified RLS, default anonymous, and internal service-role helpers; a broad `safe()` wrapper converts failures to empty/zero values. Changing this could alter security and visible financial semantics, so it is reported rather than bundled into performance work.
2. **P1 SERVER/DATA — Project Detail loads every tab and duplicates canonical financial reads.** Twenty data sources run on every tab. `getCanonicalProjectProfit` runs directly and again inside `getProjectCostDashboard`; billing summary also loads payments once per invoice.
3. **P1 DATA FETCHING — Expenses has a confirmed serial attachment N+1.** The complete ledger is unbounded and each expense performs two attachment-table reads in a serial loop after other list hydration.
4. **P1 SERVER/DATA — Dashboard repeats canonical batch work and adds a per-project source lookup.** At the current cap this can add up to 200 source queries.
5. **P1 NETWORK/DATA — Invoice list requests `all=1&pageSize=1000` and performs status/filter/pagination work in the browser.** An existing server-paged path cannot replace this until exact derived-status totals/filter semantics are preserved.
6. **P1 DATA — Payroll loads several unbounded history tables for a date-bounded view.** Tasks and Schedule are also unbounded full-list APIs.
7. **P1 DATABASE — Cashflow performs one expense-total query per project.** A grouped read/RPC is a future candidate after real Production plan evidence.

## Database evidence

- Local PostgreSQL has `pg_stat_statements` 1.11 enabled.
- Local fixture volume is too small for production-shape conclusions: one project, expense, expense line, document, worker, worker invoice, and labor entry; two project tasks; zero invoices/payments.
- Existing migrations contain broad single-column indexes for project/task/schedule/invoice/labor filters. The local top statements were Studio/schema/test traffic, not representative application load.
- Potential composite/trigram/index ideas remain hypotheses. No `EXPLAIN (ANALYZE, BUFFERS)` against representative Production data was available, so **no migration or index is justified or approved**.
