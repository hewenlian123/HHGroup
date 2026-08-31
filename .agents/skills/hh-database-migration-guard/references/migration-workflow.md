# HH Database Migration Workflow

Use this reference only after the database/migration route activates. Replace angle-bracket examples with explicit, validated paths or refs. Do not pass unresolved globs, broad directories, or guessed remote targets to destructive commands.

## 1. Inspect and Classify

1. Confirm the repository root is the canonical HH Group repository and read its `AGENTS.md`.
2. Establish an approved comparison base. Do not guess a branch when the correct base affects whether a migration is historical.
3. Inspect both committed and working-tree changes:
   - `git diff --name-status <approved-base>...HEAD -- supabase/migrations`
   - `git status --short -- supabase/migrations`
   - `git ls-files -- supabase/migrations`

4. Classify every migration path:

| Classification                                                        | Verdict                                  |
| --------------------------------------------------------------------- | ---------------------------------------- |
| New forward migration added after the approved base                   | Continue                                 |
| Tracked historical migration modified, renamed, deleted, or reordered | `BLOCKED`                                |
| Migration ancestry or comparison base cannot be established           | `BLOCKED`                                |
| No database contract or migration change                              | Exit this guard and return to the router |

When creating a migration, use the installed Supabase CLI's `migration new` command after checking `--help`; do not invent the filename format.

## 2. Inspect Schema and Contracts

- Verify every referenced table, column, type, constraint, policy, RPC, function, trigger, and role in committed migrations and the local schema.
- Trace affected application calls and generated/database types. Do not assume a database identifier exists.
- Treat financial and authorization-sensitive errors as errors; never convert them to empty data or zero.
- For RLS or privileged functions, apply current `supabase:supabase` security guidance subject to HH rules.

## 3. Static Validation

Run applicable repository checks with Node 22, preserving full output and exit status:

```bash
fnm exec --using=22 npm run check:migration-filenames
fnm exec --using=22 npm run check:migration-order
fnm exec --using=22 npm run check:schema-preflight:strict
```

Run `check:rollback-sql` when the migration type is covered by that repository check. Run `check:schema-vs-code` after reset when application/database contracts changed.

Any required static failure stops the pipeline. Do not proceed merely to collect a later green result.

## 4. Targeted Squawk

Resolve the exact new migration paths from the classified set, then run the project-local binary against those files first:

```bash
./node_modules/.bin/squawk --pg-version=17 <new-migration-1.sql> <new-migration-2.sql>
```

Do not substitute the all-history migration glob as the primary signal. A broad historical scan may be reported separately, but it cannot erase or bury a new-file finding. If targeted Squawk is unavailable or fails, mark the stage `BLOCKED` or `FAILED`.

## 5. Prove Local Target and Reset

Before reset, inspect `supabase status`, the repository Supabase configuration, and relevant non-secret URL hostnames. The target must resolve to the authorized local Supabase instance. Do not print credentials.

Only after local proof:

```bash
fnm exec --using=22 npx supabase db reset --local
```

Do not remove `--local`, add `--linked`, use `db push`, or redirect the command to a hosted project. A target mismatch is `BLOCKED`, not a request to bypass the guard.

## 6. pgTAP and Application Contracts

Run the repository database suite after a successful reset:

```bash
fnm exec --using=22 npm run test:db:local
```

When application contracts changed, also run the narrow affected Vitest tests and TypeScript check. Expand to broader tests when shared data-access or cross-domain behavior changed.

For a financial database change, combine this Skill with `hh-financial-integrity-guard`, its before/after amount regression, and the router's Semgrep requirement. Report Semgrep's actual configured rule coverage; a scan with no applicable SQL rule is not proof of SQL financial semantics.

## 7. Evidence Ledger

Record:

- Approved base and exact new migration paths.
- Confirmation that no historical migration changed.
- Local-target evidence without secrets.
- Every command, scope, exit status, failure, warning, and skipped stage.
- Squawk findings for new files separately from historical findings.
- Reset, pgTAP, TypeScript/Vitest, schema-vs-code, Semgrep, and financial-regression results when applicable.
- Final verdict and any remaining blocker.

Required stage failed or timed out: `FAILED`. Environment or authorization prevents it: `BLOCKED`. Required evidence absent: `NOT VERIFIED`. Use `PASS` only when every applicable stage completed successfully.
