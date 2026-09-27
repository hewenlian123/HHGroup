---
name: hh-database-migration-guard
description: Use when HH Group work creates, reviews, or changes Supabase migrations, schema, SQL, RLS policies, RPCs, database functions, triggers, constraints, or persisted database contracts, including requests for reset or migration verification; do not use for UI-only, documentation-only, or application-only changes that preserve the existing database contract.
---

# HH Database Migration Guard

## Purpose

Protect HH Group's immutable migration ledger and prove database changes against local Supabase. It owns migration workflow only, not financial meaning, application behavior, UI, debugging, or final completion.

HH repository `AGENTS.md` is authoritative. Use `supabase:supabase` for current CLI and product guidance, but do not follow generic direct-SQL or `db pull` advice when it conflicts with HH's new-forward-migration policy.

## Inputs

- Requested outcome, authorization boundary, and applicable `AGENTS.md`.
- Approved comparison base, Git status/diff, new files, and committed migration/schema history.
- Confirmed local Supabase target, pgTAP tests, and affected application contracts.

## Outputs

Produce an evidence ledger: classified files, local-target proof, commands and exits, test results, combined financial route when applicable, and `PASS`, `FAILED`, `BLOCKED`, or `NOT VERIFIED`.

## Workflow

1. Confirm the canonical HH repository, instructions, scope, comparison base, and exact migration file set.
2. Read [references/migration-workflow.md](references/migration-workflow.md). Block any historical migration mutation; permit only a focused forward migration.
3. Inspect committed and local schema. Run filename, ordering, schema-preflight, and relevant contract checks.
4. Run the project-local Squawk against the new migration files first. Keep any optional full-history findings separate.
5. Prove the target is local, then run Supabase local reset. Never reset a linked, hosted, staging, or Production database.
6. Run pgTAP. If application contracts changed, run affected TypeScript and application tests.
7. For financial data or behavior, also use `hh-financial-integrity-guard`. Use `hh-development-router` to retain other routes.
8. Before a completion claim, use `superpowers:verification-before-completion` with fresh evidence from every required stage.

## Non-Triggers

- UI/layout-only changes that preserve DB contracts.
- README, prose, comments, or Skill documentation with no database effect.
- Application-only reads or refactors that preserve the existing schema, RPC, persistence, and database contract.
- Ordinary conversation or non-HH repositories.

## Hard Rules

- Never edit, rename, reorder, or delete a committed migration. Correct history with a new forward migration.
- Never run remote reset, Production DDL, Dashboard DDL, linked-project mutation, or application-time DDL as HH's canonical schema mechanism.
- Never let historical Squawk warnings hide findings in the new migration set.
- Never treat a failed, blocked, timed-out, skipped, or partially run stage as passing.
- Never weaken database, pgTAP, financial, or application assertions to obtain a pass.

## Stop and Failure Behavior

Stop before mutation when the target is not proven local, lineage is ambiguous, history changed, authority is missing, or scope exceeds authorization. At the first failed required stage, preserve output, mark later stages `NOT RUN`, and report `FAILED` or `BLOCKED`; retries do not erase failure.

## Skill Maintenance

When changing this Skill, run [references/eval-cases.md](references/eval-cases.md) in a fresh read-only Codex session. Source-text checks alone do not prove correct trigger, blocking, or routing behavior.
