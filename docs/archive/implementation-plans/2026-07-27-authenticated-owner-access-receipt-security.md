# Authenticated Owner Access and Receipt Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace anonymous production owner access with Supabase email/password sessions, add session-bound trusted-device PIN controls, and secure expense receipt viewing and replacement through authenticated server routes and private Storage.

**Architecture:** `@supabase/ssr` cookie sessions become the sole production identity boundary, with owner/admin authorization from server-owned app metadata. A six-digit PIN can unlock only an already-valid Supabase session. Receipt references remain source-compatible but all new replacements store private paths and use an optimistic database transaction plus compensating cleanup.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase Auth/Postgres/Storage, `@supabase/ssr`, Tailwind/shadcn, Vitest, Playwright, local Docker Supabase.

**Execution constraint:** The user forbids staging, committing, pushing, deploying, production access, and production environment changes. Every commit step normally required by the planning skill is replaced with a local diff and verification checkpoint.

---

### Task 1: Authentication and security primitives

**Files:**

- Create: `src/lib/auth-role.ts`
- Create: `src/lib/auth-request-security.ts`
- Create: `src/lib/password-policy.ts`
- Create: `src/__tests__/auth-security-primitives.test.ts`
- Modify: `src/lib/owner-access-mode.ts`
- Modify: `src/lib/auth-boundary.ts`
- Modify: `src/lib/auth-redirect.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/supabase-server.ts`

- [ ] **Step 1: Write failing primitive tests**

Cover:

```ts
expect(isOwnerInternalNoLoginEnabled({ runtime: "production", allowLocal: "1" })).toBe(false);
expect(isOwnerInternalNoLoginEnabled({ runtime: "development", allowLocal: "1" })).toBe(true);
expect(isAuthorizedAppRole({ app_metadata: { role: "owner" } })).toBe(true);
expect(isAuthorizedAppRole({ user_metadata: { role: "owner" } })).toBe(false);
expect(normalizeAuthRedirect("https://evil.test")).toBe("/dashboard");
expect(validateSameOriginMutation(crossSiteRequest).ok).toBe(false);
expect(validatePassword("weak").ok).toBe(false);
expect(validatePassword("Hh-Owner-2026!Long").ok).toBe(true);
```

Also assert that the strict guard rejects owner-no-login and PIN-only contexts.

- [ ] **Step 2: Run the primitive tests and confirm RED**

Run:

```bash
npx vitest run src/__tests__/auth-security-primitives.test.ts
```

Expected: FAIL because the new role, request-security, password, and strict-auth APIs do not
exist and current owner no-login behavior accepts production.

- [ ] **Step 3: Implement minimal primitives**

Implement these public contracts:

```ts
export type AuthorizedAppRole = "owner" | "admin";
export function authorizedAppRole(
  user: Pick<User, "app_metadata"> | null
): AuthorizedAppRole | null;
export function validateSameOriginMutation(
  request: Request
): { ok: true } | { ok: false; status: 403 };
export function validatePassword(
  value: unknown
): { ok: true; value: string } | { ok: false; message: string };
export async function requireSupabaseOwnerOrAdmin(request: Request): Promise<GuardResult>;
```

Production always returns `false` from owner-no-login. Local bypass requires the explicit
`HH_ALLOW_LOCAL_NO_LOGIN=1` flag and is excluded from strict security/receipt guards.

Switch the browser client implementation to `@supabase/ssr` so browser and server share the
cookie session instead of maintaining an unrelated localStorage-only Supabase client.

- [ ] **Step 4: Run the primitive tests and confirm GREEN**

Run:

```bash
npx vitest run src/__tests__/auth-security-primitives.test.ts src/lib/__tests__/supabase-browser-client.test.ts
```

Expected: all selected tests pass with no warnings.

- [ ] **Step 5: Local checkpoint**

Run `git diff --check` and inspect only the files listed in this task. Do not stage or commit.

### Task 2: Auth schema repair and local Auth configuration

**Files:**

- Create with Supabase CLI: `supabase/migrations/<timestamp>_authenticated_owner_access.sql`
- Create: `src/__tests__/auth-migration-contract.test.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the failing migration contract test**

The test reads the new migration and asserts:

```ts
expect(sql).toContain("create table if not exists public.profiles");
expect(sql).toContain("app_user_security_settings");
expect(sql).toContain("security_audit_events");
expect(sql).toContain("revoke all on table public.app_user_security_settings from anon");
expect(sql).not.toMatch(/first.*owner|not exists\\s*\\(select 1 from public\\.profiles\\)/i);
expect(sql).toMatch(/revoke insert, update, delete on table public\\.attachments from anon/i);
```

It also asserts local config disables both signup switches, requires 12-character passwords,
enables secure password change, and allowlists localhost/127.0.0.1 callback URLs.

- [ ] **Step 2: Run the contract test and confirm RED**

Run:

```bash
npx vitest run src/__tests__/auth-migration-contract.test.ts
```

Expected: FAIL because the migration does not exist and current Auth config permits signup.

- [ ] **Step 3: Create the migration through the CLI**

Run:

```bash
npx supabase migration new authenticated_owner_access
```

Record the exact generated filename. Compare the pre/post hash of
`supabase/.temp/cli-latest`; do not modify or restore the user's pre-existing change.

- [ ] **Step 4: Implement the non-destructive migration**

The migration must:

- repair `profiles` and `role_permissions`;
- assign roles only from `raw_app_meta_data.role`;
- replace the first-user-owner trigger/function;
- create server-only `app_user_security_settings`;
- create server-only `security_audit_events`;
- disable the old global PIN by nulling only its hash/salt and incrementing version;
- revoke anonymous DML from `public.attachments` while retaining SELECT;
- enable RLS and grant service role only on new security tables;
- contain no object deletion, receipt rewrite, or financial data update.

- [ ] **Step 5: Update local Auth config**

Set:

```toml
[auth]
enable_signup = false
minimum_password_length = 12
password_requirements = "lower_upper_letters_digits_symbols"

[auth.email]
enable_signup = true # provider stays available; global enable_signup=false blocks registration
secure_password_change = true
```

Use exact local redirect URLs for login callback and reset password.

- [ ] **Step 6: Run contract and migration checks**

Run:

```bash
npx vitest run src/__tests__/auth-migration-contract.test.ts
npm run check:migration-filenames
npm run check:migration-order
```

Expected: PASS.

- [ ] **Step 7: Apply Migration A to local Docker only**

Capture pre-migration schema/policy/user/expense/Storage hashes, apply the single migration to
local Docker, and verify:

- `profiles`, `role_permissions`, `app_user_security_settings`, and
  `security_audit_events` exist;
- signup is unavailable after local Auth restart/config application;
- `public.attachments` anon INSERT/UPDATE/DELETE are denied and anon SELECT remains;
- no business-table row count or Storage object count changed.

Do not run `db reset`, do not access a linked/remote project, and do not commit.

### Task 3: Canonical login, middleware session refresh, and logout

**Files:**

- Create: `src/app/api/auth/login/route.ts`
- Create: `src/components/auth/login-panel.tsx`
- Create: `src/__tests__/api/auth-login-route.test.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/middleware.ts`
- Modify: `src/app/logout/route.ts`
- Modify: `src/components/auth/auth-provider.tsx`
- Modify: `tests/auth-boundary.spec.ts`
- Modify: `tests/login-readiness.spec.ts`

- [ ] **Step 1: Write failing route and boundary tests**

Assert:

```ts
expect(await lockedPage("/financial/inbox")).toRedirectTo("/login?redirect=%2Ffinancial%2Finbox");
expect((await lockedApi("/api/expenses")).status).toBe(401);
expect((await login(validOwner)).status).toBe(200);
expect((await login(invalidCredentials)).body.message).toBe(
  "Unable to sign in with those credentials."
);
expect((await login(assistantUser)).status).toBe(403);
```

Test safe return targets and rejection of absolute/protocol-relative redirects. Assert no
signup link or endpoint is present.

- [ ] **Step 2: Run targeted tests and confirm RED**

Run:

```bash
npx vitest run src/__tests__/api/auth-login-route.test.ts
npx playwright test tests/auth-boundary.spec.ts tests/login-readiness.spec.ts --project=chromium
```

Expected: FAIL because login redirects unconditionally and owner no-login still bypasses
protected routes/APIs.

- [ ] **Step 3: Implement the login route**

Use an SSR client bound to the response cookies:

```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
const role = authorizedAppRole(data.user);
if (error || !data.user || !role) {
  await supabase.auth.signOut({ scope: "local" });
  return genericLoginError(role ? 401 : 403);
}
```

Validate same origin, rate limit without logging email/password, normalize the return route,
and write only safe audit event types.

- [ ] **Step 4: Implement the login page**

Render the Warm Graphite login panel with:

- email `autocomplete="username"`;
- password `autocomplete="current-password"`;
- show/hide control;
- Remember this device;
- Forgot password;
- loading, generic error, keyboard submit, and alert/status regions;
- at least 44px controls on touch layouts.

- [ ] **Step 5: Implement middleware default-deny**

Add `/api` to the matcher and an explicit public API allowlist. Protected page requests
redirect; protected API requests return JSON 401. Remove internal-secret and PIN-only
ordinary access bypass. Apply refreshed cookie options and private no-store headers.

- [ ] **Step 6: Implement secure logout and AuthProvider synchronization**

Current-device logout uses local scope and clears quick-unlock cookies. The provider uses the
SSR browser client, reads the user, derives role from app metadata/profile, and responds to
cross-tab Auth events without calling the old auto-owner profile RPC.

- [ ] **Step 7: Run tests and confirm GREEN**

Run the commands from Step 2. Expected: all pass.

- [ ] **Step 8: Local checkpoint**

Inspect cookie attributes without printing values. Confirm production-like cookies use
Secure where applicable and SameSite is set. Do not stage or commit.

### Task 4: Password recovery and password/session management APIs

**Files:**

- Create: `src/app/api/auth/forgot-password/route.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/forgot-password/forgot-password-form.tsx`
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/reset-password-form.tsx`
- Create: `src/app/api/settings/security/password/route.ts`
- Create: `src/app/api/settings/security/sessions/route.ts`
- Create: `src/__tests__/api/password-security-routes.test.ts`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/lib/auth-redirect.ts`

- [ ] **Step 1: Write failing password/recovery tests**

Cover generic recovery responses, exact callback allowlisting, expired/invalid callback
states, current-password verification, password strength/match, change success, sign-out
others, reset success, and token/error redaction.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx vitest run src/__tests__/api/password-security-routes.test.ts
```

Expected: FAIL because the routes/screens do not exist.

- [ ] **Step 3: Implement forgot/reset routes**

Forgot password calls:

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/auth/callback?redirect=/reset-password`,
});
```

Always return the same accepted message for a valid email-shaped request. The callback maps
errors to safe codes and never forwards raw provider messages.

Reset validates the recovery-created user session, updates the password, signs out globally,
clears device cookies, and returns a fresh-login destination.

- [ ] **Step 4: Implement change-password and session routes**

Change password:

- strict owner/admin session;
- same origin;
- current password verification with a transient non-persistent Supabase client;
- admin/server update only after verification;
- revoke other sessions after success;
- safe audit event.

Sessions route returns only reliable current-session facts and supports `scope: "others"`.
It does not query or expose refresh tokens.

- [ ] **Step 5: Implement recovery UI**

Use accessible HH forms, password-manager autocomplete, generic errors, no token display,
44px touch controls, and safe navigation.

- [ ] **Step 6: Run and confirm GREEN**

Run:

```bash
npx vitest run src/__tests__/api/password-security-routes.test.ts
```

Expected: PASS.

### Task 5: Session-bound six-digit quick unlock

**Files:**

- Create: `src/lib/device-unlock.ts`
- Create: `src/app/api/auth/unlock/route.ts`
- Create: `src/app/api/auth/lock/route.ts`
- Create: `src/app/unlock/page.tsx`
- Create: `src/app/unlock/unlock-form.tsx`
- Create: `src/__tests__/device-unlock.test.ts`
- Modify: `src/lib/pin-auth.ts`
- Modify: `src/app/api/settings/security/pin/route.ts`
- Modify: `src/middleware.ts`
- Modify: `src/app/logout/route.ts`

- [ ] **Step 1: Write failing PIN tests**

Cover:

```ts
expect(validatePin("123456").ok).toBe(false);
expect(validatePin("805274").ok).toBe(true);
expect(await unlockWithoutSupabaseSession("805274")).toHaveStatus(401);
expect(await unlockWithValidSession(correctPin)).toSetUnlockCookie();
expect(await unlockAfterFiveFailures()).toHaveStatus(429);
expect(await enablePinWithoutCurrentPassword()).toHaveStatus(401);
```

Assert plaintext PIN never appears in persisted rows, cookies, errors, or logs.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx vitest run src/__tests__/device-unlock.test.ts
```

Expected: FAIL because PIN is currently four digits and acts as independent authentication.

- [ ] **Step 3: Rewrite PIN storage and verification**

Use per-user rows, six digits, PBKDF2-SHA256, random salt, common-pattern rejection, durable
failure count, and timed lockout. Every operation begins with
`requireSupabaseOwnerOrAdmin(request)`.

- [ ] **Step 4: Implement trusted-device and unlock cookies**

Bind signed cookie payloads to:

```ts
type DeviceUnlockPayload = {
  v: 1;
  userId: string;
  sessionId: string;
  pinVersion: number;
  exp: number;
};
```

PIN cookies grant only lock state. Middleware validates the Supabase user first. Lock clears
the unlock cookie; logout clears both cookies.

- [ ] **Step 5: Implement `/unlock`**

Show a compact six-digit form only for a valid locked Supabase session. Include “Use password
instead,” which signs out locally. Provide accessible error/lockout announcements and 44px
touch targets.

- [ ] **Step 6: Run and confirm GREEN**

Run the Step 2 command. Expected: PASS.

### Task 6: Settings → Security UI

**Files:**

- Create: `src/app/api/settings/security/account/route.ts`
- Create: `src/app/settings/security/security-client.tsx`
- Create: `tests/settings-security-auth.spec.ts`
- Modify: `src/app/settings/security/page.tsx`
- Modify: `src/app/settings/security/security-pin-form.tsx`
- Modify: `src/app/settings/account/page.tsx`
- Modify: `src/components/settings/settings-sub-nav.tsx`

- [ ] **Step 1: Write failing component/Playwright coverage**

Assert unauthenticated denial and authenticated visibility of Account, Change Password,
Quick Unlock PIN, Current Session, Sign out current device, and Sign out other devices.
Check keyboard labels, alert regions, focus states, and 44px touch targets at 390px.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx playwright test tests/settings-security-auth.spec.ts --project=chromium
```

Expected: FAIL because the current page contains only a four-digit PIN form.

- [ ] **Step 3: Implement the consolidated Security client**

Use existing `PageLayout`, `PageHeader`, `NeoPanel`, `NeoInput`, `NeoActionFooter`, Button,
and status primitives. Keep panels compact, avoid nested cards, keep destructive/session
actions visually secondary, and disclose session-list limitations.

- [ ] **Step 4: Run and confirm GREEN**

Run the Step 2 command. Expected: PASS on desktop and explicit mobile viewport assertions.

### Task 7: Default API authentication and authorization regression

**Files:**

- Create: `tests/authenticated-api-matrix.spec.ts`
- Modify: `src/middleware.ts`
- Modify: unguarded sensitive route handlers identified by the audit only when they bypass
  middleware through direct invocation or need stricter owner/admin checks

- [ ] **Step 1: Write the failing authorization matrix**

Exercise representative GET/mutation endpoints for financial, expenses, receipts, OCR,
labor financial data, Settings, uploads, and system maintenance. Assert unauthenticated 401,
owner/admin success, assistant 403, and cross-site mutations 403.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx playwright test tests/authenticated-api-matrix.spec.ts --project=chromium
```

Expected: FAIL on currently unguarded endpoints.

- [ ] **Step 3: Complete minimal route-level guards**

Rely on middleware for default authentication and add strict route guards to all sensitive
receipt/security paths plus any service-role route where middleware-only coverage could be
lost. Do not refactor unrelated business logic.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2. Expected: PASS.

### Task 8: Receipt normalization and authenticated signed-view endpoint

**Files:**

- Create: `src/lib/expense-receipt-reference.ts`
- Create: `src/lib/expense-receipt-server.ts`
- Create: `src/app/api/financial/expenses/[id]/receipts/route.ts`
- Create: `src/__tests__/expense-receipt-reference.test.ts`
- Create: `src/__tests__/api/expense-receipt-view-route.test.ts`
- Modify: `src/lib/expense-receipt-items.ts`

- [ ] **Step 1: Write failing normalization and view tests**

Cover path, bucket-prefixed, public URL, signed URL, authenticated URL, legacy field/source
IDs, external URL, malformed/encoded path, missing object, anonymous 401, authenticated
temporary URL, refresh, and response redaction.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx vitest run src/__tests__/expense-receipt-reference.test.ts src/__tests__/api/expense-receipt-view-route.test.ts
```

Expected: FAIL because safe descriptors and the server endpoint do not exist.

- [ ] **Step 3: Implement normalization**

Expose:

```ts
export type ReceiptSourceKind = "expense_receipt_url" | "attachment" | "expense_attachment";
export type NormalizedReceiptLocation = {
  bucket: "expense-attachments" | "receipts";
  path: string;
};
export function normalizeReceiptLocation(raw: string): NormalizedReceiptLocation | null;
export function receiptReferenceVersion(input: ReceiptReferenceInput): Promise<string>;
```

Strip query/fragment tokens, reject traversal and unsupported buckets, and never log raw
references.

- [ ] **Step 4: Implement the signed-view route**

Use strict owner/admin Auth and service role. Load all three verified schema sources for only
the requested expense. Return safe IDs, signed URLs with short TTL, display metadata, and
reference versions. Never return bucket/path/raw reference.

- [ ] **Step 5: Run and confirm GREEN**

Run Step 2. Expected: PASS.

### Task 9: Optimistic transactional receipt replacement

**Files:**

- Create with Supabase CLI: `supabase/migrations/<timestamp>_receipt_storage_security_phase1.sql`
- Create: `src/app/api/financial/expenses/[id]/receipts/[receiptId]/replace/route.ts`
- Create: `src/__tests__/api/expense-receipt-replace-route.test.ts`
- Create: `tests/receipt-storage-security.spec.ts`

- [ ] **Step 1: Write failing Replace tests**

Cover all required outcomes:

- anonymous denied;
- owner succeeds without browser Storage credentials;
- path-only database value;
- upload failure keeps old reference;
- database failure deletes only the newly uploaded object;
- success preserves old object and records cleanup candidate;
- optimistic conflict returns 409 and compensates;
- idempotent operation key;
- expense A cannot modify B;
- response/error redaction.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx vitest run src/__tests__/api/expense-receipt-replace-route.test.ts
```

Expected: FAIL because the route and transaction function do not exist.

- [ ] **Step 3: Create Migration B with the Supabase CLI**

Run:

```bash
npx supabase migration new receipt_storage_security_phase1
```

Implement:

- pending cleanup-candidate table;
- service-role-only optimistic transaction function;
- `receipts.public=false`;
- removal of anon object policies for `receipts` and `expense-attachments`;
- no object/data deletion and no historical reference rewrite.

- [ ] **Step 4: Implement Replace route**

Validate file/identity/reference, upload with `upsert:false`, call the atomic transaction
function, compensate only the new path on failure, sign only the committed path, and return a
safe response.

- [ ] **Step 5: Run unit tests and confirm GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Apply Migration B to local Docker only**

Capture pre-hashes, apply only the migration, verify anon read/write denial and service-role
success, and prove object counts/hashes are unchanged.

### Task 10: Viewer/Replace client integration and removal of public receipt fallbacks

**Files:**

- Modify: `src/app/financial/expenses/expenses-client.tsx`
- Modify: `src/app/financial/expenses/expense-inbox-preview-modal.tsx`
- Modify: `src/app/financial/expenses/edit-expense-modal.tsx`
- Modify: `src/lib/expense-receipt-upload-browser.ts`
- Modify: `src/lib/expense-inbox-draft-upload-browser.ts`
- Modify: `src/app/financial/expenses/quick-expense-modal.tsx`
- Modify: `tests/inbox-view-receipt-preview-ux.spec.ts`
- Modify: `tests/quick-expense-upload.spec.ts`
- Modify: `tests/inbox-draft-upload.spec.ts`
- Create: `src/lib/expense-receipt-api-client.ts`

- [ ] **Step 1: Add failing client integration assertions**

Assert no replacement/public mirror calls `getPublicUrl`, Viewer fetches the authenticated
manifest, expired URL refreshes, Replace sends safe IDs/version, UI updates only on commit,
double click is disabled, and safe errors contain no raw path/token.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx playwright test tests/inbox-view-receipt-preview-ux.spec.ts tests/quick-expense-upload.spec.ts tests/inbox-draft-upload.spec.ts --project=chromium
```

Expected: FAIL because current client code still signs/uploads/mirrors directly.

- [ ] **Step 3: Implement the API client and Viewer integration**

Use the existing Receipt Viewer presentation and preserve all current zoom/pan/toolbar work.
Map signed-view manifest items into preview files. Refresh from the server after expiry.
Replace only the selected committed item.

- [ ] **Step 4: Remove receipt public/fallback behavior**

Quick Expense upload remains server-first and returns a path plus temporary preview URL.
Remove browser `receipts` mirror, browser Storage fallback, and all expense receipt
`getPublicUrl` calls. Preserve OCR input and financial payloads.

- [ ] **Step 5: Run and confirm GREEN**

Run Step 2. Expected: PASS.

### Task 11: Read-only orphan audit report

**Files:**

- Create: `scripts/audit-receipt-storage-orphans.mjs`
- Create: `docs/security/receipt-storage-orphan-audit-2026-07-27.md`
- Create: `docs/security/receipt-storage-orphan-candidates-2026-07-27.csv`
- Create: `src/__tests__/receipt-orphan-audit.test.ts`

- [ ] **Step 1: Write failing classification tests**

Test clearly referenced, legacy URL reference, duplicate-content candidate, unreferenced
candidate, and uncertain categories. Include unmatched database references separately.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx vitest run src/__tests__/receipt-orphan-audit.test.ts
```

Expected: FAIL because the classifier does not exist.

- [ ] **Step 3: Implement read-only audit**

Normalize the three reference sources, compare bucket/path and safe content metadata, emit
path, size, created time, evidence, confidence, and category. The script must contain no
Storage remove/delete call and no database mutation.

- [ ] **Step 4: Generate and inspect local report**

Run against local Docker only. Reconcile totals to 138 objects and explicitly preserve the
54 candidates for later review.

- [ ] **Step 5: Run and confirm GREEN**

Run Step 2. Expected: PASS.

### Task 12: Authenticated Playwright infrastructure and full required scenarios

**Files:**

- Create: `tests/e2e-auth-owner.ts`
- Create: `tests/authenticated-owner-access.spec.ts`
- Modify: `tests/global-setup.ts`
- Modify: `tests/global-teardown.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Add failing authenticated fixture tests**

Seed a controlled local owner through service-role admin Auth, log in through the application,
save storage state, and test fresh/valid/expired/logout/cleared-cookie contexts. Include all
39 user-required assertions across Auth, password, PIN, Settings, receipts, and regression.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npx playwright test tests/authenticated-owner-access.spec.ts tests/receipt-storage-security.spec.ts --project=chromium
```

Expected: FAIL until global setup creates the owner and the full session flows are wired.

- [ ] **Step 3: Implement local-only owner lifecycle**

Global setup refuses any `supabase.co` target, creates or resets the named E2E owner with
owner app metadata, logs in through the app, and writes an ignored storage-state file.
Global teardown deletes the controlled Auth user and all controlled expense/object rows.

- [ ] **Step 4: Add responsive and multi-tab coverage**

Exercise 1440×900, 820×1180, and 390×844; verify login, navigation, Settings controls,
Viewer, Replace, refresh, multi-tab logout, touch targets, and no overflow.

- [ ] **Step 5: Run and confirm GREEN**

Run Step 2 plus:

```bash
npx playwright test tests/settings-security-auth.spec.ts tests/authenticated-api-matrix.spec.ts --project=chromium
```

Expected: all pass.

### Task 13: Final local verification and integrity gate

**Files:**

- Modify documentation only if verification reveals an explicit limitation.

- [ ] **Step 1: Capture before snapshots**

Capture counts and deterministic hashes for expenses, expense lines, attachment rows,
receipt references, all receipt bucket objects, and historical object IDs.

- [ ] **Step 2: Run static and unit gates**

Run:

```bash
git diff --check
npm run lint
npx tsc --noEmit
npm run test:unit
npm run check:migration-filenames
npm run check:migration-order
```

- [ ] **Step 3: Run targeted Playwright bundle**

Run Auth, Settings, API matrix, Receipt security, Inbox Viewer, Quick Expense, Inbox draft,
Upload Receipt routing, OCR, mobile receipt, and financial snapshot regressions.

- [ ] **Step 4: Real browser verification**

Use the in-app browser against local Docker-backed app. Verify fresh login, refresh,
password recovery via local Inbucket, password change, PIN enable/change/lockout/disable,
logout, multi-tab behavior, Receipt Viewer, Replace, Upload Receipt, OCR, and responsive
viewports. Inspect console and failed network requests.

- [ ] **Step 5: Capture after snapshots and clean controlled data**

Delete only controlled test-created users/rows/new Storage objects. Never delete historical
objects. Recompute hashes and prove financial data and historical Storage are unchanged.

- [ ] **Step 6: Inspect final scope**

Verify `supabase/.temp/cli-latest` remains the user's pre-existing unstaged modification,
legacy Viewer UI work is preserved, and no unrelated files changed.

- [ ] **Step 7: Report verdict**

Use exactly one:

- `APPROVE AUTH PHASE FOR COMMIT`
- `APPROVE WITH CONDITIONS`
- `BLOCKED`

Report all 17 required sections, exact commands/results, browser evidence, integrity hashes,
rollout order, and confirmation that nothing was staged, committed, pushed, deployed, or
changed in production.
