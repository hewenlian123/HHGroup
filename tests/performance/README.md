# HH system navigation performance baseline

This is measurement infrastructure only. It does not change application behavior, data, schema, authentication, or UI. The core matrix is Dashboard, Projects, Project Detail, Estimates, Estimate Detail, Revenue/AR, Invoice Detail, Payments, Expenses, Workers, Payroll, Documents, Tasks, Schedule, and Settings. It runs at 1440, 820, and 390 px widths.

Each run emits a non-overwriting JSON artifact under an environment-and-UTC-stamped output directory. A target runs cold, warm, and repeat navigation in the same browser page/context. Artifacts record target, viewport, sample, URL, browser, commit, timestamp, request inventory, `requestfinished` durations, duplicate/aborted/slow summaries, fresh click-to-feedback timing, first target document/RSC route-start timing (or URL-change fallback), route-specific useful-content timing, and an in-flight-aware 2700 ms quiet-window settle outcome. A missing visible Project, Estimate, or Invoice detail link writes a structured unavailable blocker instead of inventing an identifier.

Run an already-started Local app with:

```sh
E2E_BASE_URL=http://localhost:3000 npx playwright test -c tests/performance/playwright.performance.config.ts
```

Existing authenticated storage is required; the probe never creates users, sessions, or records. `PERFORMANCE_LOCAL_PROJECT_DETAIL_PATH`, `PERFORMANCE_LOCAL_ESTIMATE_DETAIL_PATH`, and `PERFORMANCE_LOCAL_INVOICE_DETAIL_PATH` are optional Local-only direct-navigation paths. They are rejected for Production and are emitted as clearly labeled direct-route timing results rather than click-timing samples.

The real workflow is Dashboard → Projects → Project → Estimate → Invoice → Payment → Expenses → Workers → Schedule. Every hop uses a visible anchor; if a required link is unavailable, the probe emits a blocker and stops rather than operating a button, form, action, or guessed ID.

Production always intercepts and aborts all non-GET/HEAD requests, query-string mutating actions, and known mutating GET endpoint families before they reach the target. Playwright interception disables HTTP cache, so Production artifacts record `cacheMode: "disabled-by-production-interception"` and must be interpreted as non-cache-representative. Safe GET nouns such as `/financial/payments` and `/upload-receipt` remain permitted.
