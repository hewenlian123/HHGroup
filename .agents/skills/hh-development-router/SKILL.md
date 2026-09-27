---
name: hh-development-router
description: Use when HH Group implementation work or a reported defect may touch source code, UI, financial behavior, database or migrations, API contracts, tests, or dependencies and the required Skills and verification tools must be selected; do not use for ordinary conversation or documentation-only edits with no code, configuration, or runtime effect.
---

# HH Development Router

## Purpose

Classify an HH Group change before implementation and compose the existing Skills and tools it requires. Routes are additive, never mutually exclusive. This Skill routes work; it does not replace debugging, testing, design, financial, migration, browser-QA, review, or completion Skills.

## Inputs

- The user's requested outcome and explicit constraints.
- The applicable `AGENTS.md` hierarchy and actual HH repository root.
- The proposed or current changed-file set, affected behavior, and data boundaries.
- Available Skill names, project scripts, and tool availability.

## Outputs

Before implementation, state a compact route manifest containing:

1. Every applicable route label.
2. Required Skills in execution order; for every implementation request, the manifest MUST end with `superpowers:verification-before-completion`, including UI-only implementation.
3. Required targeted tools and evidence.
4. Conditions that add another route.
5. Any blocker that prevents a truthful completion claim.

## Workflow

1. Confirm the work is HH Group development work and read the governing `AGENTS.md`. If neither is true, do not use this Skill.
2. Classify all affected surfaces. Never stop after the first match; `financial + database + UI` activates all three routes.
3. Read [references/routing-matrix.md](references/routing-matrix.md), then invoke each required existing Skill before acting. Follow those Skills rather than restating or weakening them.
4. Select the smallest tests that prove the affected behavior, then expand verification in proportion to risk and shared contracts.
5. For major completion, request code review. Before every completion claim, use `superpowers:verification-before-completion` with fresh evidence from every applicable route.

## Non-Triggers

- Ordinary conversation, status chat, or general advice unrelated to HH implementation.
- README, prose, comments, or Skill documentation changes with no code, configuration, dependency, generated artifact, or runtime effect.
- Non-HH repositories.
- A request that only asks to inspect or explain existing code and does not ask for an implementation or verification plan.

## Hard Boundaries

- Do not implement another Skill's domain rules here.
- Do not infer that one route cancels another.
- Do not run database tools unless the database route is active.
- Do not invoke `color-contrast` for ordinary spacing work; it is rendered contrast evidence only.
- Do not invoke `review-animations` unless the user explicitly requests motion review.
- Do not lower assertions, omit a required route, or replace a failed command with a weaker check.

## Stop and Failure Behavior

Stop and report `BLOCKED` or `NOT VERIFIED` when required authority, fixtures, local services, credentials, or tools are unavailable; when an operation would require prohibited remote or production mutation; or when a required command fails, times out, or is skipped. A blocked tool is never a pass. Preserve the failure evidence and state which route remains incomplete.

## Skill Maintenance

When changing this router, run the positive and negative cases in [references/eval-cases.md](references/eval-cases.md) in a fresh Codex session. File presence or source-text matching alone does not prove routing behavior.
