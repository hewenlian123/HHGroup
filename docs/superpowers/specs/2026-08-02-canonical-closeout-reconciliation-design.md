# Canonical Project Closeout Reconciliation

Date: 2026-08-02

Status: Revised after independent owner review; implementation remains unauthorized

Environment: local repository and local Docker Supabase only

Base SHA: `b96ce282a3206e386e3260f9e32fbda4d64f4fcd`

Previous specification SHA: `e183e8f1bbc8fa9f8168cb1123bd27a7c62533d9`

## 1. Scope, authority, and final-state contract

The only canonical Project Closeout model is:

- `public.final_punch_lists`
- `public.final_punch_list_items`
- `public.warranties`
- `public.completion_certificates`

The following legacy tables are not canonical and must not exist in the final migrated
schema:

- `public.project_closeout_punch`
- `public.project_closeout_completion`
- `public.project_closeout_warranty`

Read-only Production evidence established that Production already has none of the three
legacy tables and that all four canonical tables contain zero rows. Immutable historical
migrations may temporarily create the legacy tables during a clean repository replay. A
new forward-only reconciliation migration must remove them before the replay or upgrade is
considered valid. “Quarantined but physically retained” is not an acceptable final state.

Included scope:

- canonical Closeout constraints, indexes, RLS, privileges, and the atomic punch RPC;
- route-local Closeout authentication and `projects.update` authorization;
- canonical Closeout reads/writes and stable punch ordering in the UI and PDF;
- deterministic estimate-grants migration provenance reconciliation;
- revision of the unapplied Project PDF migration while retaining its Documents and
  private-bucket expansion;
- non-destructive application-rollback support and explicit limitations;
- focused migration, database, route, UI, PDF, compatibility, and browser tests.

Excluded scope:

- Production or remote access/mutation, SQL application, generic `db push`, remote ledger
  repair, deployment, push, aliases, environments, or Storage mutation;
- recreation, data migration, or compatibility writes for `project_closeout_*`;
- unrelated Project, Documents, Finance, Auth, PDF-layout, or Neo v2 changes;
- financial formula, amount, status, or source-of-truth changes;
- editing or amending any applied historical migration.

## 2. Confirmed canonical schema and required provenance checks

Implementation must re-run the approved `information_schema.columns`, `pg_constraint`,
`pg_index`, `pg_policy`, privilege, and function-signature preflights against local clean
replay and a Production-equivalent local upgrade fixture. It must not infer names from the
application.

Confirmed parent foreign keys are:

- `final_punch_lists_project_id_fkey`:
  `final_punch_lists(project_id) -> projects(id) ON DELETE CASCADE`
- `warranties_project_id_fkey`:
  `warranties(project_id) -> projects(id) ON DELETE CASCADE`
- `completion_certificates_project_id_fkey`:
  `completion_certificates(project_id) -> projects(id) ON DELETE CASCADE`

The confirmed child foreign key is:

- `final_punch_list_items_punch_list_id_fkey`:
  `final_punch_list_items(punch_list_id) -> final_punch_lists(id) ON DELETE CASCADE`

The confirmed pre-reconciliation columns are:

- `final_punch_lists`: `id`, `project_id`, `inspection_date`, `inspector`, `notes`,
  `contractor_signature`, `client_signature`, and `created_at`;
- `final_punch_list_items`: `id`, `punch_list_id`, `item`, and `status`;
- `warranties`: `id`, `project_id`, `start_date`, `period_months`, `notes`, and
  `created_at`;
- `completion_certificates`: `id`, `project_id`, `completion_date`, `contractor_name`,
  `client_name`, `contractor_signature`, `client_signature`, and `created_at`.

The verified data types are `uuid` for IDs, `date` for the three date fields, `integer`
for warranty months, `text` for textual fields, and `timestamp without time zone` for the
three confirmed parent `created_at` fields.

Any missing column, type mismatch, foreign-key mismatch, unexpected overload, incompatible
constraint with an expected name, or schema difference that affects a planned query blocks
implementation. No migration or application query is written until the local verification
output is retained in the evidence file.

## 3. Exact final nullability and canonical invariants

The final canonical schema must express these invariants, not merely rely on application
validation.

| Relation                  | Column(s)       | Final contract                                              |
| ------------------------- | --------------- | ----------------------------------------------------------- |
| `final_punch_lists`       | `project_id`    | `uuid NOT NULL`, unique, verified FK to `projects(id)`      |
| `warranties`              | `project_id`    | `uuid NOT NULL`, unique, verified FK to `projects(id)`      |
| `completion_certificates` | `project_id`    | `uuid NOT NULL`, unique, verified FK to `projects(id)`      |
| `final_punch_list_items`  | `punch_list_id` | `uuid NOT NULL`, verified cascade FK                        |
| `final_punch_list_items`  | `position`      | `integer NOT NULL`, `position >= 0`, unique with parent     |
| `final_punch_list_items`  | `status`        | `text NOT NULL DEFAULT 'pending'`, only `pending` or `done` |

The narrow ordering rule is unique `(punch_list_id, position)`. Positions are zero-based,
contiguous, and derived from validated request-array ordinality. Reads use `position ASC,
id ASC`; `id` is defensive only because a valid parent cannot contain a position tie.

The existing status default is retained as `DEFAULT 'pending'::text`. It is a fail-safe for
an explicitly permitted server-side insert that omits status; the RPC still validates and
writes every item status. `pending` is the neutral not-completed state and does not imply
that work was performed. PostgreSQL `CHECK` constraints evaluate `NULL` as unknown and do
not reject it, so `status`, `position`, `punch_list_id`, and every parent `project_id` also
require explicit `NOT NULL` constraints.

Before changing schema, the forward migration must abort on:

- any null parent `project_id`;
- any duplicate parent `project_id`;
- any null child `punch_list_id`, `position`, or `status`;
- any orphan child or incompatible named foreign key;
- any negative position or duplicate `(punch_list_id, position)`;
- any status other than exactly `pending` or `done`;
- existing child rows when `position` is absent, because prior ordering cannot be inferred;
- any conflicting index/default/constraint with the canonical name but different meaning.

No null, duplicate, invalid status, or unknown order is automatically repaired. A
deterministic backfill is permitted only under a separate owner-approved plan with retained
evidence proving each value. The authorized zero-row Production baseline requires no
backfill.

Supporting indexes must cover every verified foreign key and common filter path. The three
unique parent indexes cover parent project lookup; the unique child `(punch_list_id,
position)` index covers child FK lookup and ordered load. The migration must inspect
existing valid indexes before adding a semantic duplicate.

## 4. Fail-closed legacy-table removal

The CLI-generated forward migration with suffix
`_canonical_closeout_reconciliation.sql` runs after the revised Project PDF expansion and
contains the invariant/RPC work and legacy removal in one reviewed transaction. Its numeric
prefix is created by Supabase CLI at implementation time and must not be hand-invented.

### Phase A: immutable preflight before mutation

For each legacy name, the migration accepts only a safely absent table or an ordinary
`public` table matching the exact historical schema. If present, it must prove:

1. the row count is exactly zero while protected by a lock that prevents a concurrent
   insert before drop;
2. no view or materialized-view rewrite, function/procedure, external trigger, incoming
   foreign key, publication membership, extension membership, or other external
   `pg_depend` object references it;
3. the only table-owned constraints/indexes/FKs are the reviewed historical definitions;
4. the only policies, if any, are the exact historical self-owned policy allowlist from
   `202603270000_project_closeout.sql`; any renamed, extra, or definition-mismatched policy
   aborts;
5. no application, checker, test expectation, PDF grant, RPC, or executable SQL outside
   immutable migration history references a legacy name;
6. all four canonical tables, confirmed foreign keys, required columns, final constraints,
   supporting indexes, RLS policies, privileges, and the replacement RPC are already valid
   or will become valid earlier in the same transaction.

The application-caller gate is enforced by a repository contract scan and release gate;
database catalogs cannot prove deployed caller absence. Immutable historical migration and
rollback text is allowlisted as provenance only. Any active source reference blocks the
migration artifact from being approved.

### Phase B: atomic policy cleanup and drop

Only after Phase A succeeds may the same transaction revoke any historical table grants,
drop the exact allowlisted self-owned historical policies, and immediately re-query the
catalogs to prove that no policy or external dependency remains. It then drops only the
three verified zero-row legacy tables. Table-owned primary keys, indexes, and outbound FKs
are removed with their empty owning table. A missing table remains a safe no-op only after
its namespace/type identity is checked; an object of another kind with the same name
aborts.

Canonical constraints, RLS, privileges, RPC creation, and legacy removal either commit
together or roll back together. If a table contains a row, a catalog check is ambiguous,
an unexpected dependency exists, a lock times out, or canonical readiness fails, the whole
migration aborts. It never copies, deletes, merges, parses, or reinterprets legacy business
data. Such evidence requires a separate owner-approved reconciliation design.

Final verification requires `to_regclass(...) IS NULL` for all three legacy names and a
repository scan proving no active caller. Rollback must never recreate them.

## 5. Atomic punch replacement RPC

The single function is `public.replace_final_punch_list`. It is exposed in `public` only
for server-side PostgREST RPC transport and has this exact argument contract:

- `p_project_id uuid` (required);
- `p_inspection_date date` (nullable);
- `p_inspector text` (nullable);
- `p_notes text` (nullable);
- `p_contractor_signature text` (nullable);
- `p_client_signature text` (nullable);
- `p_items jsonb` (required JSON array).

It returns only the preserved or created `final_punch_lists.id` UUID. No child IDs, row
payloads, SQLSTATE, constraint names, query text, hints, details, or stack information are
returned.

### Bounds and validation

Both route validation and the function enforce the applicable bounds so a direct
service-role call cannot bypass them:

| Input                                                     | Bound                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| raw request body                                          | at most 65,536 bytes; reject before `JSON.parse` when larger |
| project ID                                                | canonical UUID text at route; non-null `uuid` in RPC         |
| item count                                                | 0 through 200                                                |
| item `item` text (the current UI title/description field) | string, 0 through 1,000 Unicode characters                   |
| inspector and contractor/client names                     | null or 0 through 300 Unicode characters                     |
| notes                                                     | null or 0 through 4,000 Unicode characters                   |
| signatures                                                | null or 0 through 2,000 Unicode characters                   |
| status                                                    | exactly `pending` or `done`                                  |
| derived position                                          | integer 0 through 199                                        |
| dates                                                     | null or strict `YYYY-MM-DD` representing a real date         |
| warranty period                                           | integer 1 through 1,200 months                               |

The punch body may contain exactly `inspection_date`, `inspector`, `notes`,
`contractor_signature`, `client_signature`, and `items`. Each item may contain exactly
`item` and `status`. A separate `title` or `description` property is not part of the current
UI/database contract and is rejected as unknown rather than silently mapped. Warranty and
completion bodies receive the same byte, date, name, note, signature, UUID, and
unknown-field rules relevant to their existing fields. Numbers are not coerced from
strings; strings are not silently trimmed into a different business value.

`p_items` must be an array of JSON objects with the exact key set, JSON-string `item`, and
explicit valid status. The function rejects SQL `NULL`, JSON `null`, scalar/object input,
unknown keys, excess keys, invalid UTF-8, out-of-range lengths/counts, and a project that
does not exist before any parent or child mutation.

### SQL security and transaction semantics

The function is `SECURITY INVOKER`, has `SET search_path = ''`, and schema-qualifies every
table, function, type, operator-sensitive expression, and catalog reference. Migration
tests inspect `pg_proc.prosecdef = false`, `proconfig`, identity arguments, return type, and
function ACL; no overload is permitted.

The migration explicitly revokes function execution from `PUBLIC`, `anon`, and
`authenticated`, then grants `EXECUTE` only to `service_role`. Table grants do not imply RPC
execution and RPC execution does not broaden table grants.

One RPC call replaces one project's punch state in the one PostgreSQL transaction already
provided by the function statement; the function contains no transaction control. After
all input validation, it sets a 5-second `lock_timeout` and 15-second `statement_timeout`,
locks `public.projects` for the one project with `FOR UPDATE`, then performs a conflict-safe
parent insert/update using unique `project_id`. Existing parent identity is preserved. It
deletes and inserts child rows only after the project/parent lock is held and derives
positions from `jsonb_array_elements(... WITH ORDINALITY) - 1` in one deterministic set.
Every path acquires locks in project-then-parent-then-items order.

Any validation, constraint, insert, timeout, serialization, or other exception rolls back
the complete call, leaving the prior parent and item set unchanged. Concurrent calls for
the same project serialize on the project row; each committed state contains one complete
request set, never a mixture. Different projects do not share this row lock.

The route maps a recognized lock/serialization conflict to HTTP 409 with `Closeout update
in progress; retry.` It maps validation to 400, missing project to 404, and unexpected
database failure to a generic 500. It logs only server-sanitized context and never returns
raw database errors. The server does not auto-retry an ambiguous mutation. A client may
retry the same validated payload after 409; replacement is state-idempotent (same parent
identity and final ordered values), although regenerated child UUIDs are internal and are
not an API idempotency promise.

## 6. Application authorization and source-of-truth flow

Every Closeout read or mutation receives an explicit request-scoped Supabase client;
`project-closeout-db.ts` no longer creates a default anon client. Active code never queries
or writes `project_closeout_*`.

Each POST route performs this order:

1. enforce body byte limit and same-origin mutation metadata;
2. validate the route project UUID and exact bounded body with unknown fields rejected;
3. verify the bearer/cookie Supabase session without a compatibility fallback;
4. call the user-scoped permission check for `projects.update`;
5. return 401/403/400 as appropriate before creating a service-role client;
6. create the server-only service client, verify the project, and invoke the canonical
   operation;
7. return the minimum existing `{ ok: true }` browser result or a generic failure.

No privileged database query, RPC, canonical table write, Documents write, or Storage
operation occurs before authorization. Punch uses only
`public.replace_final_punch_list`; warranty and completion use deterministic canonical
upserts on their unique project IDs. Service-role credentials remain server-only.

Reads map canonical parent/child rows back to the existing `CloseoutPunch`,
`CloseoutWarranty`, and `CloseoutCompletion` shapes. Punch items always reload by explicit
position. The Project page and tab-data route require a verified session and
`projects.update` before Closeout loading.

`src/lib/projects-db.ts` currently contains three force-delete entries for
`project_closeout_punch`, `project_closeout_warranty`, and
`project_closeout_completion`. Implementation removes every legacy entry. The canonical
replacement deletes only the three parent rows by verified `project_id`; the
`final_punch_list_items` FK cascade removes children. Normal project deletion already uses
the same cascade relationships. No extra source, compatibility copy, or direct child
delete is introduced.

## 7. RLS, grants, and permission performance

RLS remains enabled on all four canonical tables. Final grants are:

- `anon`: no table privilege and no RPC execution;
- `authenticated`: `SELECT` only, filtered by a read policy requiring the cached predicate
  `(select public.has_perm('projects.update'))`; no direct insert, update, delete, truncate,
  references, trigger, or RPC execution;
- `service_role`: only `SELECT` plus the insert/update/delete needed by the server Closeout
  paths; no `TRUNCATE`, no ownership change, and RPC `EXECUTE` as a separate explicit grant.

The policy calls the permission predicate through a scalar `SELECT` so PostgreSQL can
evaluate the stable request result once rather than once per row. Implementation must
verify the exact `public.has_perm(text)` signature, volatility/security/search-path
configuration, permission source table and keys, and an index/unique constraint supporting
the permission lookup (including role and permission columns used by the function). If
that lookup is not index-supported or the function is incompatible, migration preflight
blocks; the Closeout patch does not silently redefine global Auth behavior.

Project FK and punch parent/order indexes are verified as described in section 3. Policy
tests use `anon`, an authenticated user without permission, an authenticated Owner, and
`service_role` to prove both access and denial. No anon policy or broad authenticated CRUD
is restored.

## 8. UI, workflow, and Project PDF compatibility

The Project Closeout layout, field labels, deep links, tab behavior, save flow, defaults,
desktop/mobile interaction, financial values, and customer-facing PDF layout/content remain
unchanged.

Generate Punch PDF first awaits the canonical save and aborts PDF generation when save
fails. The punch handler then reads the same ordered canonical parent/items through the
already authorized service client. Completion PDF reads
`public.completion_certificates`. Punch UI and PDF use the identical order contract.

Final Invoice retains `finance.manage`; Completion, Punch, and Materials PDF routes retain
`projects.update`. Existing Project PDF same-origin checks, strict session verification,
one privileged boundary after authorization, deterministic object key, idempotency,
concurrency handling, metadata compensation, private Storage behavior, generic errors, and
rendered layout remain intact. The revised `20260802055949` migration retains the Documents
schema expansion, data backfill, private `attachments` bucket, permission key behavior, and
owner-only phase; it removes all grants or assumptions concerning nonexistent legacy
Closeout tables and grants only the verified canonical reads needed by PDF routes.

## 9. Application/database compatibility matrix

Application identities:

- **A** — previous Production application
  `d50aa571677b1bd5f3ad844b7c33663f889f21c6` (deployment identity must be reconfirmed
  from release evidence before rollout);
- **B** — Project PDF patch `b96ce282a3206e386e3260f9e32fbda4d64f4fcd`;
- **C** — future canonical Closeout reconciliation SHA.

Database identities:

- **D** — final canonical database: four canonical tables with section 3 constraints,
  replacement RPC, revised Documents expansion, and zero legacy tables;
- **E** — legacy-compatible clean-replay state immediately before the new canonical
  migration: historical legacy tables plus the pre-constraint canonical tables and revised
  Documents expansion;
- **P** — current Production-equivalent baseline: canonical tables present and empty,
  legacy tables absent, but the new constraints/RPC not yet applied.

These are required release-test classifications, not claims of tests already run:

| Application            | E: legacy-compatible DB                                                                          | P: current Production-equivalent DB                                                                      | D: canonical DB                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A: previous Production | Partially functional: legacy Closeout works, but it lacks the Project PDF security patch         | Partially functional: non-Closeout pages may work; Closeout fails because A queries absent legacy tables | Prohibited rollback target: non-Closeout pages may work; Closeout remains incompatible because D does not recreate legacy tables |
| B: PDF patch           | Fully functional only as the tested legacy/PDF baseline, never as the final model                | Partially functional: PDF security may work, but legacy Closeout callers still fail                      | Prohibited rollback target: PDF protections remain, but legacy Closeout callers cannot use canonical rows                        |
| C: canonical patch     | Incompatible: canonical constraints/RPC are absent; routes must fail generically before mutation | Controlled failure: pre-deploy health gate blocks C until the canonical migration is valid               | Fully functional target                                                                                                          |

Retaining canonical expansion cannot make A or B Closeout paths functional because both
still query absent legacy tables. Application rollback to A or B is therefore not complete
Closeout service restoration. It may preserve non-Closeout pages while Closeout is placed
in an explicit unavailable state; it must not be represented as a full rollback.

The executable compatibility suite must prove every A/B/C × D/E combination and the P
upgrade gate using immutable app fixtures or checked-out build artifacts. Any observed
result less safe than the table blocks release and updates this design through owner
review; compatibility is never inferred from canonical table retention.

## 10. Deterministic migration-provenance merge contract

Git provenance contains
`20260731080335_restore_estimate_grants_rls_parity.sql` at
`077a45ae1bcc50c2846944ce4882a125b082e5b8`. Production records the equivalent migration as
version `20260801065640`.

The verified source bytes have SHA-256
`d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349`. Normalizing CRLF to
LF, removing trailing horizontal whitespace per line, and removing terminal whitespace
produces SHA-256
`474e4070650e5be94320811d0bf9bbb6f10f3cb7630d3630bba60d9254a41bbe`. The historical
trimmed MD5 `3894b79f755a8d5361cd2ec58e825908` remains secondary evidence only.

The exact final repository outcome is one file:

`supabase/migrations/20260801065640_restore_estimate_grants_rls_parity.sql`

It is restored to the reconciliation branch with the proven SQL. The sibling
`20260731080335` file is excluded from the final merge tree; it is not renamed after being
applied and Production ledger history is not rewritten. Before integration, the merge
operator must:

1. fetch both source branches without modifying them;
2. prove the two byte/normalized fingerprints and a SQL-aware statement-token fingerprint
   are equivalent while preserving string/dollar-quoted literal content;
3. inspect every target environment ledger for both versions;
4. block if `20260731080335` is recorded applied anywhere being promoted, because exclusion
   would then require a separate owner-approved ledger/provenance plan;
5. merge the SQL content once under `20260801065640`, exclude the unapplied sibling in the
   same reviewed merge resolution, and run clean-order/upgrade tests before commit;
6. verify the ordered migration set contains exactly one semantic representation.

The provenance checker must fail CI if both filenames exist, if the production-timestamped
file hash changes, if either version appears with equivalent normalized/tokenized SQL, or
if any two migration files contain the same ordered SQL statement fingerprint. It must be
SQL-aware enough not to rewrite literals while removing comments/insignificant whitespace.
No future migration set may replay both artifacts. No manual Production ledger rewrite is
authorized by this design.

## 11. Migration order and Project PDF migration disposition

The deterministic repository order is:

1. canonical provenance file
   `20260801065640_restore_estimate_grants_rls_parity.sql` (already applied in Production,
   replayed once locally);
2. revised, still-unapplied
   `20260802055949_project_pdf_documents_expand.sql`;
3. CLI-generated `<timestamp>_canonical_closeout_reconciliation.sql`;
4. matching manual rollback artifact outside the forward migration directory.

Because `20260802055949` is unapplied in Production, its content is revised in a new commit
rather than followed by a migration that could never run after its invalid legacy grants.
The revision preserves Documents columns/backfill, private attachments bucket, service PDF
metadata behavior, and the owner-only permission phase. It removes grants on all three
legacy tables and uses the canonical PDF read dependencies only. Its rollback remains
non-destructive and does not drop Documents columns, delete Storage objects, or recreate
legacy tables.

## 12. Exact implementation file manifest

No implementation is authorized by this document. When separately authorized, changes are
limited to the following manifest. The only intentionally variable filename component is
the Supabase-CLI timestamp.

### Existing application files to modify

- `src/lib/project-closeout-db.ts`
- `src/lib/projects-db.ts` (remove all three legacy force-delete entries and use canonical
  parent/cascade behavior)
- `src/lib/data/index.ts`
- `src/app/api/projects/[id]/closeout/punch/route.ts`
- `src/app/api/projects/[id]/closeout/warranty/route.ts`
- `src/app/api/projects/[id]/closeout/completion/route.ts`
- `src/app/api/projects/[id]/tab/route.ts`
- `src/app/projects/[id]/page.tsx`
- `src/app/projects/[id]/project-closeout-tab.tsx`
- `src/app/api/projects/[id]/closeout/generate-punch-pdf/route.ts`
- `src/app/api/projects/[id]/closeout/generate-completion-pdf/route.ts`

### New or conditionally modified security files

- `src/lib/project-closeout-security.ts` (new, mutation-only auth/permission/input boundary)
- `src/lib/project-pdf-security.ts` may change only if a shared, behavior-preserving helper
  is required; otherwise it is inspection/test-only and must remain byte-identical.

### Migration, rollback, checker, and evidence files

- `supabase/migrations/20260801065640_restore_estimate_grants_rls_parity.sql` (restored)
- `supabase/migrations/20260802055949_project_pdf_documents_expand.sql` (revised)
- `supabase/migrations/<CLI-generated timestamp>_canonical_closeout_reconciliation.sql`
- `supabase/rollbacks/20260802055949_project_pdf_documents_expand.rollback.sql`
- `supabase/rollbacks/<same CLI timestamp>_canonical_closeout_reconciliation.rollback.sql`
- `scripts/check-project-pdf-expand-migration.mjs`
- `scripts/check-migration-order.mjs`
- `scripts/check-canonical-closeout-reconciliation.mjs` (new provenance/schema contract
  checker)
- `docs/superpowers/specs/2026-08-02-canonical-closeout-reconciliation-design.md`
- `docs/superpowers/evidence/2026-08-02-canonical-closeout-reconciliation.md` (new)

### Contract, route, database, and browser tests

- `src/__tests__/project-pdf-expand-migration-contract.test.ts`
- `src/__tests__/api/project-pdf-security-routes.test.ts`
- `src/__tests__/api/project-closeout-security-routes.test.ts` (new)
- `src/__tests__/project-closeout-canonical-contract.test.ts` (new)
- `src/__tests__/migration-provenance-contract.test.ts` (new)
- `src/__tests__/lib/project-closeout-db.test.ts` (new)
- `tests/project-closeout-canonical-flow.spec.ts` (new)

The Project PDF route helpers and final-invoice/material routes not listed for modification
are regression-test scope only. Immutable historical migrations may retain legacy text as
provenance. No other active source, migration expectation, test fixture, or checker may
reference legacy tables. No file outside this manifest may change without a new scope
decision.

## 13. Mandatory test and release specification

Tests are written before each implementation slice and observed failing for the intended
missing contract before the implementation is added.

### Migration and schema tests

- clean replay may create the legacy tables transiently but final schema contains exactly
  zero `project_closeout_*` tables;
- Production-equivalent upgrade begins with four empty canonical tables/no legacy tables
  and ends at D;
- each nonempty legacy table independently causes a transactional fail-closed abort with
  its row preserved;
- each unexpected view, function, trigger, incoming FK, policy, publication, and catalog
  dependency independently aborts; exact known historical self-policies are removed only
  in the successful clean-replay path;
- canonical table/FK/type mismatch and an active repository caller abort approval;
- null parent project IDs, duplicate parents, null/orphan punch parent IDs, null/negative/
  duplicate positions, null/invalid statuses, and incompatible existing constraints are
  rejected without mutation;
- final `NOT NULL`, unique, check, default, FK, and supporting-index definitions match
  section 3 exactly;
- canonical CRUD preserves one record per project and punch item order through save/reload;
- provenance raw/normalized/token fingerprints pass for the one production-timestamped
  file and fail for either sibling filename or a semantic duplicate;
- revised Project PDF migration retains Documents/private-bucket expansion, has no legacy
  grant, replays cleanly, and upgrades P;
- rollback retains business rows/schema and never recreates a legacy table;
- every fixture row, object, policy, publication membership, function, and temporary
  dependency is precisely removed.

### RPC and security tests

- function identity, invoker mode, empty search path, full qualification, timeouts, return
  type, no overload, and ACL match section 5;
- body bytes, item count, text/note/name/signature lengths, dates, UUIDs, warranty range,
  statuses, positions, JSON shapes, and unknown fields reject at the route and applicable
  RPC boundary;
- `PUBLIC`, `anon`, and ordinary `authenticated` execution is denied; authorized
  route-local Owner flow succeeds through `service_role` only after permission;
- anonymous returns 401 and unauthorized role returns 403 before any service client, RPC,
  table, Documents, or Storage access;
- empty-search-path execution succeeds;
- failed child insertion and every forced mid-function exception preserve the complete
  prior punch state;
- concurrent replacements never mix item sets, preserve one parent identity, enforce
  deterministic order, and produce the specified success/409 behavior;
- repeated identical payload reaches the same final ordered values without duplicate
  parents/items;
- RLS/grant matrices prove no anon access, no authenticated CRUD, cached permission
  predicate behavior, indexed permission lookup, narrow service access, and separate RPC
  privilege.

### Application, compatibility, PDF, and browser tests

- canonical empty/read/save/reload flows retain existing UI shapes and one-record semantics;
- Project Closeout browser flow covers authenticated Owner desktop/mobile save, reload,
  warranty, completion, deep link, and error handling;
- failed punch save prevents PDF generation;
- punch PDF order exactly matches UI order and completion PDF uses canonical rows;
- Project PDF authorization, role keys, layout/content parity, idempotency, concurrency,
  private object identity, metadata compensation, and generic errors remain intact;
- final-invoice `finance.manage` and punch/completion/materials `projects.update` gates remain
  intact;
- the A/B/C × D/E matrix is executed; C+D passes, A+D and B+D Closeout incompatibility is
  demonstrated and reported, and C+E is rejected;
- immutable previous/new SHA fixtures verify the documented rollback limitation;
- financial values/formulas and unrelated Project/Documents behavior are unchanged;
- browser/database/Storage fixtures are enumerated before the test and have exact zero
  residual counts afterward; all fixtures are precisely removed.

Final local gates are clean Docker replay, Production-equivalent upgrade, migration-order
and duplicate-provenance checks, focused unit/route/database tests, full unit suite,
Prettier, lint, TypeScript, production build, focused Playwright, secret/artifact scan,
`git diff --check`, manifest-only diff, and exact fixture cleanup. Production is not used as
a test target.

## 14. Rollback and release behavior

The new rollback is guarded by an explicit session confirmation token and is a
non-destructive application service-control script, not a down migration. It retains:

- every canonical row and all four canonical tables;
- `position`, `NOT NULL`, unique, status/default/check, FK, and supporting indexes;
- the atomic RPC and its service-only ACL;
- narrowed canonical grants and RLS;
- Documents schema/backfill and the private attachments bucket;
- the absence of all three legacy tables.

It never deletes business data or Storage objects, drops data-bearing schema, broadens anon
or authenticated access, rewrites the ledger, or recreates legacy tables. Because A and B
still query legacy tables, application rollback to those SHAs cannot restore Closeout. The
rollback may preserve non-Closeout pages only while Closeout is explicitly unavailable.
Restoring old Closeout would require a new owner-approved forward compatibility design and
is not authorized.

Safe release order, if later separately authorized, is:

1. revalidate immutable Production evidence and all stop conditions read-only;
2. prove provenance integration and build C before any database change;
3. enter a bounded Closeout maintenance gate so A/B cannot write during transition;
4. apply the reviewed ordered migrations through the approved migration mechanism (never
   generic `db push`);
5. verify database D, then immediately deploy the already-built C artifact;
6. run authorization, Closeout, PDF, data-count, and fixture smoke gates;
7. on application failure, use the non-destructive service-control rollback and keep
   Closeout unavailable rather than deploying A/B as a claimed full restore.

Any new Production canonical row, legacy row, unknown dependency, migration-ledger
divergence, hash mismatch, compatibility result mismatch, or authorization regression
stops release for owner review.

## 15. Review-finding resolution

| Finding                                      | Severity | Resolution in this revision                                                                                                                               |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy tables retained as normal final state | P1       | Sections 1 and 4 require final physical absence, strict zero/dependency gates, and atomic forward removal                                                 |
| Nulls bypass unique/check semantics          | P1       | Section 3 specifies exact `NOT NULL` constraints and null preflight; it explicitly records PostgreSQL CHECK null behavior                                 |
| Old application rollback claimed compatible  | P1       | Sections 9 and 14 classify A/B+D as prohibited rollback targets and describe Closeout unavailability honestly                                             |
| Provenance merge deferred                    | P2       | Section 10 selects the Production-timestamped file, excludes the sibling atomically, records SHA-256 fingerprints, and blocks duplicate/ledger divergence |
| RPC bounds/qualification/timeouts incomplete | P2       | Section 5 fixes input schema, byte/count/text limits, unknown-field behavior, invoker/search path, locks, timeouts, result, errors, and retry behavior    |
| Implementation manifest incomplete           | P2       | Section 12 provides the closed file manifest, including every active legacy reference and test/evidence surface                                           |
| RLS permission recomputed per row            | P3       | Section 7 requires cached scalar predicate form and an indexed permission lookup preflight                                                                |

This specification authorizes no implementation, Production, deployment, environment,
database, ledger, alias, or Storage change. Implementation begins only after a new
independent review and explicit Owner approval.
