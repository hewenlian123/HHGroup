# HH Group Performance and Responsiveness Design

## Approved objective

Reduce the real user experience of slow response after clicks, navigation, buttons, and other interactions across HH Group without redesigning the UI, changing financial or business semantics, weakening security, pushing, or deploying.

## Authority and invariants

- `AGENTS.md` is the repository authority.
- `docs/architecture/HH_GROUP_GLOBAL_UI_UX_BASELINE.md` remains frozen.
- `src/lib/profit-engine.ts` and the established financial tests remain the financial authority.
- Production is read-only. Local Supabase is the only permitted target for mutation tests.
- No schema or index migration may be implemented in this campaign without separate evidence, justification, and approval.
- Financial unexpected delta must be zero.
- Business behavior, security boundaries, and UI/UX architecture must not change.
- Do not push or deploy.

## Evidence-first workflow

1. Measure Local and Production before modifying application code.
2. Cover Dashboard, Projects, Project Detail, Estimates, Estimate Detail, Revenue/AR, Invoice Detail, Payments, Expenses, Workers, Payroll, Documents, Tasks, Schedule, and Settings.
3. Record click-to-feedback, click-to-route-start, route-start-to-useful-content, full settle, request counts and waterfalls, server/auth/data duration evidence, bundle/hydration/render evidence, and data-access findings.
4. Distinguish actual latency from missing immediate visual feedback.
5. Classify findings by severity and subsystem before selecting optimizations.
6. Implement only evidence-backed, high-benefit, low-risk changes with regression coverage.
7. Compare the same workflows, viewports, fixtures, and environment before and after.

## Permitted optimization classes

- Duplicate request removal.
- Safe parallelization of independent reads.
- Smaller client and hydration boundaries.
- Request-scoped auth/session and Supabase-client deduplication that preserves RLS.
- Render stabilization and list/table rendering improvements.
- Removal of unnecessary prefetch, refresh, or focus/navigation refetch.
- Safe, user-scoped caching/revalidation that cannot expose stale financial state or cross-user data.
- Presentation-neutral loading, skeleton, or pending feedback using existing HH components and tokens.

## Prohibited approaches

- Returning stale or incorrect financial data for speed.
- Fail-open behavior or hidden errors.
- Broad service-role caching or cross-user cache reuse.
- Formula, rounding, mapping, workflow, permission, ownership, or lifecycle changes.
- UI redesign, new token values, new visual vocabulary, new breakpoints, or parallel design systems.
- Benchmark-only behavior that bypasses correct production work.

## Acceptance evidence

- Local and Production before/after tables for the declared routes and navigation workflow.
- Browser coverage at widths 1440, 820, and 390 using project-safe authentication and fixtures.
- Request totals, slowest requests, duplicates/aborts, console/page errors, and useful-content timing.
- Build/bundle evidence and focused React/server/data findings.
- Database/query review remains read-only; index or schema recommendations include query evidence and expected benefit only.
- Fresh financial, business behavior, security-boundary, type, build, and browser verification evidence.
- Final verdict: `HH GROUP PERFORMANCE OPTIMIZATION = PASS` or `NEEDS FIXES`.
