# HH Group Performance Optimization — Phase 2 Shared Bottleneck

Date: 2026-09-03 HST\
Repository: `/Users/solidcore/Desktop/HH Group`\
Deployment: none\
Push: none\
Verdict: **HH GROUP PERFORMANCE OPTIMIZATION = NEEDS FIXES**

## Scope and evidence rules

- The first-round and Phase 3 optimizations were preserved.
- No UI redesign, financial formula/workflow change, security-boundary weakening, cache of financial failures, cross-user cache, service-role cache, database migration, push, or deployment was performed.
- Local soft-navigation evidence is 81 samples: 9 routes × 3 viewports (1440 / 820 / 390) × 3 rounds.
- Local hard-load evidence is 27 samples: 9 routes × 3 viewports. It is a one-pass cold/warm mix and is used to identify the hydration gate, not to claim a stable cold-start percentile.
- Authenticated Production evidence is the preserved deployed BEFORE capture plus a read-only Vercel/Supabase log audit. There is no Production AFTER because this workspace was not deployed.
- Invoice Detail local profiling was not invented: no safe local invoice fixture was available. Its authenticated Production BEFORE evidence is retained.
- For client navigation, “server data complete” means the final destination RSC response completed. A pure page-server duration is not emitted for every route. “React commit” is not hydration on an already-hydrated navigation; hard-load tables show the actual bootstrap boundary.

## Shared bottleneck

The remaining latency is a compound bottleneck, not one slow query:

1. **Global hard-load hydration gate.** The root layout loads the entire `AppShell` with `ssr: false`, and that client shell wraps every route. With JavaScript disabled, authenticated Dashboard produced four shell skeletons and zero `<main>` elements at 1440, 820, and 390. Route data can be ready while useful DOM still waits for the shared client bundle and React bootstrap.
2. **Authentication amplification.** Every protected request pays middleware verification, and selected pages/APIs verify again at the route boundary. The browser Supabase client is singleton-scoped, but middleware, RSC, and post-mount APIs are separate requests and cannot share an in-memory client.
3. **Health polling multiplied the auth/request path.** Production logs in one 25-minute window showed 25 `/api/system-health` requests, 25 nested `/api/schema-check` requests, and 100 `/auth/v1/user` validations. Supabase auth internal compute was fast (median 2.444 ms); repeated edge/function/WAN trips were the cost. This bounded issue was fixed in this phase.
4. **Route-specific broad data graphs remain.** Project Detail still starts 19 top-level workspace loaders for every tab; Dashboard has three serial stages; Expenses performs browser-to-Supabase fan-out; Estimate Detail constructs multiple server clients and performs post-primary reads; Schedule repeats the projects read in its API/helper path.
5. **Production topology magnifies fan-out.** The deployed path includes Hawaii client → `pdx1` ingress → `iad1` functions → Supabase `us-east-2`; Local uses local Supabase. Production also runs Node 24.x while the validated local contract is Node 22.x.

This explains why reducing individual query/request counts did not automatically improve the whole-system FUC or settle median: a route can remove backend work while still waiting on the global client shell, route presentation, repeated auth boundaries, or another post-mount graph.

## Route latency breakdown — Local soft navigation

All values are cross-viewport medians in milliseconds. Each route has 9 samples. The sequence is click → feedback → RSC start → middleware/auth span → destination RSC/data complete → route-specific FUC → first destination React commit → settled.

| Route           | Feedback | RSC start | Auth span | RSC/data complete |       FUC | 1st React commit |   Settled |
| --------------- | -------: | --------: | --------: | ----------------: | --------: | ---------------: | --------: |
| Dashboard       |      4.9 |      18.2 |      50.1 |             115.6 |     404.6 |             84.7 |     867.0 |
| Projects        |      7.2 |      19.5 |      42.8 |              94.4 |     111.1 |            106.4 |     679.6 |
| Project Detail  |      6.7 |      20.0 |      46.4 |             174.3 |     198.1 |            188.2 |     730.9 |
| Estimates       |      8.8 |      18.1 |      45.3 |              84.1 |     106.6 |             80.7 |     572.3 |
| Estimate Detail |      2.3 |      25.7 |      48.6 |             104.4 |     146.9 |            139.5 |     618.2 |
| Revenue / AR    |      6.7 |      21.6 |      50.2 |             129.6 |     135.9 |            123.7 |     605.0 |
| Expenses        |     11.4 |      18.7 |      52.9 |              74.3 |     112.6 |             25.0 |     607.2 |
| Workers         |      5.7 |      19.0 |      43.0 |             112.9 |     131.0 |             24.2 |     686.3 |
| Schedule        |      7.8 |      17.9 |      46.9 |              68.8 |     159.1 |             82.5 |     630.0 |
| **All routes**  |  **6.7** |  **19.5** |  **47.0** |         **104.4** | **135.9** |        **102.4** | **647.4** |

Expenses and Workers commit before their data-ready marker because their client components first render an intermediate shell/pending state. That early commit is visual feedback, not useful-data completion.

### Local request/render breakdown

`u/s` is the statically traced `getUser` / `getSession` work on a full route path including its observed post-mount APIs. Browser-visible auth calls remain zero on a warm soft navigation; the auth work occurs inside middleware/handlers. “Supabase” counts direct browser Supabase resources.

| Route           | Requests | RSC | API | Supabase |             Auth path | Slowest request | Duplicate | Aborted | React commits |
| --------------- | -------: | --: | --: | -------: | --------------------: | --------------: | --------: | ------: | ------------: |
| Dashboard       |       17 |   8 |   0 |        0 |               1u / 1s |         98.5 ms |         0 |       5 |             5 |
| Projects        |        7 |   2 |   1 |        0 |               3u / 2s |        116.4 ms |         0 |       1 |             6 |
| Project Detail  |        3 |   1 |   1 |        0 |               4u / 2s |        155.2 ms |         0 |       0 |             5 |
| Estimates       |        7 |   3 |   0 |        0 |               1u / 1s |         66.6 ms |         0 |       1 |             4 |
| Estimate Detail |       13 |   2 |   0 |        0 |               1u / 1s |         80.0 ms |         0 |       1 |             4 |
| Revenue / AR    |        3 |   2 |   0 |        0 |               2u / 1s |        106.4 ms |         0 |       0 |             4 |
| Expenses        |       26 |   2 |   1 |       17 | 1u / 1s + client auth |         62.1 ms |         4 |       0 |            16 |
| Workers         |        5 |   1 |   3 |        0 |               8u / 4s |        102.9 ms |         0 |       1 |             5 |
| Schedule        |        3 |   1 |   1 |        0 |               3u / 2s |         71.2 ms |         0 |       0 |             4 |

Dashboard’s seven speculative destination RSC requests and 4–6 aborts are real request waste, but the bounded prefetch experiment below showed that removing them did not remove the shared FUC bottleneck.

## Hard-load / hydration breakdown

These are medians across one load at each width. `Main` is first `<main>` insertion, and “1st/last commit” brackets the observed React bootstrap/updates.

| Route           |     Auth | DOM ready |      Main | 1st commit |       FUC | Last commit |   Settled | Commits | Req / RSC / API / Supabase / auth |
| --------------- | -------: | --------: | --------: | ---------: | --------: | ----------: | --------: | ------: | --------------------------------: |
| Dashboard       |     35.1 |     109.0 |     157.1 |      132.6 |     452.4 |       455.6 |   1,066.5 |      12 |                57 / 8 / 0 / 5 / 2 |
| Projects        |     42.2 |      77.7 |     318.6 |      128.0 |     322.0 |       398.1 |     899.6 |      13 |                46 / 1 / 1 / 5 / 2 |
| Project Detail  |     32.1 |     188.9 |     321.0 |      142.0 |     326.8 |       390.6 |     892.7 |      13 |                44 / 1 / 1 / 5 / 2 |
| Estimates       |     44.7 |      79.8 |     175.6 |      136.2 |     181.5 |       236.8 |     740.4 |      11 |                46 / 2 / 0 / 5 / 2 |
| Estimate Detail |     40.2 |      84.4 |     315.2 |      136.2 |     318.9 |       320.4 |     852.3 |      11 |                54 / 2 / 0 / 5 / 2 |
| Revenue / AR    |     29.4 |     116.1 |     311.7 |      121.7 |     315.7 |       314.4 |     845.1 |      12 |                45 / 2 / 0 / 5 / 2 |
| Expenses        |     41.3 |      71.3 |     177.5 |      152.4 |     200.0 |       331.9 |     812.1 |      27 |               71 / 2 / 1 / 22 / 2 |
| Workers         |     39.8 |     151.4 |     170.0 |      131.4 |     172.7 |       247.6 |     747.7 |      12 |                43 / 0 / 3 / 5 / 2 |
| Schedule        |     42.8 |      64.1 |     147.3 |      118.5 |     241.5 |       237.7 |     739.2 |      12 |                42 / 0 / 1 / 5 / 2 |
| **All routes**  | **39.9** |  **92.7** | **177.5** |  **132.2** | **258.1** |   **320.4** | **845.1** |  **12** |            **46 / 2 / 1 / 5 / 2** |

Hard-load commit counts are materially higher than soft navigation (12 vs 5 median). The JavaScript-disabled result—zero `<main>` at every width—is the decisive AppShell evidence.

## Production vs Local

Production is an authenticated historical BEFORE on the old deployment. Production first/warm values are first useful data-ready content; “stable” is DOM-text stability. Local values are current soft-navigation medians, so the comparison is directional, not a valid percent delta.

| Route           | Production first / warm | Production stable first / warm |            Local FUC / settle |
| --------------- | ----------------------: | -----------------------------: | ----------------------------: |
| Dashboard       |           1,564 / 1,252 |                  2,302 / 2,031 |                 404.6 / 867.0 |
| Projects        |             1,211 / 633 |                  3,333 / 2,713 |                 111.1 / 679.6 |
| Project Detail  |           1,421 / 1,146 |                  3,326 / 3,003 |                 198.1 / 730.9 |
| Estimates       |               725 / 574 |                  2,475 / 2,405 |                 106.6 / 572.3 |
| Estimate Detail |               848 / 754 |                  2,360 / 2,010 |                 146.9 / 618.2 |
| Revenue / AR    |             1,197 / 663 |                  2,975 / 1,548 |                 135.9 / 605.0 |
| Invoice Detail  |               879 / 610 |                  2,957 / 2,503 | unavailable — no safe fixture |
| Expenses        |             1,075 / 484 |                  2,921 / 2,973 |                 112.6 / 607.2 |
| Workers         |             1,078 / 851 |                  3,580 / 2,139 |                 131.0 / 686.3 |
| Schedule        |             1,873 / 706 |                  3,892 / 2,758 |                 159.1 / 630.0 |

Production median was 1,138 ms first-tab and 685 ms immediate warm reload. “First-tab” was not a cache-cleared, proven function-cold run. Exact Production RSC start, auth-complete, server-data-complete, hydration, render-count, and browser abort metrics are unavailable and were not inferred from second-resolution Vercel records.

Authenticated Production click samples also remained slow: Project Detail → Estimates reached useful content at 1,637 ms and settled at 1,999 ms; Estimates → Estimate Detail was 1,782 / 2,178 ms; Estimate Detail → AR was 1,176 / 1,547 ms. Invoice Detail’s 424 ms heading was not accepted as FUC because its authoritative payload was still loading.

## Implemented optimization

### Remove health → schema nested HTTP/auth amplification

- **Root cause:** the already owner/admin-authorized `/api/system-health` handler called the separately protected `/api/schema-check` over HTTP. Middleware and handler authorization ran for both requests.
- **BEFORE:** 25 health + 25 schema requests and 100 `/user` validations in the matching Production window; source path contained a nested `fetch("/api/schema-check")`.
- **CHANGE:** extracted the existing read-only schema logic into a server-only `runSchemaCheck` helper. Both public endpoints keep their original authorization checks. The health handler invokes the helper only after its owner/admin guard succeeds. There is no cache and no auth trust transfer.
- **AFTER:** one function request per poll instead of two; the deterministic auth path falls from four `/user` validations to two per poll. Three authenticated local post-change polls returned HTTP 200 with the expected health response shape, the standalone schema endpoint returned HTTP 200 with an array result, and console/page errors were zero. Post-change health resource duration median was 138.1 ms.
- **DELTA:** function/API amplification −50%; `/user` validation amplification −50%; financial/business/UI semantics unchanged.

## Rejected and reverted experiment

Dashboard quick-action `Link` prefetch was disabled as a bounded experiment.

| Metric                  |   BEFORE | Experiment |           Delta |
| ----------------------- | -------: | ---------: | --------------: |
| Dashboard requests      |       17 |          2 |          −88.2% |
| Dashboard RSC           |        8 |          1 |          −87.5% |
| Dashboard aborted       |        5 |          1 |          −80.0% |
| Dashboard FUC           | 404.6 ms |   387.8 ms |           −4.2% |
| Dashboard settle        | 867.0 ms |   846.5 ms |           −2.4% |
| All-route FUC median    | 135.9 ms |   144.9 ms | **+6.6% worse** |
| All-route settle median | 647.4 ms |   652.5 ms | **+0.8% worse** |

Because the global FUC criterion did not improve, the product change and its temporary test were fully reverted. This is evidence that request-count reduction alone is not the shared critical-path fix.

## Server/data findings

- Dashboard: approximately 15+ reads in three serial stages; several global helpers create fresh server clients rather than using the route’s request-scoped client.
- Project Detail: auth → project → canonical/cost → 19 parallel top-level loaders; inner helpers produce roughly 30–40 reads for a typical populated project. Inactive tabs remain eager.
- Estimate Detail: roughly 13–16 reads, three separately created admin clients, and invoice-link/summary work after the primary loader group.
- AR: approximately four reads after auth but global invoice/items/payments scans for an outstanding-only page.
- Invoice Detail: approximately 6–7 database reads plus N storage signing calls for N attachments. Its Phase 3 server-initial-data path remains intact.
- Expenses: 17 direct browser Supabase resources on soft navigation and 22 on hard load; four/six duplicate resource paths and 16/27 React commits. Missing payment-account names can trigger a real N+1 fallback.
- Workers: server list work is batched, but the page still launches three post-mount APIs; the old worker-balance N+1 fix remains intact.
- Schedule: the route and helper both read projects; data begins after client mount.

No missing index is proven by source inspection. No migration was made. Candidates for representative local `EXPLAIN (ANALYZE, BUFFERS)` are `(labor_entries.project_id, work_date DESC)`, `expense_lines.project_id`, invoice child foreign keys by `invoice_id`, and project-detail tables filtered/ordered by `project_id`. Approval is required before any schema/index change.

## Client/React findings

- 295 files declare `use client`.
- Current first-load JS: shared 88.4 kB; Dashboard 97.3; Projects 167; Project Detail 330; Estimates 160; Estimate Detail 357; AR 158; Invoice Detail 230; Expenses 380; Workers 170; Schedule 162 kB.
- AppShell eagerly mounts global navigation, auth/profile, theme, overlays, scroll-lock recovery, and system-health providers. The shell watches pathname/search changes, so it remains a broad update surface.
- The current `hh:app-sync` recursion is fixed. Audited subscribers check `refreshScheduled` and use the non-re-emitting RSC refresh path. It is not reported as a current bottleneck.
- No long tasks were observed in the 81 soft-navigation samples. Table virtualization, responsive duplicate trees, and speculative memoization therefore remain measurement-required rather than approved edits.

## Before → After conclusion

- Phase 1’s 45-cell series moved from 137.4 / 805.5 ms FUC/settle to 195.9 / 860.3 ms and did **not** prove global improvement, although it reduced Dashboard request/RSC/abort counts.
- The later Phase 3 checkpoint and this broader route series use different route sets and fixtures; they cannot support an honest percentage improvement claim.
- Current complete local series: 135.9 ms FUC median, 647.4 ms settle median, 7 requests, 2 RSC, 5 React commits, and zero console/page/non-2xx errors.
- The implemented health-chain fix is a measured request/auth amplification improvement but occurs after the initial 1.2-second poll delay; it is expected to help background settle/load rather than the current soft-navigation FUC median.
- Production AFTER is unavailable because deployment was explicitly forbidden.

## Remaining bottlenecks

1. **P0 BUNDLE/HYDRATION:** decompose AppShell into a server-rendered structural shell plus small browser-only islands. Do not repeat the previously failed global SSR flip; identify and move `window`, `document`, `localStorage`, media-query, auth-provider, mobile-nav, and portal effects one bounded island at a time.
2. **P0 ENVIRONMENT/PRODUCTION:** capture authenticated Production AFTER with exact browser RSC/API/auth stages and Vercel function spans after an approved deployment. Current Production evidence is old-code BEFORE only.
3. **P1 DATA FETCHING:** Project Detail inactive-tab deferral and canonical summary reuse, preserving fail-closed financial semantics.
4. **P1 CLIENT/REACT:** Expenses server-initial-data/batched read design; it is the dominant direct-Supabase and commit-count outlier.
5. **P1 AUTH/SESSION:** reduce route/API fan-out before considering auth changes. Do not trust middleware headers or replace server verification without a cryptographically equivalent boundary.
6. **P1 NETWORK/RSC:** Dashboard speculative RSC policy needs a demand-driven or idle-budgeted design with another measured A/B; the blanket `prefetch={false}` experiment was insufficient.
7. **P1 SERVER/DATA:** Dashboard serial stages, Estimate Detail client/client construction, Schedule duplicate project reads, and Invoice attachment signing fan-out.
8. **P2 TABLE/LIST:** profile representative large financial and workforce fixtures before pagination/virtualization changes.

## Verification

- Optimized production build: PASS, 145 / 145 static pages.
- TypeScript: PASS.
- ESLint: PASS, zero warnings/errors.
- Unit suite after the bounded health refactor: 1,135 PASS / 10 skipped across 168 files (167 PASS / 1 skipped).
- Source/design/security contracts after the bounded health refactor: 183 / 183 PASS.
- Authenticated local health QA: 3 / 3 HTTP 200, expected response shape, zero console/page errors.
- Standalone authenticated schema-check: HTTP 200, status `ok`, `missing` remained an array.
- Financial unexpected delta: ZERO by code scope and regression suite.
- Business behavior changes: NONE.
- Security boundary changes: NONE; both public routes retain their original guards.
- Frozen UI/UX architecture changes: NONE.

## Final determination

The shared cause is now explained and one evidenced global amplification path is fixed. The success criterion “core navigation FUC median clearly better than the prior baseline” is not yet proven on a comparable full series, and Production AFTER cannot exist without deployment authorization. The AppShell hydration gate and route-specific broad graphs remain.

**HH GROUP PERFORMANCE OPTIMIZATION = NEEDS FIXES**
