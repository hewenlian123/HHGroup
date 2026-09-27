# HH Group Estimate V2 Pre-Deploy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Certify the current Estimate V2 and V2 Foundation change set, then create a certified branch, commit, push, deploy to Vercel Production, and smoke-test the deployed artifact only if every release gate passes.

**Architecture:** Treat Figma/HH V2 as visual authority and the current Estimate implementation as business authority. Limit hardening to evidence-backed cleanup and P0/P1 fixes, preserve the EST-0063 financial ledger, and separate local certification from release and post-deploy verification.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind/CSS tokens, Supabase-backed Estimate actions, Vitest, Playwright, Vercel CLI.

**Spec:** User-provided “HH Group Estimate V2 Pre-Deploy Hardening Pass” request in the current task.

## Global Constraints

- Scope is current Estimate V2 plus V2 Foundation; do not refactor unrelated modules.
- Do not modify DB/schema, Auth, API business contracts, financial formulas, or Estimate workflow semantics.
- Delete only residue proven to have no references and no runtime purpose.
- EST-0063 must remain: subtotal 1020.01, tax 48.06, discount 106.81, total 961.26, deposit 384.50, final 576.76, remaining 0.00.
- Release requires P0=0, P1=0, console/page errors=0, build PASS, financial delta=0, and business behavior changes=NONE.
- Do not commit, push, or deploy before all local gates pass.

---

### Task 1: Establish the Release Baseline and Scope

**Files:**

- Inspect: `AGENTS.md`
- Inspect: `docs/FIGMA_CODE_MAPPING_V2.md`
- Inspect: `src/styles/hh-design-system-v2.css`
- Inspect: `src/app/estimates/**`
- Inspect: `src/components/{base,layout,ui}/**`
- Inspect: `tests/estimate-*.spec.ts`

**Interfaces:**

- Consumes: Current dirty working tree, Figma-to-code mapping, EST-0063 fixture.
- Produces: Exact in-scope file inventory, current branch/HEAD/status, release-gate matrix.

- [ ] **Step 1: Capture repository identity and dirty state**

  Run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --stat`, and `git diff --check`.

- [ ] **Step 2: Confirm release and environment configuration**

  Inspect `package.json`, `playwright.config.ts`, `next.config.mjs`, `vercel.json`, `.vercel/project.json`, and Git remotes without exposing secrets.

- [ ] **Step 3: Record the browser matrix**

  Use `/estimates`, `/estimates/<id>`, Preview, Print/PDF, Draft/Sent, and 1440/1280/820/390 viewports; capture console, page errors, and horizontal overflow.

### Task 2: Audit Residuals and Code Quality Without Speculative Cleanup

**Files:**

- Inspect: `src/app/estimates/**/*.tsx`
- Inspect: `src/app/estimates/**/*.css`
- Inspect: `src/styles/hh-design-system-v2.css`
- Inspect: `src/components/{base,layout,ui}/**`
- Test: `tests/figma-ui-v2-*.test.mjs`
- Test: `tests/hh-v2-foundation-*.{mjs,tsx}`

**Interfaces:**

- Consumes: Task 1 scope and HH/Figma authorities.
- Produces: Proven residual list, P0/P1/P2 issue list, and safe cleanup candidates.

- [ ] **Step 1: Scan references and residue**

  Use `rg` to find Neo/Dark/Gold/glass runtime classes, debug logs, TODO/FIXME markers, duplicate selectors/tokens, stale overrides, temporary QA helpers, and unused Estimate exports/imports.

- [ ] **Step 2: Audit async and React behavior**

  Review mutation result contracts, pending-save tracking, effects/dependencies, debounced refresh, focus restoration, stable callbacks, reorder state, and unmount cleanup.

- [ ] **Step 3: Audit CSS cascade and component boundaries**

  Check selector duplication, specificity, breakpoint ordering, token-only color use, shared component reuse, one Global Shell/Sidebar, and Estimate-local overrides.

- [ ] **Step 4: Classify every finding**

  Mark each item P0/P1/P2 or proven dead residue. Do not delete any item without an `rg`/runtime/test evidence chain.

### Task 3: Apply Only Proven P0/P1 or Safe Residual Fixes

**Files:**

- Modify only files identified by Task 2 evidence.
- Test: focused `src/__tests__/estimate-*.test.ts` or `tests/estimate-*.spec.ts` cases.

**Interfaces:**

- Consumes: Task 2 findings.
- Produces: Minimal diff that preserves business and financial contracts.

- [ ] **Step 1: Write or identify the failing regression**

  Run the narrowest relevant Vitest or Playwright case and retain the original failure output.

- [ ] **Step 2: Implement the minimum fix**

  Preserve fields, calculations, persistence, API/DB mapping, workflow states, global tokens, and shared shell semantics.

- [ ] **Step 3: Rerun the focused test**

  Require a clean exit with the original symptom asserted; never weaken the assertion.

- [ ] **Step 4: Run the Impeccable detector once after UI edits**

  Run `node /Users/solidcore/.agents/skills/impeccable/scripts/detect.mjs --json <changed UI targets>` and resolve only in-scope findings.

### Task 4: Execute Runtime and Financial Certification

**Files:**

- Test: `tests/estimate-ux-refinement.spec.ts`
- Test: Estimate calculation, lifecycle, payment, preview, surface, reorder, and mutation-result unit suites.
- Artifact directory: `/private/tmp/hh-estimate-v2-predeploy`

**Interfaces:**

- Consumes: Final local source tree and EST-0063.
- Produces: Browser screenshots/PDF, console/page-error records, amount ledger, and responsive measurements.

- [ ] **Step 1: Run full real-browser Estimate workflow**

  Exercise List, open, edit, save states, Cancel/Close/Escape, keyboard flow, reorder, Pricing/Payment/Details, Preview, Print/PDF, and Draft/Sent identity.

- [ ] **Step 2: Run the responsive matrix**

  Verify 1440, 1280, 820, and 390 with zero horizontal overflow and correct focus/touch behavior.

- [ ] **Step 3: Reconcile EST-0063**

  Compare UI, persisted source, Preview, Print, and PDF values to the exact baseline; any unexplained delta fails certification.

- [ ] **Step 4: Review color and motion**

  Inspect computed foreground/background/focus pairs, forced-colors semantics, reduced-motion behavior, duration/easing, and animation properties.

### Task 5: Run Final Local Release Gates

**Files:**

- Verify: entire current source tree.

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces: One fresh all-green gate record or a deployment block.

- [ ] **Step 1: Run typecheck and lint**

  Run `npm run typecheck` and `npm run lint`; require zero errors and classify warnings.

- [ ] **Step 2: Run Estimate unit and Playwright regression**

  Run the declared Estimate Vitest suites and full `tests/estimate-ux-refinement.spec.ts` Chromium suite.

- [ ] **Step 3: Run production build**

  Run standard `npm run build` using Node 22; require exit code 0.

- [ ] **Step 4: Inspect final diff**

  Run `git diff --check`, `git status --short`, secret/generated-artifact checks, and verify that migrations/DB/API/Auth/formulas/workflows were not altered.

### Task 6: Create the Certified Release Commit and Push

**Files:**

- Stage only the audited V2 Foundation, Estimate V2, tests, mapping, and this plan.

**Interfaces:**

- Consumes: All-green Task 5 gate.
- Produces: Certified branch, one release commit SHA, and pushed remote branch/commit.

- [ ] **Step 1: Create or confirm the certified branch**

  Use a `codex/`-prefixed certified branch without rewriting history.

- [ ] **Step 2: Stage the reviewed manifest only**

  Exclude `.env`, build output, logs, temporary artifacts, duplicate migration/environment debris, and unrelated user files.

- [ ] **Step 3: Review the staged diff and commit**

  Run `git diff --cached --check`, inspect `git diff --cached --stat`, then create one scoped release commit.

- [ ] **Step 4: Push normally**

  Push the certified branch without force. If rejected, stop and investigate; do not rewrite remote history.

### Task 7: Deploy and Smoke-Test Vercel Production

**Files:**

- Inspect: `.vercel/project.json`
- Inspect: Vercel deployment metadata/logs.

**Interfaces:**

- Consumes: Pushed certified commit.
- Produces: Production deployment URL/ID/SHA and post-deploy smoke verdict.

- [ ] **Step 1: Confirm Vercel identity and project link**

  Run `vercel whoami` and inspect the linked project/team without relinking.

- [ ] **Step 2: Deploy the committed tree to Production**

  Run `vercel deploy --prod --yes` from the linked project and capture the immutable deployment URL.

- [ ] **Step 3: Wait for READY and inspect**

  Run `vercel inspect <deployment-url> --wait` and inspect build/runtime errors.

- [ ] **Step 4: Run Production smoke**

  Verify login, Estimates List, open Estimate, Save, Preview, PDF, and basic desktop/mobile responsiveness without destructive Production operations.

- [ ] **Step 5: Report release evidence**

  Return hardening verdict, release verdict, commit SHA, deployment identifier/SHA, Production URL, smoke results, and any remaining P2 debt.
