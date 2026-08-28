# HH Group — Repository Instructions for AI Agents

This file is the single canonical repository-level instruction source for Codex and other AI coding tools. Tool-specific instruction files must not override or duplicate it.

## Canonical workspace and scope

- Work only in `/Users/solidcore/Desktop/HH Group` for HH Group development.
- Do not search for, restore, merge, or copy from older HH Group clones, snapshots, backups, deleted workspaces, or previous Production Git history.
- Never recreate a ref to `5b0f5a2e5b1655d04fc6268b4200716e2f0ccf1b` or restore `backups/database/backup-2026-03-15.json`.
- Keep every change scoped to the requested task. Preserve unrelated user changes and avoid unnecessary files, copies, reports, backup folders, temporary repositories, and abandoned artifacts.

## Git and release safety

- Inspect `git status` before and after work. Keep the working tree understandable and do not clean or overwrite unrelated changes.
- Do not commit `.env` files, credentials, database dumps or backups, `node_modules`, `.next`, generated build output, logs, or temporary artifacts.
- Do not push, deploy, create a release, or change a remote unless the user explicitly requests it.
- Do not rewrite or restore Git history unless the user explicitly requests the exact operation.
- A passing local check never authorizes a push, deployment, Production migration, or Production data change.

## Local Supabase first

- Use the repository's local Supabase instance for development and mutation testing. Confirm the target is local before any reset, seed, cleanup, destructive SQL, or write-heavy test.
- Never copy Production data into the local database. Never point local cleanup, seed, teardown, or destructive tests at a hosted Supabase project.
- Production is read-only by default. Do not connect to, migrate, seed, repair, reset, or modify Production unless the user explicitly authorizes that exact Production operation.
- Do not work around the test URL guards in `tests/e2e-supabase-url-guard.ts`. Remote/staging overrides require explicit authorization and must never be treated as Production permission.
- Persist application business data in Supabase. Do not introduce mock or in-memory storage as an alternate source of truth for Estimate or other persisted workflows.

## Database queries and migrations

- Never assume a table or column exists. Before adding or changing a Supabase query, RPC call, or SQL statement, verify names and types in the committed migrations and in the local database schema. Match existing repository data-access patterns.
- Treat query errors explicitly. Financial and authorization-sensitive reads must fail closed; do not silently convert failed reads into empty data or zero values.
- Make structural database changes only through a new, focused file under `supabase/migrations/`. Do not use Dashboard or application-time DDL as the canonical schema mechanism.
- Committed migrations are immutable ledger entries: do not edit, rename, reorder, or delete them. Correct shared history with a new forward migration.
- Validate schema work against local Supabase. At minimum, run the relevant migration filename/order/schema checks and prove the full local migration chain with `npx supabase db reset --local` when the task includes a schema change. Confirm the target is local before resetting.
- Never run Production migrations without explicit authorization, a reviewed migration set, rollback/recovery planning, and post-migration verification.

## Financial integrity

- Preserve `src/lib/profit-engine.ts` as the canonical project-profit implementation unless a requested, reviewed financial change explicitly replaces it.
- Canonical actual project cost currently comprises project labor, eligible `expense_lines`, approved `subcontract_bills`, and accrued commissions. Generic `ap_bills` are AP/payment tracking and are not an additional canonical project-cost source.
- Do not double-count the same cost across `expense_lines`, `subcontract_bills`, `ap_bills`, payments, reimbursements, or commission payments. Payment/cash tracking must not silently change accrued profit.
- Preserve approval, void/reversal, payment-balance, audit-trail, and idempotency behavior. Financial mutations must be atomic where partial completion could corrupt balances.
- Never mask unavailable or unauthorized financial data as a valid zero. Changes to financial formulas or settlement flows require focused regression and reconciliation tests.

## Playwright and test data safety

- Run mutating Playwright tests only against the local app and local Supabase. Verify `E2E_BASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` before running them; hosted/Production targets are read-only unless the user explicitly authorizes a narrowly scoped run.
- Every test that creates database rows owns their cleanup. Use unique `PW ` or `[E2E]` markers, clean the rows in that test file's teardown, and keep `tests/global-teardown.ts` / `cleanupTestData` as a final safety net rather than the primary cleanup strategy.
- Never rely on leftover test data or delete broad, unmarked data. Preserve the fixed seed IDs declared in `tests/e2e-cleanup-db.ts`.
- Keep tests independent. Prefer accessible selectors and condition-based waits; do not use arbitrary sleeps to hide races.
- Do not hide a real regression with `test.skip()` or `test.fixme()`. Environment-gated skips are acceptable only when the missing prerequisite is explicitly permitted and reported.

## Implementation and verification

- Follow the existing Next.js, React, TypeScript, Supabase, and HH design-system patterns. Reuse established components, tokens, data-access layers, and tests before adding new abstractions or dependencies.
- Verify in proportion to risk: run the narrowest relevant tests first, then required type, lint, format, build, migration, or Playwright checks for the changed surface.
- For UI changes, inspect the result in the running local app at relevant viewport sizes and verify loading, empty, error, and success states as applicable.
- Before declaring completion, inspect the final diff and `git status`, confirm no secret or generated artifact was added, and report exactly which checks passed or were not run.
- Do not claim success while a required check is failing. Fix in-scope failures; clearly identify unrelated or environment-blocked failures.
