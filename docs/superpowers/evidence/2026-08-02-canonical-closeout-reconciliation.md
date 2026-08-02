# Canonical Closeout reconciliation — local implementation evidence

Date: 2026-08-02 (Pacific/Honolulu)
Worktree: `/private/tmp/hh-production-migration-reconciliation`
Branch: `codex/production-migration-reconciliation`
Approved specification SHA: `a1b1dcbd54f3bcba4946d6b35adbdf07250ed006`
Scope: local implementation and verification only; no Production, remote database, Storage,
deployment, push, merge, alias, or environment mutation.

## Authority and schema evidence

The Migration / Financial Safety / Release Gate route was followed. Read authority:

- `Codex Reading Routes`
- `99 Decision Log`
- `00 Vision`
- `01 Product Principles`
- `02 Product DNA`
- `16 Financial Workspace Standard`
- `20 Migration Plan`
- `21 Implementation Contract`
- `22 Review Checklist`
- `25 Design Debt Register`
- repository `AGENTS.md`, `CURSOR_RULES.md`, and `README.md`
- approved design `docs/superpowers/specs/2026-08-02-canonical-closeout-reconciliation-design.md`

The local catalog was inspected before query or migration implementation. Confirmed foreign
keys and types:

- `final_punch_lists.project_id uuid` via
  `final_punch_lists_project_id_fkey` to `projects(id) ON DELETE CASCADE`;
- `final_punch_list_items.punch_list_id uuid` via
  `final_punch_list_items_punch_list_id_fkey` to
  `final_punch_lists(id) ON DELETE CASCADE`;
- `warranties.project_id uuid` via `warranties_project_id_fkey` to
  `projects(id) ON DELETE CASCADE`;
- `completion_certificates.project_id uuid` via
  `completion_certificates_project_id_fkey` to `projects(id) ON DELETE CASCADE`.

The verified parent date fields are `date`; warranty months are `integer`; text fields are
`text`; the confirmed canonical parent `created_at` fields are `timestamp without time zone`.
The RPC input contract is `(uuid, date, text, text, text, text, jsonb)` and returns one `uuid`.

## Implementation result

The forward migration is
`20260802110245_canonical_closeout_reconciliation.sql`. It performs exact catalog/data
preflights in one transaction, enforces non-null unique parent project IDs, adds required
non-negative deterministic item positions with unique parent/position, restricts status to
`pending | done` with a safe `pending` default, narrows table grants/RLS, creates the
security-invoker replacement RPC, and removes only exact empty historical legacy tables.

`public.replace_final_punch_list(uuid,date,text,text,text,text,jsonb)` has empty `search_path`,
fully qualified identifiers, five-second lock timeout, fifteen-second statement timeout,
bounded exact JSON input, a project-row concurrency lock, stable parent identity, atomic
child replacement, deterministic ordinality, a UUID-only result, and EXECUTE only for
`service_role`. `PUBLIC`, `anon`, and `authenticated` execution is revoked.

The Closeout mutation routes now enforce bounded input and same-origin metadata, validate
the exact payload, verify a strict user session, and prove route-local `projects.update`
before constructing a service-role client. Canonical reads/writes replace all active legacy
callers. Punch and completion PDF generation stops if the prerequisite save fails. Existing
PDF route layout, route names, deep links, idempotency/compensation logic, and
`finance.manage` final-invoice authorization remain unchanged.

`projects-db.ts` now deletes only canonical Closeout parents and relies on the verified
`final_punch_list_items` cascade; it contains no active `project_closeout_*` reference.

## Migration provenance and Project PDF disposition

The repository contains exactly the selected estimate-grants representation
`20260801065640_restore_estimate_grants_rls_parity.sql`; the sibling
`20260731080335_restore_estimate_grants_rls_parity.sql` is absent. Verified fingerprints:

- raw SHA-256: `d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349`;
- normalized SQL SHA-256:
  `474e4070650e5be94320811d0bf9bbb6f10f3cb7630d3630bba60d9254a41bbe`;
- SQL-token SHA-256:
  `1281a2721db891c0f05ae76b179c32ac98b342b5d710523137cbde9d33b595c8`.

The checker preserves quoted literal content while removing SQL comments/insignificant
whitespace and rejects semantic duplicates. This required gate currently finds an existing,
byte-identical historical pair outside the authorized manifest:

- `20260228000301_projects.sql`
- `202603081650_projects.sql`
- shared raw SHA-256:
  `05e7d47b7ca634c403ab9017a837b13f963ea2e8ebce53d5a3d7296bc030ee5d`

Therefore the migration-provenance gate correctly fails closed. No historical migration was
edited or removed, because that requires a separate Owner scope/provenance decision.

The unapplied `20260802055949_project_pdf_documents_expand.sql` was revised in place. It
retains Documents expansion/backfill, the private `attachments` bucket, permission behavior,
constraints, indexes, service PDF metadata behavior, and owner-only phase. Legacy Closeout
grants are removed and canonical read dependencies are granted narrowly. Its existing
rollback remains byte-identical and non-destructive.

## Local database verification

Clean replay passed through the three ordered reconciliation versions. The final local ledger
contains `20260801065640`, `20260802055949`, and `20260802110245`. Final exact local counts are:

| Relation group                 | Rows/relations |
| ------------------------------ | -------------: |
| `final_punch_lists`            |              0 |
| `final_punch_list_items`       |              0 |
| `warranties`                   |              0 |
| `completion_certificates`      |              0 |
| `project_closeout_*` relations |              0 |

A Production-equivalent local upgrade began at the verified zero-row canonical/no-legacy
baseline and applied only the new forward migration locally. It passed with the final
constraints, RPC, ACL, and zero legacy tables.

The canonical database checker passed after verifying:

- canonical constraints, column nullability/defaults, grants, RLS, RPC identity/config/ACL;
- CRUD, stable parent identity, ordered save/reload, identical retry, invalid status,
  negative position, duplicate parent, and exact cleanup;
- forced child-insert failure preserving all prior state;
- concurrent replacement producing one complete item set, never a mixture;
- `anon` and ordinary `authenticated` RPC denial;
- independent aborts for each nonempty legacy table, view, function, trigger, incoming FK,
  unexpected policy, publication membership, and unordered existing canonical item;
- A/B legacy caller behavior on E, A/B Closeout incompatibility on D, C rejection on E, and
  C success on D through the canonical CRUD/RPC checks. A and B remain prohibited Closeout
  rollback targets against D.

The guarded rollback transaction passed with its explicit confirmation token. It retains
all canonical schema/data, invariants, RPC/ACL, narrowed access, Documents/private Storage
contract, and legacy-table absence. The probe transaction was explicitly rolled back. It
does not delete business data or Storage objects and is not a down migration.

## Test and quality-gate record

- TDD red phase: intended missing canonical/provenance/security contracts failed before
  implementation; tests were not weakened.
- Focused Closeout/Project PDF unit contracts: 6 files, 91 tests passed.
- Full unit suite: 72 files, 465 tests passed after the final provenance contract assertion.
- TypeScript: passed.
- Prettier full repository check: passed.
- ESLint: passed with nine pre-existing `next/no-img-element` warnings in unrelated files.
- Canonical Docker checker: passed.
- Project PDF expansion checker: passed, including legacy upgrade, repeat execution,
  permission/policy/grant/bucket/constraint/index/count/hash checks.
- Rollback checker: passed; every probe transaction rolled back.
- Focused authenticated Owner Playwright Closeout flow: 1/1 passed in 20.5 seconds, covering
  punch ordered save/reload, warranty, completion, failed-save PDF abort, mobile overflow,
  and exact cleanup.
- `git diff --check`: passed before evidence creation and is rerun in the final gate.
- Secret scan: passed; no private key, live-provider key, Supabase secret-key, or JWT-shaped
  credential was found in the 25-file implementation diff.
- Artifact/manifest scan: passed; all 25 changed files are in the approved manifest and no
  `.next`, Playwright report/test-results, coverage, or log artifact is present.
- Production build: not executable in this environment. The sandboxed build reached
  `next/font` and failed only on `getaddrinfo ENOTFOUND fonts.googleapis.com`; the required
  network-enabled retry was denied by environment approval policy. No build defect was
  observed, but this gate is not green.
- Migration-order/provenance checker: blocked by the byte-identical historical Projects
  migrations above. This is an actual approved-spec stop condition.

No browser/database fixture remains. The final local query records zero rows in all four
canonical tables and zero legacy relations. Generated PWA changes from the blocked build
attempt were restored byte-for-byte; no build artifact is in the implementation diff.

## Scope and release state

The approved specification file and current `project-pdf-security.ts` remain byte-identical.
No PDF layout, financial formula, route/deep-link, permission key, Documents behavior,
Storage object, environment, alias, deployment, Production database, remote ledger, main
branch, or remote branch was changed. Nothing was committed, staged, pushed, deployed, or
applied remotely.

For Owner review, local Docker remains available and the worktree application is running at
`http://localhost:3000` from the approved local environment.

Owner action required: approve a separate migration-provenance scope/design for the existing
byte-identical `projects.sql` pair, then rerun the SQL-token provenance gate and the externally
networked production build in an approved environment. Until both gates are green, this work
must not be committed or promoted as release-ready.
