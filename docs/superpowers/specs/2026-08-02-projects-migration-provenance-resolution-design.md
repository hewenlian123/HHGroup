# Projects Migration Provenance Resolution Design

**Date:** 2026-08-02
**Status:** Implemented and Verified Locally
**Scope:** Specification only; this document grants no implementation, Production, ledger-repair, deployment, or merge authority.

## Decision Summary

Retain both historical Projects migration files unchanged and treat `20260228000301_projects.sql` as the canonical logical source. Quarantine `202603081650_projects.sql` as an exact, fingerprint-pinned Production-ledger mirror. The approved local implementation adds a narrow migration-checker exception and contract tests for this exact pair.

This is the only option that preserves all three verified facts:

1. Production records both migration versions as applied with identical 17-statement arrays.
2. Clean replay requires `20260228000301_projects.sql` before migrations that reference `public.projects`.
3. Current clean-replay behavior requires the later execution because it recreates the `projects_select_all` RLS policy.

Neither file may be deleted, renamed, edited, replaced with a no-op, or moved outside `supabase/migrations` under this specification.

## Authority and Boundaries

This resolution follows the Migration / Financial Safety / Release Gate route and is limited to Projects migration provenance. It does not authorize changes to Closeout, Project PDF, Finance, Auth, UI, Storage, environments, aliases, deployment configuration, Production data, or `supabase_migrations.schema_migrations`.

The historical pair is:

- canonical logical source: `supabase/migrations/20260228000301_projects.sql`
- quarantined Production-ledger mirror: `supabase/migrations/202603081650_projects.sql`

“Quarantined mirror” means a required historical executable artifact whose continued presence is pinned to exact evidence. It is not a second independently editable source of truth.

## File and SQL Evidence

The two repository files are byte-identical, including comments and whitespace, and share Git blob `6704296bb567526e1eb90ac38afc2bb8cb3710c3`.

| Evidence                         | Both files                                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| Lines                            | 54                                                                 |
| Bytes                            | 2,331                                                              |
| Raw SHA-256                      | `05e7d47b7ca634c403ab9017a837b13f963ea2e8ebce53d5a3d7296bc030ee5d` |
| Normalized SHA-256               | `3d33c2838bd138339dcc0928f42912bdc9c6423cb2f9109ee81cc2e3903e6289` |
| SQL-token SHA-256                | `6360e7a0460d5680b28f40294c44ff3a53bb7215a293e46f1cd1947354963fc5` |
| Supabase statement-array SHA-256 | `3b06e021c294ea1d25092c520e6acca6e3d0f19eff7f9499cdb1d1455aa30e49` |
| Supabase statements              | 17                                                                 |
| Explicit outer transaction       | None                                                               |

The raw hash is distinct from the SQL-token hash. Any checker or evidence report must use these labels exactly.

## Git Provenance

The verified first-parent chronology is:

1. `67a59dd8aa5cf7d5bc91182a9a0d553c0d81d463` introduced `202603081650_projects.sql` as blob `6704296b…`.
2. `2fb799555ceeb842aafbcf018ae938612a67d283` renamed it 100% to `20260228000301_projects.sql`. The same commit aligned the active repair hint in `src/lib/projects-db.ts` to the earlier filename, establishing the intended canonical name and order.
3. `7091e7e1dea485025ac0b393673b61565203ca04` reintroduced the later filename as the same blob while restoring several old migration names in an unrelated CI commit.

All three commits are in ancestor order. No merge, divergent edit, or distinct SQL generation separates the copies. All inspected live branch, remote, stash, Codex, and registered-worktree refs contain both files. Git history retains recovery provenance for both.

## Production Ledger Evidence

Read-only inspection of `supabase_migrations.schema_migrations` first confirmed its schema, then confirmed both applied versions:

- `20260228000301`, name `projects`, 17 statements
- `202603081650`, name `projects`, 17 statements

The two Production statement arrays are identical to one another and to the repository parser output, with statement-array SHA-256 `3b06e021c294ea1d25092c520e6acca6e3d0f19eff7f9499cdb1d1455aa30e49`. Both rollback arrays are empty.

This specification forbids deleting, inserting, updating, repairing, or otherwise rewriting either Production ledger row. No Production business data was read for this audit.

## Local Replay and Upgrade Evidence

Disposable local-only Supabase fixtures produced the following matrix:

| Repository form | Clean replay | Final behavior                                                                                                                                 | Production-equivalent migration comparison           |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Both files      | Pass         | Catalog SHA-256 `fb70f3735c6e7c734c9f62eddaf9b2651b23801f35a72e96ad58d8b896cedaa8`; 483 policies                                               | Up to date; no migration proposed                    |
| Earlier only    | Pass         | Catalog SHA-256 `2f85a16bebcf3d49323ffebc406e9fe41281a84ea5ca898b8f7f0fb4edabcb28`; 482 policies; `public.projects.projects_select_all` absent | Fails closed because `202603081650` is remote-only   |
| Later only      | Fail         | `public.projects` is absent when `202602280004_subcontractors_and_bills_ap.sql` creates a foreign key                                          | Fails closed because `20260228000301` is remote-only |

The current both-file repository was restored and replayed after the variants; it returned to catalog SHA-256 `fb70f3735c6e7c734c9f62eddaf9b2651b23801f35a72e96ad58d8b896cedaa8` with both local ledger versions.

## Resolution Options

| Option                       | Production ledger                                      | Clean replay                                | Branch/merge and CLI behavior                                                | Auditability and future risk                                                                  | Rollback/recovery                                                                 |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A. Earlier only              | Contradicts applied later version locally              | Passes but loses one current RLS policy     | Merge can restore the duplicate; CLI reports the later version remote-only   | Simple-looking repository hides ledger and policy drift                                       | Git can restore the file, but normal operation remains unsafe until restored      |
| B. Later only                | Contradicts applied earlier version locally            | Fails before `public.projects` exists       | Merge can restore the duplicate; CLI reports the earlier version remote-only | Earliest dependency failure is deterministic and severe                                       | Git can restore the file; replay remains broken until restored                    |
| C. Exact pair                | Matches both applied versions exactly                  | Passes with current catalog and policies    | Stable across current branches/worktrees; CLI reports up to date             | Highest auditability if the exception is exact and fail-closed; risk is accidental broadening | Revert checker/tests only; both historical files remain recoverable and unchanged |
| D. Notice outside migrations | Missing local applied version                          | Same behavior as deleting the selected file | Notice is ignored by CLI; merges can reintroduce the file                    | Human-readable but not machine-enforced or ledger-compatible                                  | Restore the deleted migration from Git                                            |
| E. Tombstone or compensation | Historical repository SQL no longer matches Production | Requires additional policy/order reasoning  | CLI version may exist, but statement provenance diverges                     | Creates the most complex dual historical account and future maintenance risk                  | Requires restoring exact SQL and potentially reverting new forward SQL            |

### A. Keep earlier; remove later — rejected

Clean replay completes but removes the live anonymous Projects read policy, changes observable authorization behavior, and leaves a Production-only ledger version that makes the normal migration comparison fail. Resolving that mismatch would require unauthorized ledger repair or additional forward behavior changes.

### B. Keep later; remove earlier — rejected

Clean replay fails because later migrations require `public.projects` before the later timestamp. It also leaves the earlier Production ledger version without a local file.

### C. Retain both; quarantine the later exact mirror — recommended

This preserves deterministic replay, current policy behavior, exact Production-ledger alignment, and normal migration comparison. A narrow, fingerprint-pinned exception can distinguish this proven artifact from unreviewed duplicate migrations while failing closed on drift.

### D. Remove one; keep a provenance notice outside migrations — rejected

Documentation cannot satisfy Supabase’s local-to-remote version comparison. The missing applied version still fails the migration safety check.

### E. Replace one with a tombstone/no-op or add compensating SQL — rejected

Editing an applied historical file makes the repository SQL contradict the Production statement array. A compensating forward migration adds unnecessary policy and provenance complexity while still requiring both applied version files to remain represented.

## Implemented Checker Contract

The Owner-approved implementation in `scripts/check-migration-order.mjs` exempts only this pair from the generic duplicate-SQL failure. The exception:

- require both exact filenames;
- require the shared Git-content/raw, normalized, SQL-token, statement-array hashes, and 17-statement count recorded above;
- reject any byte, comment, SQL, statement-boundary, filename, or count mutation;
- reject either file being absent;
- reject any third copy of the same SQL;
- continue rejecting every unrelated duplicate migration;
- identify the earlier filename as canonical and the later filename only as the quarantined ledger mirror;
- preserve the active repair hint’s reference to the earlier filename;
- emit an actionable failure that directs maintainers to this specification.

The exception must not generalize by migration name, fuzzy SQL equivalence, timestamp range, or a list that can silently grow.

## Implemented Regression Tests

The approved local implementation covers:

- exact byte comparison, all four recorded hashes, Git-content equivalence, and the 17-statement count;
- pass with the exact pair present;
- fail after mutation of either file;
- fail after omission or rename of either file;
- fail when a third equivalent migration is introduced;
- fail for an unrelated duplicate pair;
- clean replay with both files and preservation of `projects_select_all` plus the expected Projects policy set;
- Production-equivalent local ledger comparison reporting up to date;
- disposable earlier-only and later-only variants reproducing the documented safety failures;
- read-only Production preflight confirming both versions and statement-array hashes before any future provenance change;
- confirmation that Closeout and Project PDF diffs, tests, migrations, Storage, and behavior are outside this work.

If a future Supabase CLI changes statement parsing, the checker must fail closed and require renewed Owner review rather than silently updating the pinned fingerprint.

## Implementation and Merge Instructions

The local implementation is complete and limited to:

- modify `scripts/check-migration-order.mjs` with the exact-pair exception;
- add or update `src/__tests__/migration-provenance-contract.test.ts` for the contract above;
- update this specification directly to record implementation status;
- leave both Projects migration files byte-for-byte unchanged.

Owner review is required before any merge or push. Conflict resolution must preserve both filenames and exact bytes. No merge may repair the remote ledger, squash the two versions into one, or mix this resolution with Closeout or Project PDF implementation.

## Rollback

The implementation rolls back by reverting only the checker, contract test, and this status update. Both migration files remain unchanged before, during, and after rollback. No database SQL, business-data deletion, Storage action, or migration-ledger edit is part of rollback.

## Risk Register

- **P1 — accidental deletion during merge:** deleting either file causes replay or ledger-comparison failure. Mitigation: exact-pair presence tests and explicit merge instructions.
- **P1 — exception broadening:** a loose allowlist could conceal future duplicate SQL. Mitigation: pin every filename and fingerprint and reject third/unrelated duplicates.
- **P2 — policy intent ambiguity:** the later historical execution restores anonymous Projects select behavior that may warrant a separate security review. This provenance resolution preserves current behavior and does not authorize changing it.
- **P2 — network-dependent production build verification pending:** Google Fonts access can prevent a fully network-isolated production build verification. Track separately; it does not alter this provenance decision.
- **P3 — terminology drift:** calling the later file a second canonical source could invite independent edits. Mitigation: consistently call it a quarantined Production-ledger mirror.

## Owner Decisions Remaining

The Owner must explicitly decide whether to:

1. accept the local Option C implementation after reviewing the separated commit;
2. authorize any later merge or push as a separate action;
3. leave any review of the current `projects_select_all` policy to a separate security change with its own authorization.

Until then, no merge, push, migration-file change, or ledger change is authorized.

## Acceptance Criteria

The locally implemented resolution proves that:

- both repository files remain byte-for-byte identical to the audited hashes;
- clean replay and Production-equivalent upgrade checks pass with both versions;
- the checker accepts only this exact historical pair and fails closed for all drift;
- the canonical logical filename remains `20260228000301_projects.sql`;
- no Production ledger, schema, data, policy, Storage, environment, deployment, Closeout, or Project PDF change occurs;
- all disposable local fixtures are removed after verification.
