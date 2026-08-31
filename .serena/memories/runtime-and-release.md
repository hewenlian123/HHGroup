# Runtime and Release

Verified from:

- `AGENTS.md`
- `.nvmrc`
- `package.json` (`engines` and scripts)
- `.github/workflows/ci.yml`
- `docs/CI_GITHUB_VERCEL.md`
- `docs/PRODUCTION_CHECKLIST.md`

Last verified: 2026-08-30

## Durable contract

- Node.js 22.x is the repository runtime contract for local development, CI, dependency installs, tests, builds, and future repository-governed Vercel builds. Use `.nvmrc` and `package.json#engines`; do not preserve transient hosting-dashboard runtime state as durable memory.
- Verification is local-first and proportional to risk: start with the narrowest affected test, then expand to required migration/schema, Vitest, format/lint, TypeScript, build, and Playwright checks for the changed surface.
- CI validates migration filenames/order, strict schema preflight, schema-vs-code, Vitest, format, limited ESLint, TypeScript, and Next build. Playwright is a separate local verification surface and is not run by the current CI workflow.
- Mutating Playwright requires local app + local Supabase target proof. A local pass does not authorize push, deploy, Production migration, or Production data mutation.
- Production Supabase migrations are manual and explicitly authorized; CI/Vercel Git deployment does not apply them. For an authorized rollout containing a schema change, apply the exact reviewed migration before the dependent app release, then run task-specific post-migration and post-deploy smoke checks.
- Before any completion claim, inspect final diff and status, ensure no secret/generated artifact was added, and use `superpowers:verification-before-completion`. Never claim PASS while a required check is failing or missing.

Re-verify if Node runtime, CI gates, Playwright placement, migration/deployment separation, or production smoke policy changes.
