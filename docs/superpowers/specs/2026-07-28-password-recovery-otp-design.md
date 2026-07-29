# HH Group Password Recovery OTP Design

## Context

HH Group currently starts password recovery with Supabase SSR/PKCE and exchanges the
authorization code in `/auth/recovery/callback`. Production evidence showed that the email
reached the correct immutable Preview host, but the code exchange failed after roughly seven
minutes. Supabase documents two relevant PKCE constraints: the authorization code is valid for
five minutes and the exchange must happen in the browser/device that created the verifier.
Those constraints are incompatible with a real email workflow that may be opened after ten
minutes or moved from Spark to Chrome or Safari.

## Decision

Use Supabase's supported email recovery OTP flow for new recovery emails while retaining the
existing PKCE callback as a safe compatibility path for already-issued links.

The hosted and local recovery templates will:

- link only to `{{ .RedirectTo }}`, which the application already pins to the exact trusted
  production or immutable Preview `/auth/recovery/callback`;
- display `{{ .Token }}` as the single-use recovery code;
- never place an access token, refresh token, token hash, email address, or application-controlled
  redirect in the link.

The callback will redirect a recovery request without a PKCE code to
`/forgot-password?mode=verify`. The verification form accepts the account email and recovery code
and sends them in a same-origin POST body. The server calls
`supabase.auth.verifyOtp({ email, token, type: "recovery" })`, validates that the result is an
authorized owner/admin session, issues the existing signed HttpOnly recovery-session cookie bound
to the exact user and Supabase session, and returns the fixed relative destination
`/reset-password`.

## Security properties

- Email scanners can fetch the template link without consuming the OTP because verification
  requires an explicit POST with the code.
- The OTP is not placed in a URL, console message, server log, redirect, or rendered application
  error.
- The link host comes exclusively from the server-selected `redirectTo`; client headers cannot
  select another host.
- The verification route uses same-origin mutation validation and Supabase Auth's configured
  token-verification rate controls.
- `verifyOtp` enforces expiry and one-time use. The local and hosted email OTP expiry remains one
  hour, allowing a controlled delay beyond ten minutes without weakening token lifetime.
- A successful verification is still insufficient by itself to update a password: the reset API
  requires a real authorized Supabase owner/admin session plus the signed recovery cookie matching
  that exact user and session ID.
- Normal authenticated sessions cannot create a recovery cookie or open the reset form.
- External redirects are never accepted. All successful and failed destinations are fixed
  same-origin paths.

## User flow

1. The owner submits the existing Forgot Password form.
2. The application returns the same enumeration-safe accepted response for every email.
3. The email contains an HH Group button and a six-digit recovery code.
4. The button opens the exact trusted host's recovery callback, which immediately redirects to the
   clean verification form.
5. The owner enters the existing account email and the code.
6. On success, the browser receives Supabase session cookies plus the bound recovery cookie and
   navigates to `/reset-password`.
7. The owner may refresh the reset page without losing valid recovery state.
8. Password update signs out all sessions and clears PIN, device-unlock, trusted-device, and
   recovery cookies exactly as the current implementation does.

## Compatibility and failure handling

- Existing PKCE links containing a valid `code` continue through `exchangeCodeForSession`.
- Missing code on a recovery callback opens OTP verification instead of reporting a false expired
  link.
- Provider errors, malformed callbacks, rejected origins, invalid/expired OTPs, replayed codes,
  wrong accounts, and unauthorized roles all return generic safe states.
- Normal login callbacks and login redirects are unchanged.

## Verification

- Unit tests cover the OTP template contract, trusted callback behavior, same-origin enforcement,
  successful verification, invalid/expired/replayed codes, unauthorized roles, cookie binding,
  and secret-free errors.
- Playwright covers immediate and delayed simulated email use, a second browser context
  representing Spark-to-Chrome/Safari handoff, refresh, replay, normal-session misuse, and absence
  of token-like values in URLs, visible UI, or console output.
- Local Docker Supabase and Mailpit prove the real template, delivery, `verifyOtp`, and reset-page
  session behavior before hosted configuration changes.
- Hosted Supabase recovery template changes occur only after the exact immutable Preview is READY
  and local gates pass. One production-owner recovery email is sent for the final Preview test.
