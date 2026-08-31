# Architecture and Boundaries

Verified from:

- `AGENTS.md`
- `src/lib/supabase.ts`
- `src/lib/supabase-server.ts`
- `src/lib/data/index.ts`
- `src/lib/profit-engine.ts`
- `docs/FIGMA_CODE_MAPPING_V2.md`

Last verified: 2026-08-30

## Durable boundaries

- Persisted business data belongs in Supabase; migrations define structural database authority. Application helpers consume that contract and must not assume tables, columns, RPCs, policies, or types without checking committed migrations and the local schema.
- Browser Supabase access uses the publishable/anon key and RLS. Ordinary server helpers also default to anon/RLS. Service-role/secret clients belong only in explicit server-only privileged paths and must never enter client components or browser-bound helpers.
- `src/lib/data/index.ts` composes domain data helpers; prefer existing domain access paths over direct parallel implementations.
- Project revenue/cost/profit authority is `src/lib/profit-engine.ts`; financial ownership details are indexed in `mem:financial-invariants`.
- Presentation and behavior are separate authorities: Figma defines validated UI intent; the HH Design System owns UI implementation; current production code owns data, workflow, calculations, Auth, API, and persistence behavior. See `mem:ui-design-contract`.
- A UI refactor is not authority to alter database mappings, FormData/API contracts, server actions, calculations, persistence, Auth, or workflow semantics.
- Avoid parallel core capabilities: no duplicate persistence source, profit engine, design system, or schema mechanism.

Re-verify if client/server credential boundaries, domain data ownership, canonical financial implementation, or presentation/behavior authority changes.
