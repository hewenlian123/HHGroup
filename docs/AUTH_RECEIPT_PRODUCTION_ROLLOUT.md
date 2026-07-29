# Auth and Receipt Security Production Rollout

Status: manual production runbook
Scope: authenticated owner access, private Receipt Viewer/Replace, and the temporary
`HH_REQUIRE_LOGIN` compatibility gate

This runbook does not authorize a deployment or production mutation. Every production
step requires a separately approved operator session.

## Server-only rollout mode

`HH_REQUIRE_LOGIN` is read only on the server. Do not create a `NEXT_PUBLIC` equivalent.

| Value           | Resolved mode | Deployed production/preview behavior                                                                      |
| --------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| `1` or `true`   | strict        | All protected pages require Supabase Auth; anonymous protected APIs return 401.                           |
| `0` or `false`  | compatibility | Existing non-sensitive pages and APIs remain available while Auth is verified.                            |
| unset or empty  | compatibility | The server emits a safe `configuration=unset` warning so an unreviewed cutover cannot lock out the owner. |
| any other value | compatibility | The server emits a safe `configuration=invalid` warning without logging the value.                        |

Strict mode always wins. In local development or tests, no-login access additionally
requires compatibility mode and `HH_ALLOW_LOCAL_NO_LOGIN=1`. That flag never enables
no-login in production or preview by itself.

Compatibility is temporary. Remove its production/preview access branch after the
production observation period, once strict login, recovery, and receipt workflows have
remained healthy. Do not add another compatibility variable.

These surfaces always require a real, current Supabase user whose server-owned
`app_metadata.role` is `owner` or `admin`, even in compatibility mode:

- Receipt Viewer manifest, preview signing, and Receipt Replace;
- Settings → Security;
- password and PIN changes;
- device lock/unlock and session management.

Headers, query parameters, cookies outside the supported Supabase session, browser state,
PIN state, and maintenance secrets do not satisfy these strict guards.

Startup logs contain only resolved mode, normalized runtime, and configuration state. They
must never contain environment values, credentials, cookies, tokens, email addresses,
signed URLs, or secrets.

## Pre-deployment Auth gates

Complete all items before Migration A:

1. In Supabase Authentication Providers, keep email/password enabled and disable public
   signup. Do not enable anonymous sign-in.
2. Configure production SMTP and verify actual password-recovery delivery in a separately
   authorized test. A settings-only inspection is not proof of delivery.
3. Add these exact redirect destinations:
   - `<canonical-production-origin>/auth/callback`
   - `<canonical-production-origin>/auth/recovery/callback`
   - `<canonical-production-origin>/reset-password`
   - `<canonical-www-production-origin>/auth/callback`,
     `<canonical-www-production-origin>/auth/recovery/callback`, and
     `<canonical-www-production-origin>/reset-password` only if `www` is an active canonical
     entry point;
   - `https://<exact-vercel-verification-host>/auth/callback`
   - `https://<exact-vercel-verification-host>/auth/recovery/callback`
   - `https://<exact-vercel-verification-host>/reset-password`
4. Replace `<exact-vercel-verification-host>` with the immutable deployment hostname.
   Never use a wildcard, bare `*.vercel.app`, localhost, or a user-controlled return URL.
5. Set the server-only `APP_URL` in Production to the canonical production origin. Preview
   recovery is pinned to Vercel's deployment-specific `VERCEL_URL`; the application rejects
   recovery requests and callbacks arriving through a stale deployment or branch alias.
   Never configure `APP_URL` with a path, query, fragment, wildcard, or client-controlled
   value.
6. Confirm the server-only Production and Preview environment scopes contain the required
   Supabase/service and session-signing configuration. Set `HH_REQUIRE_LOGIN=0` explicitly
   for the compatibility deployment. Do not print or copy values into logs or reports.
7. Configure the hosted Supabase **Recovery OTP** email template before the controlled
   delivery test:
   - the button destination must be exactly `{{ .RedirectTo }}`;
   - the message must display the one-time code with `{{ .Token }}`;
   - it must not use `{{ .ConfirmationURL }}`, `{{ .TokenHash }}`, or place an Auth secret in
     the URL;
   - the hosted OTP expiry must be 3,600 seconds.
8. The exact recovery callback opens a code-entry state and the server verifies the submitted
   email and code with `verifyOtp({ type: "recovery" })`. Only an authenticated
   owner/admin recovery session may receive the signed, HttpOnly recovery-purpose cookie and
   continue to the fixed `/reset-password` route. A normal authenticated session must not
   satisfy this recovery guard.
9. Verify the newest message from the authorized sender in a second browser profile/device
   as well as the initiating profile. Link prefetch is safe because the link contains no
   secret and cannot consume the OTP; nevertheless, do not copy the code or email into logs,
   screenshots, reports, URLs, or browser automation output. Verify expired, replayed, and
   malformed codes produce the generic safe error state.
10. After a newer immutable Preview is approved, remove obsolete Preview redirect entries
    instead of leaving stale deployments as valid recovery targets. Retain the PKCE callback
    compatibility path only for already-issued legacy links during the observation period.

## Create and verify the owner

Use Supabase Admin tooling, not public signup:

1. Authentication → Users → Add user. Create a confirmed email/password user with a unique,
   strong temporary password. Require an immediate owner-controlled password change.
2. Record the user UUID without putting the email or password in tickets, logs, shell
   history, or repository files.
3. In a reviewed SQL Editor session, assign only the server-owned role:

   ```sql
   begin;

   update auth.users
   set raw_app_meta_data =
     coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'owner')
   where id = '<reviewed-owner-user-uuid>';

   select
     id,
     raw_app_meta_data ->> 'role' as app_role,
     confirmed_at is not null as confirmed,
     banned_until
   from auth.users
   where id = '<reviewed-owner-user-uuid>';

   commit;
   ```

4. Verify `app_role=owner`, the account is confirmed and not banned, and
   `public.profiles.role=owner` after Migration A installs/refreshes the projection.
   A role in `raw_user_meta_data` does not authorize the user.
5. Verify sign-in, refresh, logout, password recovery, and a fresh sign-in on the immutable
   verification deployment before enabling strict mode.

## Controlled rollout order

1. Preserve the current production deployment ID and confirm it remains immediately
   rollback-capable.
2. Verify Auth provider, disabled signup, exact redirects, SMTP delivery, owner confirmation,
   owner app metadata, and recovery.
3. Set Preview and the planned compatibility deployment to `HH_REQUIRE_LOGIN=0`.
4. Apply `20260728095543_authenticated_owner_access.sql` (Migration A).
5. Deploy the Auth-capable application to an immutable Vercel verification URL without
   moving the production alias.
6. Verify login, refresh, Dashboard, Finance, Labor, Settings, logout, recovery, and session
   persistence on that URL.
7. Set `HH_REQUIRE_LOGIN=1` for the verification deployment and redeploy.
8. Verify anonymous protected pages redirect to login and anonymous protected APIs return 401. Verify an authorized owner can still reach all critical modules.
9. Apply `20260728105015_receipt_storage_security_phase1.sql` (Migration B).
10. Verify multiple historical receipt reference forms, signed viewing, Download, Replace
    compensation, Upload Receipt, OCR, refresh, and rapid receipt switching.
11. Promote the verified deployment to `hhprojectgroup.com` only after every gate passes.
12. Repeat strict anonymous/authenticated smoke checks on the production alias without
    creating permanent financial data.
13. Observe Auth, receipt signing, Replace, and Storage errors for the approved observation
    period. Retain the prior deployment and both manual rollback files.
14. Remove the compatibility production/preview branch in a separate tested patch. Keep
    strict authentication as the only deployed mode.

Migration B must never precede successful authenticated Viewer/Replace verification.

## Manual rollback

The companion SQL files are outside `supabase/migrations`; normal migration commands never
run them. Both require an explicit session confirmation, begin a transaction, and leave it
open for inspection. Run `npm run check:rollback-sql` only against local Docker Supabase.

### Receipt Storage emergency rollback

Use
`supabase/rollbacks/20260728105015_receipt_storage_security_phase1.rollback.sql`
only for a verified private-receipt read outage:

1. Roll the application back to the preserved deployment when that restores service.
2. If Storage policy state must also be restored, open one reviewed database session and
   set:

   ```sql
   set hh.rollback_confirmation =
     'ROLLBACK_RECEIPT_STORAGE_SECURITY_PHASE1_20260728105015';
   ```

3. Execute the rollback file in that same session.
4. Inspect `receipts.public=true`, `expense-attachments.public=false`, and the exact ten
   recreated baseline policies.
5. Explicitly finish the open transaction only after two-person review; otherwise roll it
   back.

This is a temporary security regression. It does not delete Storage objects, rewrite
receipt references, or remove cleanup evidence.

### Authenticated owner-access emergency rollback

Use
`supabase/rollbacks/20260728095543_authenticated_owner_access.rollback.sql`
only when the prior application cannot operate without legacy anonymous attachment DML:

1. Set in the reviewed session:

   ```sql
   set hh.rollback_confirmation =
     'ROLLBACK_AUTHENTICATED_OWNER_ACCESS_20260728095543';
   ```

2. Execute the file, inspect the three recreated attachment policies and grants, then
   explicitly finish or roll back the open transaction.

The legacy PIN cannot be reconstructed automatically. The rollback deliberately retains
security/audit tables, functions, historical rows, receipt references, and Storage objects.
Prefer forward repair over this access regression.

## Emergency owner recovery

If all owners are locked out, use a separately authorized Supabase Admin session:

1. Confirm the intended existing user by UUID; do not rely on client metadata.
2. Unban or confirm that account if the incident review approves it.
3. Assign `raw_app_meta_data.role=owner` with the reviewed UUID-only statement above.
4. Generate a supported recovery/invite flow through Auth Admin tooling; never disclose or
   log the token.
5. Verify recovery on an exact allowlisted domain, rotate the password, revoke other
   sessions, and record a secret-free security event.

Do not re-enable public signup, create a header bypass, expose a service-role key, or make a
receipt bucket public as an Auth recovery mechanism.
