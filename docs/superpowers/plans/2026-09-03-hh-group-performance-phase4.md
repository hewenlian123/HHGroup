# HH Group Performance Optimization Phase 4 — Implementation Plan

> Scope is limited to evidenced shared latency in the Phase 3 baseline. Preserve the Frozen UI, financial formulas, authorization boundaries, and all previously validated optimizations. Do not push, deploy, or change database schema/indexes.

## Baseline accepted for comparison

- Dashboard: 811 ms FUC / 1,225 ms settle / 17 browser requests / 8 RSC / 5 aborts at 1440.
- Project Detail: 199 ms FUC / 663 ms settle / 3 browser requests / 1 RSC at 1440, while the server still executes all 19 workspace loaders.
- Expenses: 17 direct browser Supabase reads on soft navigation (22 hard load), 16 soft-navigation React commits (27 hard load).
- Estimate Detail: 1 request RLS client plus 5 admin-client constructions; 13–15 database reads with a serial invoice post-stage.
- Schedule: 3 database reads for a populated GET; the project table is read twice.
- JS disabled Dashboard: no `<main>` and only the dynamic AppShell skeleton.

## Implementation sequence

1. Add failing contracts for server-rendered shell content, conditional Project Detail data loading, Dashboard concurrency/client reuse, Expenses initial-data seeding and batched account fallback, Estimate client reuse/parallel post-stage, and Schedule project-read reuse.
2. Replace the root `ssr:false` boundary with a bounded SSR-safe shell import. Move query-only worker-mode detection out of the render-critical `useSearchParams` path while preserving operational/bare route behavior after hydration.
3. Make Project Detail tab selection URL-backed. Keep project/canonical financial authority and load only the active workspace tab's required data; show navigation pending state rather than rendering unloaded arrays as legitimate empty data.
4. Start Dashboard's primary, subcontract, and metric read groups concurrently after creating one request-scoped authenticated client; thread that client through read helpers that already support the same query semantics.
5. Server-load the default Expenses bundle with one authenticated client and seed the existing React Query keys. Preserve localStorage sort semantics by using the server list only when its sort matches; batch missing payment-account lookup into one bounded second query.
6. Reuse one admin client in Estimate Detail and overlap the two post-primary invoice reads.
7. Reuse one project list in the Schedule handler for both the selector and schedule-name mapping.
8. Run focused tests, TypeScript, lint, source/design/security and financial regression checks, production build, then authenticated 1440/820/390 browser profiling including JS-disabled structural-content proof.
9. Write the Production candidate report and stop for explicit push/deploy authorization.

## Stop conditions

- Do not substitute unavailable financial data with zero/empty values.
- Do not introduce shared/cross-user caches or cache errors.
- Do not change schema/indexes, UI architecture, formulas, permissions, or workflows.
- If optimized build or financial/security regressions fail, the candidate remains NEEDS FIXES.
