# HH system navigation performance baseline

This is measurement infrastructure only. It does not change application behavior, data, schema, authentication, or UI. The core matrix is Dashboard, Projects, Project Detail, Estimates, Estimate Detail, Revenue/AR, Invoice Detail, Payments, Expenses, Workers, Payroll, Documents, Tasks, Schedule, and Settings. It runs at 1440, 820, and 390 px widths.

Each run emits a non-overwriting JSON artifact with target, viewport, cold/warm/repeat sample metadata, target URL, browser, commit, timestamp, request inventory, `requestfinished` durations, duplicate/aborted/slow summaries, fresh click-to-feedback timing, first target document/RSC route-start timing, route-specific useful-content timing, and in-flight-aware settle outcome. A missing visible Project, Estimate, or Invoice detail link writes a structured unavailable blocker instead of inventing an identifier.

Run an already-started Local app with:

```sh
E2E_BASE_URL=http://localhost:3000 npx playwright test -c tests/performance/playwright.performance.config.ts
```

`PERFORMANCE_SAMPLE` records `cold` (default), `warm`, or `repeat`. Existing authenticated storage is required; the probe never creates users, sessions, or records. `PERFORMANCE_LOCAL_PROJECT_DETAIL_PATH`, `PERFORMANCE_LOCAL_ESTIMATE_DETAIL_PATH`, and `PERFORMANCE_LOCAL_INVOICE_DETAIL_PATH` are optional Local-only discovery paths. They are rejected for Production and are not click-timing samples.

The real workflow is Dashboard → Projects → Project → Estimate → Invoice → Payment → Expenses → Workers → Schedule. Every hop uses a visible anchor; if a required link is unavailable, the probe emits a blocker and stops rather than operating a button, form, action, or guessed ID.

Production defaults to `PERFORMANCE_PRODUCTION_POLICY=intercept`: all non-GET/HEAD requests and query-string mutating actions are aborted before they reach the target. Playwright interception disables HTTP cache, so artifacts record `cacheMode: "disabled-by-production-interception"`. `PERFORMANCE_PRODUCTION_POLICY=observe` preserves cache and records `cacheMode: "observation-only"`; it is an explicit audit mode that reports any unsafe request and fails the result, not a substitute for the default fail-closed policy. Safe GET nouns such as `/financial/payments` and `/upload-receipt` remain permitted.
