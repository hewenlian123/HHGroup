# Four-migration Production rollout operator record

**Status:** PREPARED — non-authorizing. No migration was applied and no ledger
was changed while preparing this record.

**Certified parent release:** `codex/final-anonymous-crud-closure` /
`d3f007ddc6347e66dc2c822bd48dfa36f1acb028`.

**Execution successor scope:** only removal of internal transaction control from
the two forward migration files that contained it, plus the executable
operator procedure below. No RLS, grant, Storage, application, financial, or
rollback semantics change.

## Canonical transaction model

Every forward migration file is transaction-neutral. The authorized operator
runs [FOUR_MIGRATION_OPERATOR_PROCEDURE.sql](FOUR_MIGRATION_OPERATOR_PROCEDURE.sql)
with PostgreSQL 17+ `psql`. For each exact filename, it does:

1. `BEGIN`, set short local timeouts, and acquire the approved transaction-scoped
   advisory lock `hashtext('hh:receipt-hardening:selective-ledger')`.
2. Verify the exact ledger version is absent and that the ledger exposes its
   confirmed `version` and `name` columns. The reviewed migration's own
   fail-closed preconditions then validate its protected schema, RLS, policy,
   grant, trigger, and role assumptions.
3. Execute exactly one reviewed migration file.
4. Insert exactly that migration's `(version, name)` record into
   `supabase_migrations.schema_migrations` in the same transaction.
5. Run immediate fail-closed post-state and exact-ledger verification.
6. `COMMIT`, then confirm the transaction-scoped advisory lock is available.

The procedure has an error branch after every failure boundary. Any error runs
ROLLBACK and STOP. It never uses `supabase db push`,
`supabase migration up`, reset, replay, renumbering, or migration repair.

## Change-window preflight

The authorized Production operator must first attach read-only evidence that:

1. the three historical provenance rows in
   [HISTORICAL_MIGRATION_PROVENANCE_READ_ONLY.md](HISTORICAL_MIGRATION_PROVENANCE_READ_ONLY.md)
   are present exactly once;
2. the four release versions below are each absent exactly once before their
   individual transaction starts;
3. the certified read-only preflights for migrations 3 and 4 match exactly;
4. the required financial, project, Change Order, Receipt Security, Worker,
   Labor, material, RLS, grant, role, trigger, and function prerequisites for
   migrations 1–4 match the reviewed artifacts;
5. the backup/snapshot reference, restore contact, exact release-successor
   commit, explicit owner approval, qualified operator, and bounded window are
   recorded.

Any drift, unexpected ledger row, missing backup, missing approval, or failed
verification is a STOP condition. Production remains unchanged until the
authorized operator completes every required gate.

## Exact order and rollback reference

| Step | Apply exactly once                                            | Immediate transaction verification                                                                                                                           | Certified emergency rollback                                                                                                                                       |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `20260811190000_financial_protected_access_contract.sql`      | Ledger once; fourteen financial tables retain RLS, no anonymous CRUD grant, and the `financial_owner_admin_<table>` policy.                                  | `supabase/rollbacks/20260811190000_financial_protected_access_contract.rollback.sql` with `ROLLBACK_FINANCIAL_PROTECTED_ACCESS_CONTRACT_20260811190000`.           |
| 2    | `20260811233656_project_change_orders_owner_admin_access.sql` | Ledger once; owner/admin project and Change Order policies; no anonymous table CRUD; Receipt Security remains the named active `projects(id,name)` contract. | `supabase/rollbacks/20260811233656_project_change_orders_owner_admin_access.rollback.sql` with `ROLLBACK_PROJECT_CHANGE_ORDERS_OWNER_ADMIN_ACCESS_20260811233656`. |
| 3    | `20260812103821_production_security_baseline_closure.sql`     | Ledger once; retained history tables default-deny; `labor_workers` owner/admin read and server-only projection CRUD; trigger/function present.               | `supabase/rollbacks/20260812103821_production_security_baseline_closure.rollback.sql` with `production-security-baseline-closure-20260812103821`.                  |
| 4    | `20260813002206_final_anonymous_crud_closure.sql`             | Ledger once; all three tables RLS enabled/no policies; `cost_allocations` direct access denied; material CRUD service-role-only.                             | `supabase/rollbacks/20260813002206_final_anonymous_crud_closure.rollback.sql` with `FINAL_ANONYMOUS_CRUD_CLOSURE_20260813002206`.                                  |

Rollback remains its certified, reverse-order, operator-only contract. Each
rollback file intentionally opens a transaction, requires its exact
confirmation value, performs no automatic commit, and needs its own incident
approval before the operator chooses to commit or rollback. The forward
operator procedure does not alter ledger history during rollback.

## Post-window evidence

After all four commits, re-run the certified read-only preflights and access
matrices, verify each release ledger version exactly once, and run the existing
Receipt Security and financial smoke suites unchanged. A failed result stops
the rollout; it is not permission to apply another migration or repair
history.
