# Organization, project, Materials and Attachments authorization verification

Result: **PASS for the requested project/Materials/Attachments scope**, local only. No commit, push, deployment, dependency upgrade or Production operation.

## Authorization contract

Verified Supabase user → active database organization membership → existing owner/admin/assistant role → actual organization/project/resource relationship. Same-organization owner/admin can read/write; assistant can read; foreign organizations, anonymous users, inactive/unassigned memberships and forged editable metadata cannot authorize access. Organization/resource reassignment and foreign catalog/image claims fail closed. Membership revocation takes effect with the same user token.

Cookie sessions and Bearer tokens are propagated through the exact request client. Refreshed cookies survive both success and error responses. Assistant admission is restricted to organization workspaces; read-only Next Server Actions may use POST, but every write still checks the DB role. Global Finance role requirements are not widened.

## Schema and migrations

- `20260906091106_organization_project_authorization_foundation.sql`: existing foundation from this task; organizations/memberships, one-time evidence-based attribution, scoped RLS and stable resource ownership. Not rewritten during continuation.
- `20260906093852_punch_list_active_fields_replay.sql`: restores notes, description, priority, completed_at, created_by and photo_id. Each was introduced by a committed extension before CREATE TABLE and skipped on a clean database; active Punch/Site Photo callers still require them. Worker/photo foreign keys and Medium priority remain the established contract. Notes only backfill a missing description.
- `20260906094223_organization_document_storage_authorization.sql`: private metadata-bound attachments; immutable object binding; object-before-metadata delete guard; material/project photo reference checks; same-org closeout reads; legacy photo compatibility; server-mediated private commission receipt buckets.

`worker_payments` remains canonical `total_amount` / `note`; no amount/notes/project_id aliases were added. The report only needs paid labor-entry associations, so its stale field reads were removed. Failed payment reads now throw unavailable instead of relabeling paid work as unpaid. No money/allocation/payroll formula changed.

Both schema scanners now understand ordinary, quoted and mixed public identifiers. Positive and genuine-missing negative tests pass. Correct schema was not changed to satisfy stale parsing.

## Privileged entrypoint ledger

| Final classification           | Scope and boundary                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SAFE                           | Project actions/tasks; project list/tab APIs; Materials catalog/sheets/items/PDF; Documents upload/read/delete; operational task/schedule/inspection/punch/photo calls use verified session + RLS.                                                                       |
| SAFE                           | Project financial snapshot/review and related labor/subcontract pages verify the actual project organization while retaining existing Finance role gates. Nested subcontract/bill/schedule, change-order/attachment and commission/payment IDs must match their parent.  |
| INTENTIONALLY PRIVILEGED       | Project deletion/usage verifies project membership and existing Finance permission before narrow trusted operations. Both normal and force deletion check documents before any destructive write.                                                                        |
| INTENTIONALLY PRIVILEGED       | Closeout saves and commission receipt upload/remove/sign verify DB project write authority first; receipts also bind project → commission → payment → exact stored path. Both commission buckets are private and deny direct anonymous/authenticated Storage operations. |
| SAFE                           | The three closeout PDF generators use the shared session-bound document upload lifecycle. Public receipt options and project-assigned receipt submissions now require organization authorization.                                                                        |
| NEEDS ORG AUTH / LEGACY BYPASS | None remains in the audited, directly project-scoped set above.                                                                                                                                                                                                          |

Scope boundary: the separate global `/financial/payments` AR workflow was read-only audited and not changed. Its private `payment-attachments` bucket still has broad legacy policies and its global Finance service actions are not organization-certified here; local objects/payment/attachment rows were all zero. It is not used by the changed project receipt routes. Unassigned public receipt intake retains its existing anonymous intake/RLS contract; it cannot assign a project without DB-backed project write authorization. These independent Finance/intake authorities are not covered by this PASS.

## Materials and attachment lifecycle

Materials now support the real create → save → refresh → edit → refresh path using the existing modal and a project-scoped PATCH. Errors remain explicit, and saved rows are confirmed in the database.

Uploads reserve a document ID and authorized metadata before private Storage creation. Paths are either `organizations/<org>/projects/<project>/documents/<document>/<name>` or `organizations/<org>/documents/<document>/<name>`. Uploads never upsert. Failure compensates the exact object and metadata; cleanup failure retains the association with an explicit recovery error. Metadata cannot be removed while its private object exists. Read/signing requires exact DB metadata and current membership. New material/field images are canonical document assets; unchanged legacy references retain exact-bound read compatibility and cannot be newly claimed by another organization.

The document picker is client-initialized before becoming interactive, preventing file selection loss during hydration. This follows [Playwright hydration guidance](https://playwright.dev/docs/navigations#hydration). Native PDF downloads are verified using the browser's signed object request and exact bytes, rather than assuming the popup retains a URL.

## Verification evidence

- One final complete local migration replay succeeded through `20260906094223`. All public/auth/storage column contracts equal the tested expected schema. The fresh current-data snapshot restored **121 tables / 2,625 rows** with exact per-table counts/content hashes. Snapshot/dump material was deleted after successful restoration. No historical backup was used.
- Original project ID/name/budget/spent/contract/customer fields remain equal, comparing monetary values exactly as decimals. Two original active memberships and one original project remain. No resource is left unmapped.
- Schema preflight strict, schema-vs-code, migration filename/order, three scanner regressions: PASS.
- Punch schema/FK tests: 14 PASS. Populated existing-data upgrade using the actual follow-up migration inside a rollback transaction: 18 PASS (authored description/notes, priority/completion and project/creator/photo relationships preserved).
- Unified unit gate: 340 tests / 21 files PASS. Subsequent assistant read-action admission delta: 63 focused tests PASS. No assertion was lowered; actual action writes/API mutations remain denied.
- Final local DB/Storage/image security + exact cleanup: 98 tests PASS. Real HTTP Bearer verification is recorded separately in `/tmp/hh-authz-final-bearer.log`.
- Node 22 typecheck PASS, including the final middleware delta. Targeted lint: 110 changed code/test files PASS; final changed test/middleware subset rechecked.
- Projects minimal regression: list → actual project Overview PASS at 1440×900. No unexpected console/page errors or horizontal overflow. The first smoke selector targeted a hidden mobile duplicate; the corrected accessible desktop link passed.
- Browser role matrix below: all five roles PASS. Owner/Admin Materials save/edit and attachment upload/read survive refresh and match DB/object bytes. Denied upload actions create no metadata. Browser runtime/console checks pass for authorized workflows.

| Browser identity     | Materials                             | Attachments                                      |
| -------------------- | ------------------------------------- | ------------------------------------------------ |
| Owner, same org      | create/save/refresh/edit/refresh PASS | upload/metadata/private signed read/refresh PASS |
| Admin, same org      | create/save/refresh/edit/refresh PASS | upload/metadata/private signed read/refresh PASS |
| Assistant, same org  | read PASS; write DENY                 | read/refresh PASS; upload DENY                   |
| Foreign global owner | read/write DENY                       | read/upload DENY                                 |
| Anonymous            | read/write DENY                       | read/upload DENY                                 |

Direct Storage tests additionally reject wrong organization/project/document/path, arbitrary metadata claims, object replacement and metadata-first deletion. Full responsive redesign/Figma parity and unrelated Finance workflows are not claimed; browser workflow scope is desktop 1440×900.

Useful local evidence: `/tmp/hh-authz-final-clean-replay.log`, `/tmp/hh-authz-final-replay-result.json`, `/tmp/hh-authz-final-schema-checks.log`, `/tmp/hh-authz-final-existing-data.log`, `/tmp/hh-authz-final-unit.log`, `/tmp/hh-authz-final-typecheck.log`, `/tmp/hh-authz-final-lint.log`, `/tmp/hh-authz-final-cleanup-security.log`, `/tmp/hh-authz-browser-role-matrix.json`, `/tmp/hh-authz-final-projects-smoke-recheck.log`, `/tmp/hh-authz-final-residual.json`. Owner/Admin Materials/Documents and Projects screenshots are under `/tmp/hh-authz-*.png`. Earlier failed diagnostics remain separate; they were not counted as passes.

## Test data and frozen modules

Only isolated UUID-marked local fixtures were created. Teardown owns exact DB rows, Storage paths and Auth identities. Auth audit rows do not cascade with user deletion, so exact actor/target IDs are also cleaned and asserted. The residual audit removed 362 records belonging exclusively to 114 already-deleted test identities; no active identity's audit history was removed. Final DB fixture, Storage object, Auth user and Auth audit residue: **0**.

Frozen diff checks preserve Sidebar, Workspace layout/navigation, canonical profit/payroll/labor formulas, package/dependency files and committed migrations. The report query fix and project authorization/presentation changes do not alter Finance formulas. No push/deploy is pending.

Skills used: Ponytail full; Supabase; HH financial-integrity guard; HH design-system enforcer; HH Playwright QA; color-contrast (evidence boundary only, no palette/token changes); Superpowers using-superpowers, planning, TDD, systematic-debugging, parallel-agent dispatch/review and verification-before-completion. Each agent loaded only its relevant instructions.

## Files changed in this continuation

The manifest below compares against the exact continuation-start hashes and includes existing user-modified files without discarding their prior work.

- `docs/PUBLIC_RECEIPT_UPLOAD_CONTRACT.md`
- `docs/superpowers/plans/2026-09-06-organization-project-authorization.md`
- `scripts/audit-schema-vs-code.mjs`
- `scripts/check-schema-preflight.mjs`
- `src/__tests__/api/project-financial-snapshot-phase3.test.ts`
- `src/__tests__/api/project-operations-session.test.ts`
- `src/__tests__/api/project-receipt-submission-boundary.test.ts`
- `src/__tests__/lib/document-storage.test.ts`
- `src/__tests__/lib/organization-boundary.test.ts`
- `src/__tests__/lib/project-closeout-write-contract.test.ts`
- `src/__tests__/lib/project-deletion-document-boundary.test.ts`
- `src/__tests__/lib/project-task-enrichment-boundary.test.ts`
- `src/__tests__/lib/reports-worker-payment-schema.test.ts`
- `src/__tests__/lib/supabase-response.test.ts`
- `src/__tests__/middleware-auth-rollout.test.ts`
- `src/__tests__/production-auth-hardening-boundaries.test.ts`
- `src/__tests__/project-documents-hydration.test.ts`
- `src/__tests__/projects-organization-read.test.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/materials/[id]/items/route.ts`
- `src/app/api/materials/[id]/pdf/route.ts`
- `src/app/api/materials/catalog/photo/route.ts`
- `src/app/api/materials/catalog/route.ts`
- `src/app/api/materials/catalog/upload/route.ts`
- `src/app/api/materials/photo/route.ts`
- `src/app/api/materials/upload/route.ts`
- `src/app/api/operations/inspection-log/[id]/route.ts`
- `src/app/api/operations/inspection-log/route.ts`
- `src/app/api/operations/punch-list/photo/route.ts`
- `src/app/api/operations/punch-list/route.ts`
- `src/app/api/operations/punch-list/upload/route.ts`
- `src/app/api/operations/schedule/route.ts`
- `src/app/api/operations/site-photos/[id]/route.ts`
- `src/app/api/operations/site-photos/photo/route.ts`
- `src/app/api/operations/site-photos/route.ts`
- `src/app/api/operations/site-photos/upload/route.ts`
- `src/app/api/operations/tasks/route.ts`
- `src/app/api/projects/[id]/closeout/completion/route.ts`
- `src/app/api/projects/[id]/closeout/generate-completion-pdf/route.ts`
- `src/app/api/projects/[id]/closeout/generate-final-invoice-pdf/route.ts`
- `src/app/api/projects/[id]/closeout/generate-punch-pdf/route.ts`
- `src/app/api/projects/[id]/closeout/punch/route.ts`
- `src/app/api/projects/[id]/closeout/warranty/route.ts`
- `src/app/api/projects/[id]/commissions/[commissionId]/payments/[paymentId]/receipt/route.ts`
- `src/app/api/projects/[id]/commissions/[commissionId]/payments/[paymentId]/receipt/view-url/route.ts`
- `src/app/api/projects/[id]/commissions/[commissionId]/payments/[paymentId]/route.ts`
- `src/app/api/projects/[id]/commissions/[commissionId]/payments/route.ts`
- `src/app/api/projects/[id]/commissions/[commissionId]/route.ts`
- `src/app/api/projects/[id]/commissions/route.ts`
- `src/app/api/projects/[id]/financial-snapshot/route.ts`
- `src/app/api/projects/[id]/materials/generate-pdf/route.ts`
- `src/app/api/projects/[id]/materials/route.ts`
- `src/app/api/projects/[id]/tab/route.ts`
- `src/app/api/projects/financial-review/route.ts`
- `src/app/api/projects/financial-snapshots/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/system/qa-check/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/app/api/upload-receipt/options/route.ts`
- `src/app/api/upload-receipt/submit/route.ts`
- `src/app/documents/actions.ts`
- `src/app/documents/page.tsx`
- `src/app/login/page.tsx`
- `src/app/materials/[id]/page.tsx`
- `src/app/materials/[id]/preview/page.tsx`
- `src/app/materials/[id]/print/page.tsx`
- `src/app/materials/actions.ts`
- `src/app/materials/new/page.tsx`
- `src/app/materials/page.tsx`
- `src/app/projects/[id]/change-orders/actions.ts`
- `src/app/projects/[id]/documents/actions.ts`
- `src/app/projects/[id]/labor/page.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/app/projects/[id]/profit/page.tsx`
- `src/app/projects/[id]/project-detail-tabs-client.tsx`
- `src/app/projects/[id]/project-documents-tab.tsx`
- `src/app/projects/[id]/project-materials-tab.tsx`
- `src/app/projects/[id]/subcontracts/[subId]/actions.ts`
- `src/app/projects/[id]/subcontracts/[subId]/bills/actions.ts`
- `src/app/projects/[id]/subcontracts/[subId]/bills/page.tsx`
- `src/app/projects/[id]/subcontracts/[subId]/page.tsx`
- `src/app/projects/[id]/subcontracts/actions.ts`
- `src/app/projects/[id]/subcontracts/page.tsx`
- `src/app/projects/actions.ts`
- `src/app/projects/page.tsx`
- `src/app/projects/projects-list-client.tsx`
- `src/app/punch-list/page.tsx`
- `src/app/settings/project-financial-review/page.tsx`
- `src/app/site-photos/page.tsx`
- `src/components/auth/auth-provider.tsx`
- `src/lib/auth-boundary.ts`
- `src/lib/change-orders-db.ts`
- `src/lib/data/index.ts`
- `src/lib/document-storage.ts`
- `src/lib/documents-db.ts`
- `src/lib/financial/project-financial-review-db.ts`
- `src/lib/material-catalog-db.ts`
- `src/lib/material-selection-sheets-db.ts`
- `src/lib/material-selection-sheets.ts`
- `src/lib/material-selections-db.ts`
- `src/lib/organization-membership.ts`
- `src/lib/project-tasks-db.ts`
- `src/lib/projects-db.ts`
- `src/lib/reports-db.ts`
- `src/lib/subcontract-bills-db.ts`
- `src/lib/subcontracts-db.ts`
- `src/lib/supabase-response.ts`
- `src/middleware.ts`
- `supabase/migrations/20260906093852_punch_list_active_fields_replay.sql`
- `supabase/migrations/20260906094223_organization_document_storage_authorization.sql`
- `supabase/tests/database/014_punch_list_active_fields.sql`
- `tests/material-image-authorization.local.test.mjs`
- `tests/organization-authorization.local.test.mjs`
- `tests/organization-workflows.local.mjs`
- `tests/schema-identifier-scanners.test.mjs`
