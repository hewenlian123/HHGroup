# HH Group Authenticated Owner Access and Receipt Security

Date: 2026-07-27
Status: Approved product direction; implementation design
Environment: local Docker Supabase only

## 1. Scope

This phase replaces anonymous production owner access with a real Supabase Auth
email/password identity boundary and then uses that boundary to secure Receipt Viewer
and Replace.

Included:

- email/password login and SSR cookie sessions;
- safe password recovery and password change;
- optional six-digit trusted-device quick unlock;
- current-device logout and supported sign-out-other-sessions behavior;
- Settings → Security account, password, PIN, and session controls;
- default-deny page and API authentication;
- server-signed private receipt viewing;
- server-mediated, optimistic, compensating receipt replacement;
- local-only RLS and Storage migration verification;
- a read-only receipt orphan-candidate report.

Not included:

- public registration;
- production account creation, environment changes, migration application, or deployment;
- deleting or rewriting historical receipt objects;
- claiming complete device/session inventory that Supabase does not expose through the
  supported client API;
- using PIN as an account credential or as a replacement for Supabase Auth;
- broad migration of every historical receipt reference into one database column.

## 2. Read-only audit findings

### Authentication

- Local Docker has zero `auth.users` and zero active sessions.
- `public.profiles` and `public.role_permissions` are absent locally even though
  migration `202602280007_auth_roles_permissions_rls.sql` is recorded as applied.
- That old migration assigns the first created Auth user the `owner` role. This is
  unsafe if signup is accidentally enabled.
- `supabase/config.toml` currently enables global and email signup, permits six-character
  passwords, and does not require secure password change.
- `owner-access-mode.ts` treats an absent `HH_REQUIRE_LOGIN` as owner no-login mode.
- `auth-boundary.ts` currently counts owner no-login and PIN-only sessions as authenticated.
- `/login` unconditionally redirects to `/dashboard`; the existing PIN login form is not
  reachable.
- middleware excludes `/api` and therefore cannot provide a default API authentication
  boundary.
- multiple route handlers do not contain their own authentication guard.
- internal production-safety headers currently bypass ordinary protected pages. They must
  remain maintenance controls, not user identity.

### PIN

- The current PIN is a global four-digit server credential stored in
  `public.app_security_settings`.
- A valid PIN cookie currently grants application authentication without a Supabase user.
- This violates the approved model. PIN must become per-user and useful only while a valid
  Supabase session exists.

### Receipts

- Replace uploads directly from the browser to `receipts`, calls `getPublicUrl()`, and
  writes that URL into `expenses.receipt_url`.
- Receipt previews create signed URLs in the browser using anonymous Storage access.
- Quick Expense first uses a server upload but then mirrors into public `receipts` and has
  browser Storage fallbacks.
- Local `receipts` is public.
- Local `expense-attachments` is private by bucket flag but has anonymous SELECT policies.
- `public.attachments` currently grants anonymous SELECT, INSERT, UPDATE, and DELETE.
- Current local data contains 175 expenses, 57 non-empty `receipt_url` values, 86
  `attachments.file_path` rows, and 138 `expense-attachments` objects.
- The initial normalized inventory finds 84 clearly referenced objects, 54 unreferenced
  candidates, and two database references without a matching object. No candidate is safe
  to delete automatically.

## 3. Canonical authentication architecture

### Identity and role

Supabase Auth email/password is the only canonical account identity. A request is an
authenticated application request only when the server validates a current Supabase user
from an SSR cookie or bearer access token.

Application access is limited to pre-authorized users whose server-owned
`raw_app_meta_data.role` is `owner` or `admin`. `raw_user_meta_data` is never used for
authorization.

`public.profiles` remains a presentation and permission-compatibility projection. It is not
the authority that can promote an account. A repair migration recreates the table and
trigger, but the trigger copies only a valid role already present in app metadata; otherwise
it assigns `assistant`. It never auto-promotes the first user.

There is no signup page or signup API. Local Auth config disables signup. Production signup
must also be disabled in Supabase Auth settings before rollout.

### Production and local modes

- Production always requires Supabase Auth, regardless of whether `HH_REQUIRE_LOGIN` is
  missing.
- The production target explicitly sets `HH_REQUIRE_LOGIN=1`.
- Owner no-login is allowed only when all are true:
  - runtime is not production;
  - `HH_ALLOW_LOCAL_NO_LOGIN=1` is explicitly set;
  - the request is not a sensitive security or receipt route.
- No production-safety or client-supplied owner header authenticates an ordinary request.
- The existing non-production test bypass remains test-only and is rejected in production.

### Server client boundaries

- Browser and SSR user clients use the public/anon key and the current Auth session.
- Service-role clients exist only in server-only modules.
- Service role is used narrowly for:
  - role/profile bootstrap after a user has already authenticated;
  - security settings and safe audit events;
  - private receipt signing and replacement;
  - compensation that deletes only the new object from a failed replacement.
- A sensitive route returns 503 when service-role configuration is missing; it never falls
  back to anonymous Supabase access.

## 4. Session lifecycle

1. The user submits email/password to a same-origin login route.
2. The route calls Supabase `signInWithPassword` through an SSR client.
3. The route validates that the returned user has `owner` or `admin` app metadata.
4. If unauthorized, the new session is immediately signed out and a generic login error is
   returned.
5. The SSR client writes Supabase access/refresh cookies with `@supabase/ssr`.
6. Middleware validates the user on protected navigation and refreshes cookies on the
   response when required.
7. Browser refresh uses the same supported Supabase refresh-token rotation model.
8. `AuthProvider` listens to Supabase Auth events so login/logout refreshes client UI and
   propagates across tabs where supported by the Supabase client.
9. Current-device logout uses local scope and clears quick-unlock cookies.
10. Sign out other sessions uses Supabase `scope: "others"` when supported. The UI states
    that already-issued access tokens can remain valid until their short JWT expiry.
11. Password change retains the current session and revokes other sessions.
12. Recovery reset ends all sessions after success and requires a fresh login.

Supabase controls session validity. “Remember this device” does not create a permanent HH
token. It opts the current valid Supabase session into the trusted-device quick-unlock
layer. The underlying Supabase session continues according to configured Auth session,
refresh, inactivity, and timebox rules.

## 5. Login and recovery UX

### Login

The login page uses the existing HH Warm Graphite / Neo Operations OS visual language:

- compact centered operational panel rather than a marketing hero;
- email and password fields with password-manager-compatible autocomplete;
- show/hide password control with an accessible label;
- Sign in, Remember this device, and Forgot password;
- keyboard submission, visible focus, status announcements, and 44px mobile controls;
- one generic invalid-credentials response;
- no raw Supabase messages and no account enumeration.

The `redirect` parameter passes through the existing internal-path normalizer. Absolute,
protocol-relative, login-loop, reset-loop, and callback targets resolve to `/dashboard`.

### Forgot password

A same-origin rate-limited route always returns the same accepted response for syntactically
valid input. It calls `resetPasswordForEmail` with an allowlisted callback URL. Local testing
uses Inbucket/Mailpit and never logs the recovery token.

The callback exchanges the PKCE code into an SSR session and redirects only to the
allowlisted reset screen. Provider errors are mapped to generic, token-free UI messages.

### Change and reset password

Settings password change requires:

- a valid owner/admin session;
- the current password;
- a new password meeting HH guidance;
- matching confirmation;
- same-origin validation and rate limiting.

The server verifies the current password against Supabase Auth before updating it. After a
successful change it retains the current session and revokes other sessions.

Recovery reset requires the valid recovery-created Supabase session. It does not ask for the
old password. After success all sessions are revoked and the user returns to login.

Local config target:

- signup disabled;
- minimum password length 12;
- lower/upper letters, digits, and symbols;
- secure password change enabled;
- refresh-token rotation retained;
- JWT expiry remains one hour unless production security review chooses a different value;
- production recovery requires verified SMTP and exact redirect allowlists.

## 6. Quick Unlock PIN design and threat model

### Chosen design

Use acceptable direction A: server-verified quick unlock layered over an existing,
server-validated Supabase session.

PIN is a six-digit convenience lock for a trusted device. It is not authentication.

### Data model

`public.app_user_security_settings` is server-only and keyed by `auth.users.id`:

- `user_id`;
- PBKDF2-SHA256 hash and random salt;
- `pin_enabled`;
- `pin_session_version`;
- failed-attempt counter;
- lockout timestamp;
- created and updated timestamps.

Anonymous and authenticated Data API roles receive no direct table privileges. Service role
is the only database caller.

### Cookies

- `hh_trusted_device`: signed, HttpOnly, Secure in production, SameSite=Lax, user-bound,
  version-bound, and contains no Auth token.
- `hh_device_unlock`: signed, HttpOnly, Secure in production, SameSite=Lax, short-lived,
  user/session/version-bound unlock state.

Every PIN endpoint first validates the Supabase user. Middleware validates the Supabase user
before considering device-lock state. Therefore:

- PIN cannot restore an expired, revoked, or logged-out Supabase session;
- copying a PIN cookie without the Supabase session grants nothing;
- changing/disabling PIN increments the version and invalidates old unlock attempts;
- logout clears both cookies.

### Behavior

- Enabling, changing, or disabling PIN requires the current account password.
- Common six-digit PINs, repeated digits, ascending/descending sequences, and birth-year-like
  patterns are rejected.
- Hashing uses a slow PBKDF2 representation with a per-user random salt.
- Failed attempts are counted server-side per user and temporarily locked after repeated
  failures.
- The unauthenticated surface never reveals whether a PIN exists.
- “Lock this device” clears only the unlock cookie and routes to `/unlock`.
- `/unlock` works only when the Supabase session remains valid.
- “Use password instead” signs out the local session and returns to `/login`.
- Password fallback always exists.

### Limitations

- A six-digit PIN has low entropy. Rate limiting, lockout, valid-session dependency, and
  trusted-device scope are mandatory.
- This phase does not claim cryptographically attested device identity.
- Browser/session restoration behavior varies; explicit Lock is the reliable lock action.
- Complete device lists are not shown because the supported Supabase client does not expose
  complete reliable device metadata.

## 7. Route protection matrix

| Surface                               | Unauthenticated              | Owner/Admin                                        | Local explicit bypass                                                   |
| ------------------------------------- | ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `/login`, forgot password             | available                    | redirect to safe return route if already signed in | available                                                               |
| `/auth/callback`, reset password      | callback/recovery rules only | recovery/session rules                             | no identity shortcut                                                    |
| `/unlock`                             | redirect to login            | available only for trusted locked session          | no PIN auth shortcut                                                    |
| `/dashboard`, projects, customers     | redirect to login            | allowed                                            | only non-production with explicit flag                                  |
| `/financial`, expenses, receipts, OCR | redirect to login            | allowed                                            | read-only compatibility only; sensitive receipt APIs still require Auth |
| `/labor`, worker financial records    | redirect to login            | allowed                                            | only non-production with explicit flag                                  |
| `/settings`                           | redirect to login            | allowed                                            | Security always requires Auth                                           |
| `/admin`                              | 403/login                    | owner/admin only                                   | test bypass only outside production                                     |
| maintenance/system mutation surfaces  | 403                          | separate admin/internal maintenance guard          | explicit local test guard only                                          |

Middleware protects pages and API routes by default. Public paths and public APIs use a
small explicit allowlist.

## 8. API authorization matrix

| API class                              | Authentication                                        | Authorization / additional controls                         |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| login                                  | none                                                  | same origin, Auth rate limit, owner/admin role check        |
| forgot password                        | none                                                  | same origin, generic response, Auth/email rate limits       |
| reset password                         | recovery session                                      | same origin, password policy                                |
| logout                                 | valid session where present                           | same origin for POST; GET compatibility redirects only      |
| Security account/status                | Supabase user                                         | owner/admin                                                 |
| password/PIN/session mutations         | Supabase user                                         | owner/admin, current-password/recent-auth, CSRF, rate limit |
| financial/expense/receipt/OTP/OCR APIs | Supabase user                                         | owner/admin; route-specific validation                      |
| labor/worker financial APIs            | Supabase user                                         | owner/admin; route-specific validation                      |
| Settings APIs                          | Supabase user                                         | owner/admin                                                 |
| Receipt signed-view                    | Supabase user                                         | owner/admin plus expense/reference ownership lookup         |
| Receipt Replace                        | Supabase user                                         | owner/admin, optimistic reference token, idempotency key    |
| system/maintenance                     | Supabase user plus admin/internal maintenance control | production safety guard                                     |

Middleware supplies default authentication for legacy unguarded APIs. Sensitive new routes
also call a strict route-level guard so matcher drift cannot expose them.

## 9. CSRF, abuse, and audit controls

All new cookie-authenticated mutations validate:

- `Origin` against the request origin/host;
- `Sec-Fetch-Site` when present;
- JSON or multipart content type as expected;
- no protocol-relative or external redirect targets.

Login and recovery rely on Supabase Auth rate limits plus a small application-level
best-effort limiter. PIN lockout is durable in the server-only settings row. Password and
PIN management have per-user cooldowns.

`public.security_audit_events` records only safe event names, actor user ID, success/failure
class, and timestamp. It never stores passwords, PINs, access/refresh tokens, signed URLs,
receipt contents, raw Storage errors, or raw receipt references. RLS is enabled and only
service role can access it.

## 10. Canonical receipt reference model

Phase 1 is source-preserving but path-only for every new replacement:

- `expenses.receipt_url` remains the canonical source for a legacy receipt-url item;
- `attachments.file_path` remains the canonical source for a legacy attachment row;
- `expense_attachments.file_url` remains the canonical source for a dedicated attachment row.

A `ReceiptReference` descriptor contains:

- safe source kind;
- expense ID;
- source-row ID where one exists;
- server-generated reference version digest;
- file name and MIME type;
- no raw path or URL.

The server normalization helper supports:

- raw `expense-attachments` paths;
- bucket-prefixed paths;
- legacy Supabase public URLs;
- legacy Supabase signed/authenticated URLs;
- `attachments.file_path`;
- `expense_attachments.file_url`;
- path-like `expenses.receipt_url`.

Viewing never rewrites a historical reference. Unparseable external URLs remain read-only
legacy references; Replace is denied unless a rollback-safe Storage object can be resolved.

## 11. Private Receipt Viewer

An authenticated endpoint loads receipt references for one expense and signs resolved
private objects server-side with a short TTL. Its response contains safe receipt IDs,
temporary signed view URLs, display metadata, and reference-version digests.

The browser never calls Storage signing APIs for expense receipts. On signed URL expiry or
403/404, the Viewer asks the authenticated endpoint for a new URL. Errors are generic and
do not reveal bucket names, raw paths, tokens, or internal Storage messages.

Legacy public and signed Supabase URLs are parsed to bucket/path and re-signed. They are not
rewritten during viewing.

## 12. Transaction-safe Replace

1. The browser sends expense ID, safe receipt ID, reference version, idempotency key, and
   file to the authenticated application route.
2. The route validates owner/admin identity, same origin, UUIDs, file size, MIME type,
   extension/MIME consistency, and current reference.
3. The server resolves the previous private object without returning the path.
4. The server uploads to an immutable path:
   `replacements/expenses/<expense-id>/<operation-id>.<extension>` in
   `expense-attachments`, with `upsert: false`.
5. A service-role-only transaction function:
   - rechecks the expected old raw reference;
   - updates only the selected source row;
   - writes the new path only;
   - records the old object as a pending cleanup candidate;
   - writes a safe audit event;
   - returns whether exactly one reference changed.
6. If upload fails, the database and old object remain unchanged.
7. If the transaction fails or loses the optimistic race, the route deletes only the new
   operation object as compensation.
8. On success, the old object remains. It is never deleted in this phase.
9. The route signs the committed new object and returns a safe receipt response.
10. The Viewer updates only after database success.

Double-click is disabled in UI. Immutable operation paths, an idempotency key, a unique
cleanup event key, and optimistic old-reference matching isolate concurrent requests.

## 13. Database and Storage migrations

Migrations are separate so authentication can be proven before private receipt policies are
applied.

### Migration A: authenticated owner access

- recreate/repair `profiles` and `role_permissions`;
- replace unsafe first-user-owner trigger behavior;
- create per-user security settings and safe security audit tables;
- migrate the existing global PIN only by disabling it; do not copy a four-digit credential
  into the new model;
- revoke anonymous INSERT/UPDATE/DELETE on `public.attachments`;
- retain anonymous SELECT temporarily and document the legacy dependency;
- add service-role-only transaction functions and grants where required.

### Migration B: private receipt storage

- set `receipts.public = false`;
- retain `expense-attachments.public = false`;
- remove anonymous SELECT/INSERT/UPDATE/DELETE policies for both receipt buckets;
- retain narrowly scoped authenticated SELECT only if a verified non-Viewer workflow still
  requires it; all new writes use the server;
- create pending cleanup-candidate storage without deleting any object;
- do not rewrite any existing receipt database value.

### Local config

- disable global and email signup;
- set password policy and secure password change;
- add exact local callback/reset redirect URLs for both `localhost` and `127.0.0.1`;
- retain refresh-token rotation and local Inbucket.

## 14. Rollback plan

Rollback never deletes receipt objects or historical references.

1. Keep the local owner account and recovery access intact.
2. Revert application code to the previous deployment.
3. If private Storage causes a verified read outage before code rollback completes, an
   explicitly reviewed emergency policy rollback may temporarily restore the exact previous
   bucket public/read policies. This is a security regression and must be time-limited.
4. Restore prior `public.attachments` anonymous DML only if the old application cannot
   operate and the operator explicitly accepts the exposure. Prefer rolling application code
   forward instead.
5. Do not drop cleanup or audit tables during emergency rollback; preserve evidence.
6. Do not reverse path-only replacement rows. They remain readable by the compatibility
   normalizer.
7. Re-enable owner no-login in production only as a last-resort code rollback, never as a
   new environment fallback.

## 15. Production rollout order

1. Verify production Auth settings, exact redirect allowlist, SMTP, and recovery delivery.
2. Disable public signup globally while leaving the email/password provider enabled for
   pre-authorized accounts. On the current local GoTrue version,
   `[auth].enable_signup=false` blocks registration and
   `[auth.email].enable_signup=true` is required for email/password sign-in.
3. Create the production owner account through Supabase admin tooling.
4. Set owner role in `raw_app_meta_data` and verify the profile projection.
5. Test password recovery before enforcing login.
6. Apply Migration A.
7. Deploy Auth-capable code with receipt Storage still in legacy read mode.
8. Verify login, refresh, all critical modules, logout, recovery, and rollback access on the
   deployment URL.
9. Set `HH_REQUIRE_LOGIN=1`.
10. Verify unauthenticated pages and APIs are denied on the production domain.
11. Apply Migration B.
12. Verify multiple historical receipt forms through server-signed Viewer.
13. Verify secure Replace and compensation using a controlled non-financial test expense.
14. Verify Upload Receipt and OCR.
15. Remove any temporary compatibility gate.
16. Retain the prior deployment and emergency Storage-policy rollback SQL until the
    observation window closes.

This order prevents owner lockout: a confirmed owner and recovery path exist before login
enforcement or private Storage changes.

## 16. Test and verification strategy

Follow strict red-green TDD:

- unit tests for redirect allowlisting, password policy, PIN policy/hash/lockout, same-origin
  validation, receipt normalization, reference versioning, optimistic transaction inputs,
  and safe errors;
- route/component tests for login, password, PIN, session, signed Viewer, and Replace;
- Playwright for the 39 required scenarios;
- local Docker policy tests using anon, authenticated, and service-role clients;
- before/after database and Storage hashes;
- controlled test user, expenses, and objects removed after verification;
- explicit proof that no historical Storage object was deleted;
- 1440×900, 820×1180, and 390×844 browser checks;
- console/network inspection and cookie-attribute inspection without cookie values.

The relevant regression bundle includes Auth, Expense Inbox, Upload Receipt routing, OCR,
receipt preview, mobile receipt behavior, financial snapshots, lint, and TypeScript.

## 17. Change boundaries

The current worktree contains pre-existing Receipt Viewer UI changes and
`supabase/.temp/cli-latest`. Implementation must preserve those changes, must not touch the
temporary Supabase file, and must not reformat unrelated modules.

No stage, commit, push, deploy, production access, production environment change, historical
object deletion, or orphan cleanup is authorized in this phase.
