# Historical migration provenance — read-only map

**Certified parent release:** `codex/final-anonymous-crud-closure` at
`d3f007ddc6347e66dc2c822bd48dfa36f1acb028`.

**Status:** source-control evidence only. This artifact does not authorize a
database operation or alter `supabase_migrations.schema_migrations`. The
authoritative Production ledger still requires the qualified operator's
read-only capture during the approved change window.

## Evidence boundary

The classifications below are limited to immutable Git objects and certified
release runbooks. No Production connection, migration replay, renumbering, or
ledger repair was performed.

- `git show --find-renames --name-status 2fb7995` records the projects rename
  `202603081650_projects.sql` -> `20260228000301_projects.sql` as `R100`.
- At the certified parent, both projects filenames resolve to blob
  `6704296bb567526e1eb90ac38afc2bb8cb3710c3`, are 2,331 bytes, and have
  SHA-256 `05e7d47b7ca634c403ab9017a837b13f963ea2e8ebce53d5a3d7296bc030ee5d`.
- `git show --find-renames --name-status bed1810` records
  `20260731080335_restore_estimate_grants_rls_parity.sql` ->
  `20260801065640_restore_estimate_grants_rls_parity.sql` as `R100`. Both
  sides resolve to blob `42d097f927380ae488fdb0ea4be9c07c4094879b`, are
  2,089 bytes, and have SHA-256
  `d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349`.
- The certified `docs/RECEIPT_HARDENING_LEDGER_SAFE_ROLLOUT.md` identifies
  `20260802055949` and `20260802110245` as Production-only history to
  preserve. They are not part of this four-migration delta.

## Required preflight capture

Before the four forward transactions, capture exactly this query result from
Production and attach only redacted evidence to the change-window record:

```sql
select version, name
from supabase_migrations.schema_migrations
where version in ('20260801065640', '20260802055949', '20260802110245')
order by version;
```

The expected classifications are:

| Version                                             | Classification                       | Required handling                                                        |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `20260801065640_restore_estimate_grants_rls_parity` | Byte-identical renumbered equivalent | Presence proves provenance. Do not replay. Do not renumber or repair it. |
| `20260802055949_project_pdf_documents_expand`       | Production-only historical migration | Preserve the recorded row. Do not replay. Do not repair it.              |
| `20260802110245_canonical_closeout_reconciliation`  | Production-only historical migration | Preserve the recorded row. Do not replay. Do not repair it.              |

If any required version is absent, duplicated, or has an unexpected name—or if
any additional ledger row cannot be classified from immutable evidence—classify
it as **Unknown** and STOP. This release authorizes no historical ledger
insertion, deletion, replay, renumbering, reset, or repair.
