# HH Group production completion — September 6, 2026

Status: **Local certification and production migrations passed. Application deployment pending.**

## Authorization and scope

The user explicitly authorized the complete system audit, necessary repairs, local mutation fixtures and exact cleanup, append-only data-safe production migrations, deployment to the existing environment and read-only production smoke. Existing correct uncommitted work is preserved. AR, AP and Labor remain separate ledgers; singleton company branding and trusted membership remain authoritative.

## Repairs and evidence

- AR/AP: serialized allocation and parent locks, overpayment protection, stable request identities, lost-acknowledgement recovery and explicit write failure.
- Estimate conversion: one authorized transaction links the estimate, project, customer, pricing snapshot and activity; concurrent retries return one project.
- Labor: stable worker IDs, same-name separation, project attribution before pagination, live role checks and protected worker projection.
- Expenses/Accounts: unavailable rather than zero on failed reads, exact affected-row checks, receipt attachment recovery and immutable retry uploads.
- Projects/Security: live organization membership, shared-company finance authorization, private attachments, assistant scope and explicit anonymous/wrong-organization denial.

The companion JSON records migration source checksums and verification evidence. Local full database regression passed 478 tests; clean replay through `20260906203011` preserved the immediate existing-data snapshot and matched the expected schema. The final application production build passed. Browser certification passed on production builds against local Supabase with strict login: Security/Projects 111 checks, all AR/AP/Estimate and Labor/Expenses/Accounts workflows across the three required viewports. The final isolated Accounts refresh correction passed 26 targeted tests and affected browser workflows.

## Production safety

The existing Vercel `hh-group` project and `hhprojectgroup.com` domain are verified. Supabase target is `rzublljldebswurgdqxp`. Node 22 is configured. Secret values are not included in this record. All destructive or financial mutation verification is local only.

Read-only production preflight found a singleton company and one trusted named administrator, no orphan project references, no AR/AP overpayments and no partial estimate-conversion/customer linkage conflicts. Fingerprints of the original business columns will be captured immediately before migrations and compared after applying them; new ownership/backfill fields and their update timestamps are accounted for separately.

Apply only the reviewed migration files in order. The Supabase Management API assigns remote migration versions; retain a source filename/checksum-to-remote-version crosswalk without editing local applied migration names or repairing unrelated history.

## Recovery

Previous ready deployment: `dpl_ATCPWSUmZKay7XobMs73QJuHhGJV`. Retain it as application recovery evidence. A failed application release requires a compatible rollback or repair and redeployment. Database recovery preserves business rows and strengthened access controls; use reviewed forward fixes rather than destructive schema rollback or restoration of anonymous financial access.

## Remaining completion gates

Local browser rendering, receipt review and exact cleanup are complete. All 92 original public tables retain their 61 original rows and exact content hashes; Auth retains its two original users and Storage has zero objects. Record the release commit; revalidate production preflight and apply migrations; deploy using production environment variables; run authenticated read-only production smoke at all three viewports and inspect runtime/browser errors. No final PASS is claimed until these gates are complete.

## Production migration execution

The user supplied direct approval of the exact 13 migrations and deployment after the earlier automatic-review block. The first permitted attempt failed on a missing legacy material column and rolled back completely. Read-only schema comparison identified two minimal compatibility prerequisites: canonical fields for the empty legacy material table, and UUID source-ID handling in five expense functions. Neither changes existing business rows or financial column types. The material alias constraint prevents fallback references from bypassing authorization. The expense patch preserves function ownership, ACLs and execution configuration and rejects unknown definitions.

Both compatibility migrations and the original unchanged 13 migrations succeeded on production. Their source checksums and actual Management API ledger versions appear in the companion JSON. The prerequisites were applied before the original 13 in their original relative order; local filenames remain immutable. A clean local replay through both new migrations preserved all 122 tables and 2,340 current local rows. All 478 database regressions and 196 source contracts passed; six added opt-in compatibility cases passed separately, including 240 financial assertions on both text and UUID schemas.

Post-migration fingerprints match all 90 original production tables and 1,141 rows. Added authorization tables contain one organization and one trusted membership; the new attachment table is empty. Security postflight verifies all 69 company boundaries, organization mappings, protected Storage rules and unchanged expense-function authority. Security advisors report no ERROR-level findings. Existing warnings include mutable search paths, authenticated GraphQL exposure governed by RLS, and disabled leaked-password protection; the two anonymous definer notices refer to trigger-returning functions, not directly callable financial RPCs.

The Mac is unlocked. The inspection browser login page has been handed to the user for normal authentication; no password or session extraction is used. Application deployment and authenticated read-only smoke remain pending.
