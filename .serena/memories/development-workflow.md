# Development Workflow

Verified from:

- `AGENTS.md`
- `.agents/skills/hh-development-router/SKILL.md`
- `.agents/skills/hh-development-router/references/routing-matrix.md`
- `.agents/skills/hh-database-migration-guard/SKILL.md`
- `package.json`

Last verified: 2026-08-30

## Additive routing

- HH implementation starts with `hh-development-router`; routes stack when predicates overlap. Select the minimum sufficient Skills and tools, not every installed tool.
- Bug/regression: `superpowers:systematic-debugging` -> `superpowers:test-driven-development` -> targeted Vitest/Playwright/pgTAP by surface -> `superpowers:verification-before-completion`.
- Financial change: `hh-financial-integrity-guard` -> before/after regression -> targeted Vitest -> Semgrep; add `hh-database-migration-guard` when DB contracts are touched.
- DB/migration: `hh-database-migration-guard` and the ordered workflow in `mem:database-and-migrations`.
- UI: `hh-design-system-enforcer` -> TypeScript/Vitest when applicable -> `hh-playwright-qa` -> completion verification. Add `@axe-core/playwright` only when rendered UI/form/navigation accessibility is in scope.
- Dependency change: TypeScript -> affected tests -> OSV-Scanner against the changed lockfile.
- Major completion: `superpowers:requesting-code-review` -> `superpowers:verification-before-completion`, after all domain routes.

## Optional tool predicates

- Serena: large cross-file symbol definitions/references/caller impact; not a known local single-file edit.
- ast-grep: syntax-aware structural search or reviewed codemod; begin read-only.
- Knip: unused file/export/dependency investigation; report before deletion.
- fast-check: a clearly stated invariant with useful boundary/combinatorial inputs; never replaces literal financial regression.
- dependency-cruiser: cycles, dependency direction, or architecture boundaries; report before refactor.
- `@axe-core/playwright`: accessibility evidence with `hh-playwright-qa`; never suppress violations or weaken assertions.

Fresh command output and exit status are evidence. Failed, skipped, blocked, or timed-out work is not PASS.

Re-verify if router matrices, Skill names, project scripts, or tool entry points change.
