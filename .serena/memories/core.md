# HH Group Memory Index

Verified from:

- `AGENTS.md`
- `.agents/skills/hh-development-router/SKILL.md`
- `.agents/skills/hh-development-router/references/routing-matrix.md`

Last verified: 2026-08-30

## Durable context map

- Product, stack, local-first posture, and module map: `mem:project-overview`.
- Code/data authority and server/client boundaries: `mem:architecture-and-boundaries`.
- Canonical cost, fail-closed reads, atomicity, and financial regression: `mem:financial-invariants`.
- Forward-only Supabase migration workflow and proof gates: `mem:database-and-migrations`.
- Additive Skill routing and minimum-sufficient tool selection: `mem:development-workflow`.
- Figma, HH Design System, production behavior, and browser evidence boundaries: `mem:ui-design-contract`.
- Node runtime, local verification, CI, and authorized release separation: `mem:runtime-and-release`.

## Freshness contract

- Repository authority wins over memory: `AGENTS.md` -> current source -> current migrations/schema -> project Skills -> tests -> package/config -> git-backed docs.
- Re-verify and update only when architecture authority, canonical data ownership, financial invariants, migration/release policy, or tooling contracts change.
- Ordinary bug fixes, task progress, transient failures, and chat conclusions do not update durable memory.
- On conflict, treat the affected memory as stale immediately; do not use it to override source. Re-verify against the authority chain, then update or delete it.
