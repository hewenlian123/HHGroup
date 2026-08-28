# HH Group Password Recovery OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the time- and browser-bound recovery PKCE dependency for new emails with Supabase's supported recovery OTP exchange while retaining safe PKCE compatibility.

**Architecture:** New recovery emails link to the exact trusted callback and contain a one-time code. A same-origin server route verifies the email/code with `verifyOtp(type: "recovery")`, validates the authorized role, sets the existing user/session-bound recovery cookie, and returns a fixed reset-page destination.

**Tech Stack:** Next.js App Router, TypeScript, React, `@supabase/ssr`, Supabase Auth, Vitest, Playwright, local Docker Supabase, Mailpit.

---

### Task 1: Lock the recovery template contract with failing tests

**Files:**

- Create: `supabase/templates/recovery.html`
- Modify: `supabase/config.toml`
- Modify: `src/__tests__/auth-migration-contract.test.ts`

- [ ] **Step 1: Add a failing contract test**

Assert that the local recovery template is configured, uses `{{ .RedirectTo }}` and
`{{ .Token }}`, and excludes `ConfirmationURL`, `TokenHash`, access tokens, and client-provided
hosts.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
npx vitest run src/__tests__/auth-migration-contract.test.ts
```

Expected: failure because the recovery template and config entry do not exist.

- [ ] **Step 3: Add the minimal local template**

Configure:

```toml
[auth.email.template.recovery]
subject = "Reset Your Password"
content_path = "./supabase/templates/recovery.html"
```

The HTML button must use `href="{{ .RedirectTo }}"` and the code text must use
`{{ .Token }}`.

- [ ] **Step 4: Re-run the contract test and verify GREEN**

Run:

```bash
npx vitest run src/__tests__/auth-migration-contract.test.ts
```

Expected: all contract tests pass.

### Task 2: Add the server-side recovery OTP exchange

**Files:**

- Create: `src/app/api/auth/recovery/verify/route.ts`
- Create: `src/lib/auth-recovery-verification.ts`
- Modify: `src/__tests__/api/auth-recovery-callback.test.ts`

- [ ] **Step 1: Add failing API tests**

Cover:

```ts
verifyOtp({ email: "owner@example.test", token: "123456", type: "recovery" });
```

and assert:

- same-origin POST is required;
- invalid input and Supabase failures return the same generic response;
- a successful authorized owner result sets Supabase cookies and `hh_recovery_session`;
- an authenticated non-owner result is rejected;
- redirect output is exactly `/reset-password`;
- no input code or email is returned or logged.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/__tests__/api/auth-recovery-callback.test.ts
```

Expected: module/route not found failures.

- [ ] **Step 3: Implement the minimal verifier**

The route validates the same-origin request, validates email/code shape, creates a response-bound
Supabase SSR client, calls `verifyOtp`, checks `authorizedAppRole`, derives the Supabase session ID,
creates the existing signed recovery token, and sets the existing HttpOnly cookie. It never accepts
or returns a caller-selected redirect.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/__tests__/api/auth-recovery-callback.test.ts
```

Expected: all recovery callback and OTP exchange tests pass.

### Task 3: Add the OTP verification form and compatible callback branch

**Files:**

- Modify: `src/lib/auth-callback-handler.ts`
- Modify: `src/app/forgot-password/page.tsx`
- Modify: `src/app/forgot-password/forgot-password-form.tsx`
- Modify: `src/__tests__/api/auth-recovery-callback.test.ts`
- Modify: `src/__tests__/api/password-security-routes.test.ts`

- [ ] **Step 1: Add failing UI and callback tests**

Assert that a trusted recovery callback with no code redirects only to
`/forgot-password?mode=verify`, provider errors still go to the safe invalid state, and the verify
form posts `{ email, token }` to `/api/auth/recovery/verify`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/__tests__/api/auth-recovery-callback.test.ts src/__tests__/api/password-security-routes.test.ts
```

Expected: callback destination/form expectations fail.

- [ ] **Step 3: Implement the minimal UI branch**

Parse `mode=verify` on the server page and render an accessible six-digit one-time-code input in
the existing Warm Graphite card. Keep the email-send form unchanged in normal mode. On successful
verification, navigate only to the response's fixed `/reset-password` value.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/__tests__/api/auth-recovery-callback.test.ts src/__tests__/api/password-security-routes.test.ts
```

Expected: all focused tests pass.

### Task 4: Prove browser and local Docker behavior

**Files:**

- Modify: `tests/auth-recovery-routing.spec.ts`

- [ ] **Step 1: Add failing Playwright coverage**

Use Mailpit to read the newest local recovery email without logging its code. Cover:

- immediate OTP verification;
- an artificial delay beyond ten minutes at the application boundary;
- a second Playwright browser context for email-to-browser handoff;
- Chromium and WebKit project compatibility;
- valid reset form, refresh, replay rejection, and normal-session misuse;
- no token-like value in URL, visible body text beyond the dedicated code input, or console logs.

- [ ] **Step 2: Run the recovery suite and verify RED**

Run:

```bash
npx playwright test tests/auth-recovery-routing.spec.ts
```

Expected: the new OTP cases fail before form/API implementation is complete.

- [ ] **Step 3: Finish only the behavior required by failing cases**

Keep all existing password-update, session revocation, role, and cookie-clearing behavior intact.

- [ ] **Step 4: Run local gates**

Run:

```bash
npm run lint
npx tsc --noEmit
npx vitest run src/__tests__/api/auth-recovery-callback.test.ts src/__tests__/api/password-security-routes.test.ts src/__tests__/auth-migration-contract.test.ts
npx playwright test tests/auth-recovery-routing.spec.ts
```

Expected: all commands exit zero.

### Task 5: Commit, Preview, and hosted template verification

**Files:**

- Modify: `docs/AUTH_RECEIPT_PRODUCTION_ROLLOUT.md`
- Include only files listed by Tasks 1–4 plus the design and plan documents.

- [ ] **Step 1: Document hosted template and rollback**

Add the exact hosted recovery template fields, the one-hour OTP expiry gate, the prefetch-safe
reasoning, and restoration instructions for the prior template.

- [ ] **Step 2: Run the complete focused Auth regression gate**

Run:

```bash
git diff --check
npm run lint
npx tsc --noEmit
npx vitest run src/__tests__/api/auth-recovery-callback.test.ts src/__tests__/api/password-security-routes.test.ts src/__tests__/auth-migration-contract.test.ts
npx playwright test tests/auth-recovery-routing.spec.ts tests/auth-boundary.spec.ts
```

Expected: all commands exit zero.

- [ ] **Step 3: Create one focused commit and push it**

Stage only the listed Auth/template/test/design/runbook files. Keep
`supabase/.temp/cli-latest` unstaged. Commit with:

```bash
git commit -m "fix(auth): use reliable recovery otp"
```

Push the current `codex/receipt-quality-prod` branch and verify the remote SHA exactly matches the
new commit.

- [ ] **Step 4: Deploy the exact SHA to an immutable Preview**

Set Preview-only compatibility mode and independent Sensitive session/device secrets, redeploy the
exact SHA, add its three exact Supabase redirects, and confirm READY without changing the
production alias.

- [ ] **Step 5: Update the hosted recovery template and run one-email verification**

Set the hosted recovery subject/body to the tested template, confirm OTP expiry is 3600 seconds,
send exactly one owner recovery email, transfer only the newest OTP directly from the authenticated
mail UI to the Preview verification form, and verify the valid reset form without changing the
owner password.
