# HH Group production completion — September 6, 2026

Status: **Local certification passed. Production deployment is next.**

## Authorization and scope

The user explicitly authorized the complete system audit, necessary repairs, local mutation fixtures and exact cleanup, append-only data-safe production migrations, deployment to the existing environment and read-only production smoke. Existing correct uncommitted work is preserved. AR, AP and Labor remain separate ledgers; singleton company branding and trusted membership remain authoritative.

## Repairs and evidence

- AR/AP: serialized allocation and parent locks, overpayment protection, stable request identities, lost-acknowledgement recovery and explicit write failure.
- Estimate conversion: one authorized transaction links the estimate, project, customer, pricing snapshot and activity; concurrent retries return one project.
- Labor: stable worker IDs, same-name separation, project attribution before pagination, live role checks and protected worker projection.
- Expenses/Accounts: unavailable rather than zero on failed reads, exact affected-row checks, receipt attachment recovery and immutable retry uploads.
- Projects/Security: live organization membership, shared-company finance authorization, private attachments, assistant scope and explicit anonymous/wrong-organization denial.

The companion JSON records migration source checksums and verification evidence. Local full database regression passed 478 tests; clean replay through `20260906121743` preserved the immediate existing-data snapshot and matched the expected schema. The final application production build passed. Browser certification passed on production builds against local Supabase with strict login: Security/Projects 111 checks, all AR/AP/Estimate and Labor/Expenses/Accounts workflows across the three required viewports. The final isolated Accounts refresh correction passed 26 targeted tests and affected browser workflows.

## Production safety

The existing Vercel `hh-group` project and `hhprojectgroup.com` domain are verified. Supabase target is `rzublljldebswurgdqxp`. Node 22 is configured. Secret values are not included in this record. All destructive or financial mutation verification is local only.

Read-only production preflight found a singleton company and one trusted named administrator, no orphan project references, no AR/AP overpayments and no partial estimate-conversion/customer linkage conflicts. Fingerprints of the original business columns will be captured immediately before migrations and compared after applying them; new ownership/backfill fields and their update timestamps are accounted for separately.

Apply only the reviewed migration files in order. The Supabase Management API assigns remote migration versions; retain a source filename/checksum-to-remote-version crosswalk without editing local applied migration names or repairing unrelated history.

## Recovery

Previous ready deployment: `dpl_ATCPWSUmZKay7XobMs73QJuHhGJV`. Retain it as application recovery evidence. A failed application release requires a compatible rollback or repair and redeployment. Database recovery preserves business rows and strengthened access controls; use reviewed forward fixes rather than destructive schema rollback or restoration of anonymous financial access.

## Remaining completion gates

Local browser rendering, receipt review and exact cleanup are complete. All 92 original public tables retain their 61 original rows and exact content hashes; Auth retains its two original users and Storage has zero objects. Record the release commit; revalidate production preflight and apply migrations; deploy using production environment variables; run authenticated read-only production smoke at all three viewports and inspect runtime/browser errors. No final PASS is claimed until these gates are complete.
