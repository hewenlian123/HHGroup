# HH system navigation performance baseline

This read-only Playwright probe records navigation timing and diagnostics without changing UI, business data, authentication, or database state. It uses the existing authenticated storage state and navigates only through visible `<a>` links.

Run the local baseline with:

```sh
E2E_BASE_URL=http://localhost:3000 npx playwright test -c tests/performance/playwright.performance.config.ts
```

Set `E2E_PERFORMANCE_STORAGE_STATE` only when an existing authenticated storage-state file is needed. The probe never creates users, sessions, test records, or database data.

Each target, viewport, and run produces `navigation-performance.json` in that test's Playwright output directory. The result contains canonical-route metadata, `clickToFeedbackMs`, `clickToRouteStartMs`, `routeStartToUsefulContentMs`, `fullSettleMs`, request inventory, duplicate/aborted/slow request summaries, and console/page/request errors.

The target list is selected from `HH_PROJECT_OS_NAV_SECTIONS`; the detail measurement opens an actually visible project link and never hard-codes a project identifier. Useful-content locators are route-specific selectors from the current UI, with a visible main-content fallback.

For a Production baseline, use the same command with `E2E_BASE_URL=https://hhprojectgroup.com`. Every request is intercepted: non-`GET`/`HEAD` methods and URLs/actions classified as mutating are aborted and make the probe fail. The probe does not click buttons, submit forms, or invoke actions.
