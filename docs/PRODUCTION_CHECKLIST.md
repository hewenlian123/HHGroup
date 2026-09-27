# Production checklist (HH Group)

## Existing production target

- Vercel project: `hh-group`, team `hhwilliamhe-4916s-projects`; Node 22.
- Canonical application: https://hhprojectgroup.com.
- Supabase project: `rzublljldebswurgdqxp`. Local development and mutation tests use a separate local Supabase instance.
- Preserve the existing `vercel.json` function limits and runtime settings.

## Environment

Verify the production Supabase URL, publishable key, server-only `SUPABASE_SECRET_KEY` (legacy `SUPABASE_SERVICE_ROLE_KEY` only as configured fallback), database connection, application URL and authentication secrets without printing values. Production authentication must remain enabled; local automatic-login settings must not reach production. Never commit environment files or credentials.

## Local certification

Complete the release unit/source/database gates, strict schema preflight, migration order, typecheck, lint, formatting and production build. Run financial concurrency, retry and rollback tests and required browser workflows at 1440×900, 768×1024 and 390×844 against local Supabase. Verify exact test-owned DB, Storage and Auth records are removed, including derived records.

## Database and deployment

1. Review the complete release diff and exact migration checksums. Inspect the current production ledger, schema, authorization, data invariants and existing-data compatibility.
2. Apply only reviewed append-only migrations in order under the authorized release scope. Record the actual remote migration version alongside each source filename and checksum. Do not blindly push migrations, renumber applied source migrations or repair unrelated migration history.
3. Verify data preservation, RLS, grants, private Storage and financial invariants after migration.
4. Build and deploy to the existing Vercel production project with its production environment. Do not deploy a prebuilt bundle compiled with local Supabase values. Verify the deployment is ready and existing domains point to it.

## Read-only production smoke

Verify health, login and a legitimate existing session, application shell, Projects, Estimates, Finance, Invoices, Payables, Labor, Contacts and key read APIs at the three supported viewports. Inspect runtime errors, browser console/page errors and private attachment reads as applicable. **Do not create payments, payroll, settlements or other production test fixtures.**

## Recovery

Record the previous ready Vercel deployment before release. If the new application fails, restore the compatible prior application deployment or repair and redeploy according to the failure. Preserve database data and the strengthened security boundary; do not roll back security policies to broad anonymous access or remove new tables/columns to force an application rollback. Use a reviewed forward migration for database defects. Historical release runbooks describe their own releases and do not authorize migration-history rewrites.

The dated production completion record contains this release’s actual evidence and final status.
