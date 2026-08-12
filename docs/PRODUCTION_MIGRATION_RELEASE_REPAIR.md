# Production migration release runbook

This document is an operator review record for the Production release artifact. It
does not authorize a deployment or a database change.

## Artifact migration ledger

The Production migration ledger must record these historical versions before the
release migrations are considered:

- `20260801065640_restore_estimate_grants_rls_parity.sql`
- `20260802055949_project_pdf_documents_expand.sql`
- `20260802110245_canonical_closeout_reconciliation.sql`

The release delta contains only these new migrations, in this order:

1. `20260811190000_financial_protected_access_contract.sql`
2. `20260811233656_project_change_orders_owner_admin_access.sql`

Do not use `supabase db push`, `supabase migration repair`, migration replay, or
renumbering for this release. Do not include
`20260811184720_labor_workers_owner_admin_access.sql`.

## Mandatory preflight during an approved change window

An authorized Production operator must capture read-only evidence that:

1. the historical ledger entries above are recorded and the two release versions
   are not recorded;
2. every table and column referenced by the two release migrations exists with the
   expected type;
3. current grants, RLS enablement, and policies match the migration preconditions;
4. anonymous receipt access is limited to active, named `projects(id, name)` rows;
5. a database backup and the approval record identify the exact release commit.

Stop on any mismatch. No automated workflow in this repository may apply or repair
Production migration history.

## Approved operator sequence

Only after preflight and an explicit Production approval, a qualified operator may
apply each release migration once, in filename order, using the organization’s
audited migration procedure. Record the migration ledger and post-apply RLS/grant
evidence after each transaction. This release artifact does not run that procedure.

## Guarded rollback procedure

The companion rollback artifacts are intentionally transaction-open and require a
session-local confirmation token before they can make changes:

1. `20260811233656_project_change_orders_owner_admin_access.rollback.sql`
2. `20260811190000_financial_protected_access_contract.rollback.sql`

Run them only in that reverse order, only after incident approval, and only through
the audited operator procedure. Each rollback restores an authenticated-only
emergency access posture and preserves the narrow anonymous receipt-project option;
it does not restore broad anonymous table access. Validate grants, RLS policies, and
receipt options before committing or ending the operator-owned transaction.
