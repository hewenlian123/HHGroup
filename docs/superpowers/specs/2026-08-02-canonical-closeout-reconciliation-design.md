# Canonical Project Closeout Reconciliation

Date: 2026-08-02
Status: Owner-approved invariant direction; implementation design pending written-spec review
Environment: local repository and local Docker Supabase only
Base SHA: `b96ce282a3206e386e3260f9e32fbda4d64f4fcd`

## 1. Scope and authority

This patch reconciles the active Project Closeout and Project PDF paths with the
owner-selected canonical Production model:

- `final_punch_lists`
- `final_punch_list_items`
- `warranties`
- `completion_certificates`

The legacy `project_closeout_*` tables remain historical migration artifacts only.
The patch does not recreate, query, write, grant access to, or use them as an active
source of truth. A clean replay may contain the historical tables because the applied
historical migration cannot be rewritten; the new migration quarantines any such local
artifacts by retaining their existing no-access state and active code has no caller for
them.

Included:

- canonical schema invariants and atomic punch replacement;
- request-local Closeout authentication and `projects.update` authorization;
- canonical Closeout reads/writes and ordered punch PDF data;
- repository-side estimate-grants migration provenance reconciliation;
- a reviewed replacement of the unapplied Project PDF migration content;
- non-destructive rollback/service-restoration SQL;
- focused database, route, UI, PDF, migration, and browser tests.

Excluded:

- Production mutation, remote migration application, ledger repair, generic `db push`,
  deployment, alias/environment changes, strict-auth rollout, Neo v2 UI changes, and
  unrelated Project, Documents, or Finance refactors;
- financial formula or customer-facing PDF layout changes;
- deleting or renaming an applied historical migration.

## 2. Confirmed canonical Production schema

Read-only Production inspection confirmed zero rows in all four canonical tables.

### `final_punch_lists`

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid null`
- `inspection_date date null`
- `inspector text null`
- `notes text null`
- `contractor_signature text null`
- `client_signature text null`
- `created_at timestamp without time zone null default now()`
- Foreign key: `final_punch_lists_project_id_fkey`, referencing `projects(id)` with
  `ON DELETE CASCADE`

### `final_punch_list_items`

- `id uuid primary key default gen_random_uuid()`
- `punch_list_id uuid null`
- `item text null`
- `status text null default 'pending'`
- Foreign key: `final_punch_list_items_punch_list_id_fkey`, referencing
  `final_punch_lists(id)` with `ON DELETE CASCADE`

### `warranties`

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid null`
- `start_date date null`
- `period_months integer null`
- `notes text null`
- `created_at timestamp without time zone null default now()`
- Foreign key: `warranties_project_id_fkey`, referencing `projects(id)` with
  `ON DELETE CASCADE`

### `completion_certificates`

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid null`
- `completion_date date null`
- `contractor_name text null`
- `client_name text null`
- `contractor_signature text null`
- `client_signature text null`
- `created_at timestamp without time zone null default now()`
- Foreign key: `completion_certificates_project_id_fkey`, referencing `projects(id)` with
  `ON DELETE CASCADE`

All four tables have RLS enabled. Production currently has broad table privileges but only
authenticated RLS policies. The reconciliation narrows privileges and does not add anon
policies.

## 3. Canonical invariants

The new CLI-generated forward migration
`YYYYMMDDHHMMSS_canonical_closeout_invariants.sql` will run after the revised Project PDF
migration and will be expand-only.

It will fail before schema mutation when:

- any canonical table, required column, verified type, or named foreign key is missing or
  incompatible;
- any parent table has duplicate non-null `project_id` values;
- an existing item has a status other than `pending` or `done`;
- `position` is absent while item rows already exist, because historical order cannot be
  inferred safely;
- an existing `position` value is null, negative, or duplicated within one punch parent;
- a conflicting index or constraint with an expected canonical name has incompatible
  semantics.

After preflight it will:

- add unique indexes on `final_punch_lists(project_id)`, `warranties(project_id)`, and
  `completion_certificates(project_id)`; PostgreSQL uniqueness still permits unrelated
  null values, while all application writes require a verified project UUID;
- add `final_punch_list_items.position integer NOT NULL` without an implicit ordering
  default;
- add and validate `position >= 0`;
- add a unique index on `(punch_list_id, position)`;
- retain the existing `status DEFAULT 'pending'` and add a validated check restricting
  status to `pending` or `done`;
- add supporting indexes for the verified foreign-key/filter paths where absent;
- narrow canonical table privileges to authenticated read and the exact service-role
  CRUD needed after route authorization;
- revoke all canonical Closeout table privileges from `anon`;
- replace broad authenticated policies with `projects.update`-gated read policies; normal
  authenticated writes remain server-mediated rather than directly granted;
- notify PostgREST after the schema contract is complete.

The migration never drops a table, column, row, Storage object, or data-bearing index.

## 4. Atomic punch RPC

The migration creates a public Data API function solely so the server can call it through
Supabase RPC. It is `SECURITY INVOKER`, uses an empty controlled `search_path`, and is not
security-definer.

Input contract:

- `p_project_id uuid`
- `p_inspection_date date`
- `p_inspector text`
- `p_notes text`
- `p_contractor_signature text`
- `p_client_signature text`
- `p_items jsonb`, an array of objects containing `item` text and status `pending|done`

Output: the single canonical `final_punch_lists.id` UUID only.

Execution behavior:

1. Validate the JSON shape and every status before modifying rows.
2. Lock the verified `projects` row with `FOR UPDATE`, serializing concurrent replacement
   for the same project even when no punch parent exists yet.
3. Insert or update the parent through the unique `project_id` invariant. On update, retain
   the existing parent UUID.
4. Replace children inside the same database transaction.
5. Derive zero-based positions from JSON array ordinality.
6. Let any exception roll the entire function call back, preserving the prior parent and
   child set.

Function `EXECUTE` is revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only
to `service_role`. Direct canonical write privileges are likewise unavailable to anon and
ordinary authenticated callers.

## 5. Application access design

### Reads

`project-closeout-db.ts` stops creating a default anon client. Every canonical read accepts
an explicit client and maps the normalized parent/child model back to the existing
`CloseoutPunch`, `CloseoutWarranty`, and `CloseoutCompletion` UI shapes.

Punch children are always selected by `position ASC, id ASC`. The UUID tie-breaker is
defensive; the unique position invariant makes ties invalid.

The Project server page uses a request-scoped Supabase session client. It verifies the user
and `projects.update` before loading Closeout data. The Closeout tab API performs the same
strict request authentication and permission check.

### Writes

The three Closeout POST routes share a server-only authorization boundary:

1. validate same-origin mutation metadata;
2. validate project UUID and bounded JSON body;
3. verify a bearer or cookie Supabase session without compatibility fallback;
4. call user-scoped `has_perm('projects.update')`;
5. only then construct the service-role client and verify that the project exists;
6. execute the canonical write.

Punch writes call the atomic RPC. Warranty and completion writes use their unique
`project_id` indexes for deterministic upsert. Backend schema and database details are
never returned to the browser.

Anonymous compatibility-mode requests receive 401, denied roles receive 403, cross-origin
requests receive 403, malformed input receives 400, and missing projects receive 404 before
any privileged mutation.

## 6. UI and PDF compatibility

The Closeout component layout, labels, deep links, financial values, and customer-facing
document layouts remain unchanged.

The save/reload contract remains:

- one punch parent per project;
- checklist array restored in explicit position order;
- one warranty per project;
- one completion certificate per project.

Generate Punch PDF saves the current ordered form first and aborts PDF generation if that
save fails. The PDF route then reads the same ordered canonical rows through the already
authorized service-role client. Completion PDF reads `completion_certificates`.

Final Invoice retains `finance.manage`; Completion, Punch, and Materials PDF routes retain
`projects.update`. Existing same-origin validation, strict request auth, idempotent object
identity, concurrency behavior, metadata compensation, generic errors, and PDF layout are
unchanged.

## 7. Migration-history reconciliation

The patch restores
`20260801065640_restore_estimate_grants_rls_parity.sql` with the exact SQL proven in Git as
`20260731080335_restore_estimate_grants_rls_parity.sql` from commit
`077a45ae1bcc50c2846944ce4882a125b082e5b8`.

The restored file must retain the verified trimmed MD5
`3894b79f755a8d5361cd2ec58e825908`. The branch does not also contain the earlier-timestamp
copy. A provenance contract test fails if both filenames exist or if another migration has
the same normalized SQL fingerprint. Production already records `20260801065640`, so a
future controlled migration application treats it as applied rather than pending.

The unapplied `20260802055949_project_pdf_documents_expand.sql` is revised in a new reviewed
patch commit. Git retains the old content at the base SHA. This is safer than adding a later
superseding migration because the existing file would otherwise fail first while granting
on missing legacy tables.

The revised file preserves its document expansion, data backfill, private bucket,
permission-key, and compatibility behavior. Its service-role read dependency list replaces
legacy Closeout tables with `final_punch_lists`, `final_punch_list_items`, and
`completion_certificates`.

## 8. Rollback design

The new invariant migration receives a same-timestamp manual rollback file with an explicit
session confirmation token. It is a service-restoration check, not a down migration.

Rollback retains:

- canonical rows and all four tables;
- `position`, uniqueness, status checks, foreign keys, and indexes;
- the atomic RPC and minimal function privileges;
- narrowed anon/authenticated/service-role access;
- the Project PDF document schema and private bucket.

It validates the compatible state and reasserts only the narrow privileges required by the
previous and patched server paths. It does not delete rows or objects, drop data-bearing
schema, recreate legacy tables, or restore anonymous access.

## 9. Test-first implementation plan

Before each implementation slice, a focused test will be added and observed failing for
the expected missing behavior.

Database and migration tests cover:

- exact Production FK/type preflight;
- duplicate parent rejection and one-parent preservation;
- required, non-negative, unique positions;
- `pending|done` status enforcement and default preservation;
- RPC privilege isolation;
- transaction rollback after a failed child insert;
- concurrent replacement without mixed item sets;
- exact estimate migration hash, timestamp provenance, and no duplicate execution;
- revised Project PDF ordering, no active legacy grants, clean replay, repeated execution,
  Production-equivalent upgrade, and non-destructive rollback.

Application tests cover:

- canonical empty/read/save/reload behavior;
- route-local 401/403/400/404 and Owner success before privileged calls;
- ordered punch PDF and canonical completion PDF reads;
- unchanged final invoice/material permission gates;
- Project PDF idempotency, concurrency, compensation, and generic errors;
- unchanged financial formulas and PDF text/layout contracts.

Playwright covers an authenticated Owner Closeout save/reload/PDF flow at desktop and mobile
viewports, with exact test data and object cleanup.

Final gates include clean Docker replay, Production-equivalent upgrade, migration order,
Prettier, lint, TypeScript, production build, full unit tests, focused suites, Playwright,
secret/artifact scans, `git diff --check`, and final fixture counts.

## 10. Risks and release gates

- If canonical Production rows appear before rollout, preflight is repeated. Unexpected
  ordering or duplicates block application rather than inventing semantics.
- Clean historical replay can retain inaccessible legacy tables from an applied historical
  migration. They are not an active source: no application caller, table grant, PDF grant,
  or RPC uses them. Deleting them is outside this non-destructive phase.
- The broad existing canonical grants are narrowed only by the reviewed forward migration;
  application code must not be released before that migration is authorized and applied.
- The provenance contract must be resolved during any future merge that introduces the
  sibling `20260731080335` file; CI fails closed rather than replaying equivalent SQL.

Release remains:

local audit -> isolated worktree -> local Docker -> owner review -> clean patch commit ->
immutable Preview -> separate Production authorization -> Production smoke -> rollback
retention.

This design authorizes no Production, deployment, alias, environment, ledger, database, or
Storage change.
