# Database and Migrations

Verified from:

- `AGENTS.md`
- `.agents/skills/hh-database-migration-guard/SKILL.md`
- `.agents/skills/hh-database-migration-guard/references/migration-workflow.md`
- `package.json`
- `supabase/migrations/`
- `supabase/tests/database/`

Last verified: 2026-08-30

## Durable contract

- Activate `hh-database-migration-guard` for migrations, schema, SQL, RLS, RPCs/functions, triggers, constraints, database contracts, or persistence mapping. Financial DB work composes this guard with `hh-financial-integrity-guard`; neither replaces the other.
- Committed migrations are immutable ledger entries. Create a new focused forward migration; never edit, rename, reorder, or delete historical migrations. Never use Dashboard DDL or application-time DDL as the canonical schema mechanism.
- Never reset a linked/remote/Production database and never issue direct Production DDL. Prove the Supabase target is local before reset, seed, cleanup, destructive SQL, or write-heavy tests.
- Required order: inspect/classify exact migration set -> verify identifiers against migrations and local schema -> filename/order/schema static checks -> targeted Squawk on new migration files -> proven-local `npx supabase db reset --local` -> pgTAP via `npm run test:db:local` -> schema-vs-code and affected TypeScript/application tests when contracts changed -> completion verification.
- Targeted Squawk findings for new files are primary; optional historical findings must not bury them.
- Production migration is a separate, manual, explicitly authorized operation requiring reviewed exact migrations, recovery planning, and post-migration verification. CI and the documented Git deployment path do not apply Production migrations.
- Any required failure, timeout, skip, incomplete stage, ambiguous lineage, or unproven target yields FAILED/BLOCKED/NOT VERIFIED, never PASS.

Re-verify if migration immutability, local reset/pgTAP gates, production authorization, or database tool entry points change.
