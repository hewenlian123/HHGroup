# HH Group Development Environment Finalization Plan

> **Scope:** Tooling, skills, runtime configuration, read-only audits, and local verification only. Do not change business logic, connect to Production, commit, push, or deploy.

## Goal

Make Node 22 the effective HH Group local/CI/Codex runtime, verify the installed development intelligence stack end to end, validate the HH routing matrix with fresh Codex tasks, and classify the existing dirty worktree without overwriting user changes.

## Workstreams

1. **Runtime:** verify `.nvmrc`, `package.json#engines`, fnm shell behavior, npm scripts, CI, and fresh Codex behavior; apply only the smallest environment/configuration correction needed for Node 22.
2. **Skills and Serena:** verify discovery and readability of the eight requested skills; activate HH Group in Serena, exercise symbol/reference lookup, and validate durable memories plus provenance/freshness rules.
3. **Tool smokes:** run focused, non-mutating checks for ast-grep, Knip, fast-check, dependency-cruiser, axe/Playwright, Semgrep, Squawk, OSV, TypeScript, Vitest, and Playwright.
4. **Database:** prove the target is local, lint only new migrations first, run a full local reset, then pgTAP. A failure, timeout, or blocked tool is not a pass.
5. **Router:** use fresh Codex tasks for the six requested scenarios and confirm each selects a minimal sufficient route.
6. **Hygiene and completion:** preserve the baseline dirty tree, run `git diff --check`, classify files/findings, and apply verification-before-completion before reporting.

## Stop conditions

- Stop before any Production connection, remote migration, deploy, push, or commit.
- Do not reset/stash/clean the Git worktree.
- Do not suppress or auto-fix scanner findings.
- Do not mark blocked, timed-out, or unexecuted checks as passing.
