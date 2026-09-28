# HH Group Estimate Historical Playwright Contract Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the full historical Estimate Playwright suite to the current Certified V2 contracts, explain every failure, preserve all financial and workflow semantics, and rerun the complete local Pre-Deploy Release Gate.

**Architecture:** Treat Certified V2/Figma mapping and the HH Design System as presentation authority, and current production-equivalent code as behavior authority. Establish a deterministic local Playwright environment first, capture a single-worker full-suite baseline, then change only the layer named by each evidence-backed classification: obsolete tests, missing fixtures, test tooling, flaky synchronization, or a test-first product regression fix.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest, Playwright 1.58, local Supabase, Node.js 22, bundled Poppler/PDF tooling.

**Spec:** User-provided “HH Group Estimate Historical Playwright Contract Migration” request in the current task.

## Global Constraints

- Certified V2 Foundation, Certified Estimate UX, Real-World QA closure, financial persistence P0 closure, and current production-equivalent business behavior are authoritative.
- OBSOLETE UI CONTRACT means update or delete the test; never restore Dark/Neo/Graphite-era chrome, retired DOM, retired Sidebar, retired Pricing interaction, or an old screenshot.
- REAL REGRESSION means write/watch a focused failing test, then apply the smallest product-code fix.
- MISSING FIXTURE means repair the owning local sanitized fixture and its exact cleanup; never depend on leftover rows or broad deletion.
- ENVIRONMENT / TOOLING means repair Playwright/local runtime configuration; do not change Estimate product behavior.
- FLAKY TEST means replace race-prone selectors or arbitrary timing with condition-based waiting/root-cause synchronization; never raise thresholds or loosen assertions.
- Preserve `qty × unitCost`, `subtotal + tax − discount`, fixed-dollar payment milestones, category/item ordering and associations, revision identity, Auth-attributed activity, atomic persistence, and Draft/Sent workflow semantics.
- EST-0063 must remain: subtotal 1020.01, tax 48.06, discount 106.81, total 961.26, deposit 384.50, final 576.76, remaining 0.00.
- Full Estimate Playwright requires zero unexplained failures and zero unexpected console/page errors.
- Do not commit, push, deploy, modify Production, or change financial formulas/workflow semantics.

---

### Task 1: Make the Local Playwright Web Server Deterministic

**Files:**

- Create: `src/__tests__/playwright-webserver-env.test.ts`
- Create: `tests/e2e-webserver-env.ts`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: `process.env` after `loadE2EProcessEnv()` and the current local-only E2E auth helper.
- Produces: `buildPlaywrightWebServerEnv(source: NodeJS.ProcessEnv): Record<string, string>` with trimmed Supabase keys and `HH_ALLOW_LOCAL_AUTO_LOGIN="0"` for the spawned E2E server.

- [ ] **Step 1: Write the failing config-boundary test**

  Create a Vitest case that supplies `HH_ALLOW_LOCAL_AUTO_LOGIN: "1"`, blank server keys, and a local Supabase URL; assert the returned web-server env disables auto-login, retains the local URL, and omits blank keys. The production break it catches is a protected readiness probe entering local auto-login redirects instead of reaching a stable login/readiness response.

- [ ] **Step 2: Run the test and verify RED**

  Run `fnm exec --using=22 npx vitest run src/__tests__/playwright-webserver-env.test.ts`. Expected: FAIL because `tests/e2e-webserver-env.ts` does not exist.

- [ ] **Step 3: Implement the minimal environment helper**

  Move the existing copy/trim behavior out of `playwright.config.ts` into `buildPlaywrightWebServerEnv`, set only the spawned server's `HH_ALLOW_LOCAL_AUTO_LOGIN` to `"0"`, and import the helper from the Playwright config. Do not change middleware, the local auto-login product feature, auth strictness, or E2E browser session creation.

- [ ] **Step 4: Verify GREEN and the original symptom**

  Run the focused Vitest case, then run `tests/estimate-section.spec.ts` with Node 22, `E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0`, one worker, local base URL, and bundled binary PATH. Require webServer readiness plus the test result; a timeout does not pass.

### Task 2: Capture and Classify the Full Historical Baseline

**Files:**

- Inspect: `tests/estimate*.spec.ts`
- Inspect: `test-results/**` and the JSON reporter output in `/private/tmp`
- Record: this plan's `.superpowers/sdd/.../progress.md` ledger

**Interfaces:**

- Consumes: deterministic Task 1 environment, local Supabase, Node 22, bundled Poppler.
- Produces: one row per failed test with exact file/title/error/artifact and one of `OBSOLETE UI CONTRACT`, `REAL REGRESSION`, `MISSING FIXTURE`, `ENVIRONMENT / TOOLING`, or `FLAKY TEST`.

- [ ] **Step 1: Run all 139 collected Estimate Playwright tests once**

  Run `env -u CI E2E_BASE_URL=http://localhost:3000 E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0 PW_WORKERS=1 PLAYWRIGHT_JSON_OUTPUT_FILE=/private/tmp/hh-estimate-historical-baseline.json PATH=<bundled override>:<bundled fallback>:$PATH fnm exec --using=22 npx playwright test tests/estimate*.spec.ts --project=chromium --reporter=line,json`.

- [ ] **Step 2: Preserve the first-run failure evidence**

  Record the exit code, expected/unexpected/flaky/skipped counts, exact error stacks, traces/screenshots/videos, console errors, page errors, and whether each fixture existed. Do not overwrite the first-run JSON with a retry.

- [ ] **Step 3: Classify by authority and root cause**

  Compare each failing assertion with `docs/FIGMA_CODE_MAPPING_V2.md`, `src/styles/hh-design-system-v2.css`, canonical layout/shared components, current behavior owners, and EST-0063 financial authority. Record the evidence supporting the classification before proposing a change.

- [ ] **Step 4: Confirm flaky candidates scientifically**

  For timing/race candidates only, rerun the exact failed test with trace enabled under the same one-worker environment. A passing retry remains recorded as a failure until the race root is located and repaired.

### Task 3: Migrate Only Proven Obsolete UI Contracts

**Files:**

- Candidate modify/delete: `tests/estimate-final-cohesion.spec.ts`
- Candidate modify: `tests/estimate-edit-hierarchy-regression.spec.ts`
- Candidate modify: `tests/estimate-p0-responsive.spec.ts`
- Candidate modify/delete: `tests/estimate-premium-visual-lock-in.spec.ts`
- Candidate modify/delete: `tests/estimate-premium-visual-refinement.spec.ts`
- Authority: `tests/figma-ui-v2-estimate-phase2-contract.test.mjs`
- Authority: `tests/estimate-v2-predeploy-hardening-contract.test.mjs`

**Interfaces:**

- Consumes: only Task 2 failures classified `OBSOLETE UI CONTRACT`.
- Produces: current V2 role/state/responsive assertions with all user-visible navigation, accessibility, overflow, focus, and workflow coverage retained.

- [ ] **Step 1: Name the break each retained test catches**

  Before editing each test, state the current product regression that would make it fail. Exact old RGB values, page-local `.eb-*` tree shape, and superseded fixed geometry that can fail only after an intentional V2 redesign do not qualify.

- [ ] **Step 2: Replace obsolete implementation assertions**

  Assert accessible roles/names, V2 token-backed states, canonical Global Shell/single Sidebar, configured viewport overflow/touch behavior, and Preview/Print document separation. Remove a whole test only when its remaining assertions duplicate a current V2 authority test and catch no independent break.

- [ ] **Step 3: Preserve nonvisual contracts**

  Keep save/preview/navigation, keyboard focus, payment, lifecycle, revision, PDF content, responsive usability, and error-channel assertions even when their selector roots change.

- [ ] **Step 4: Run every changed spec immediately**

  Run each changed file under the Task 1 environment; require zero unexpected console/page errors and preserve failure artifacts if the migrated assertion exposes a real V2 regression.

### Task 4: Repair Fixtures, Tooling, Flakes, or Real Regressions at Their Owning Layer

**Files:**

- Candidate fixture owner: `tests/estimate-print-density.spec.ts`
- Candidate fixture consumer: `tests/estimate-premium-visual-lock-in.spec.ts`
- Candidate PDF tooling consumers: `tests/estimate-revision-document-integrity.spec.ts`, `tests/estimate-historical-preview-compatibility.spec.ts`
- Modify only the exact failed spec/helper or product owner named by Task 2 evidence.

**Interfaces:**

- Consumes: Task 2 failures not classified obsolete.
- Produces: self-owned fixed fixtures, deterministic condition waits/selectors, local-only tooling resolution, or a focused TDD product fix.

- [ ] **Step 1: Repair a missing fixture at the fixture boundary**

  If EST-0079 or another fixture is absent, create the exact sanitized graph in that spec/helper before the test and delete only its exact marked IDs in teardown. Keep hand-derived expected totals/pagination; do not seed through product UI merely to satisfy a visual test.

- [ ] **Step 2: Repair PDF/tooling failures without product changes**

  Run PDF specs with the bundled override/fallback binary PATH. If the runner still cannot resolve `pdftotext`, add a test helper that resolves the configured/bundled executable and emits an explicit environment error; do not change Preview/Print/PDF rendering to hide the tool failure.

- [ ] **Step 3: Repair flaky synchronization at root cause**

  Replace arbitrary sleeps/unstable class selectors with accessible/current roots and `expect.poll`, response/state, URL, or visible-state conditions tied to the actual transition. Do not increase timeouts, retries, screenshot thresholds, or tolerances.

- [ ] **Step 4: Repair a real product regression with RED-GREEN**

  For a confirmed product failure, add the smallest automated reproduction, run it to the expected failure, make one minimal product change, then rerun the focused case and its financial/workflow regression. No product code may be edited for an obsolete, fixture, tooling, or flaky classification.

### Task 5: Prove Financial, V2, and Full Historical Contract Closure

**Files:**

- Verify: `src/__tests__/estimate-*.test.ts`
- Verify: `src/__tests__/lib/estimate-*.test.ts`
- Verify: `src/__tests__/lib/estimates-*.test.ts`
- Verify: `tests/estimate-financial-persistence-hardening.spec.ts`
- Verify: all `tests/estimate*.spec.ts`

**Interfaces:**

- Consumes: final migration diff and the same sanitized fixtures/environment used for baseline.
- Produces: zero-delta amount ledger, 139-test full-suite result, and zero unexpected console/page errors.

- [ ] **Step 1: Run the full Estimate Vitest family**

  Run `fnm exec --using=22 npx vitest run src/__tests__/estimate-*.test.ts src/__tests__/lib/estimate-*.test.ts src/__tests__/lib/estimates-*.test.ts`.

- [ ] **Step 2: Reconcile EST-0063**

  Run the financial persistence hardening spec and record exact Detail/List/Preview/Print/Payment values plus persisted tax, discount, category/item ordering, milestone amounts/statuses, and remaining balance. Every required delta must be exactly zero.

- [ ] **Step 3: Run the complete historical Estimate Playwright suite fresh**

  Run all `tests/estimate*.spec.ts` on Chromium, one worker, Node 22, a fresh spawned localhost server, local Supabase, and bundled PDF PATH. Require zero unexpected failures, zero flaky results, and zero unexpected console/page errors.

- [ ] **Step 4: Run the Certified UX supplemental gate**

  Run `tests/estimate-ux-refinement.spec.ts` under the same environment and record the 1440/1280/820/390 results, overflow, focus/touch behavior, Preview/Print/PDF, and error channels.

### Task 6: Run the Complete Local Pre-Deploy Release Gate and Review

**Files:**

- Verify: entire current working tree
- Inspect: final diff and status only; do not stage or commit

**Interfaces:**

- Consumes: Tasks 1–5 closure.
- Produces: final `HISTORICAL TEST MIGRATION`, `PRE-DEPLOY HARDENING`, and `RELEASE` verdicts.

- [ ] **Step 1: Run repository pre-deploy checks on Node 22**

  Run, separately and record each exit code: `npm run check:migration-filenames`, `npm run check:migration-order`, `npm run check:schema-preflight:strict`, `npm run check:schema-vs-code`, `npm run test:unit`, `npm run format:check`, `npm run lint:ci`, `npm run typecheck`, `npm run build`, and `node scripts/guard-no-test-data-push.mjs`.

- [ ] **Step 2: Inspect final repository safety**

  Run `git diff --check`, `git status --short`, inspect the task diff, and confirm no secret, generated artifact, Production configuration, financial formula, or workflow-semantic change was introduced.

- [ ] **Step 3: Obtain independent final review**

  Provide the plan, ledger, implementer reports, and full diff package to a review agent. Resolve all Critical/Important findings through the SDD fix/re-review loop; record any rulings explicitly.

- [ ] **Step 4: Issue evidence-backed verdicts**

  Report `HISTORICAL TEST MIGRATION = PASS / NEEDS FIXES`, `PRE-DEPLOY HARDENING = PASS / NEEDS FIXES`, and `RELEASE = READY / BLOCKED`. Any failed, blocked, unexplained, flaky, console/page-error, financial-delta, or missing required gate forces the applicable non-pass verdict.
