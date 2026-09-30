/**
 * Product switch for the email/password login gate.
 *
 * `false` = login is off: middleware and soft auth boundaries allow
 * unauthenticated UI access. Strict Supabase owner/admin guards and RLS still
 * require a real session for privileged data and mutations.
 *
 * Set to `true` (and deploy with `HH_REQUIRE_LOGIN=1` where needed) to restore
 * the login wall.
 */
export const LOGIN_GATE_ENABLED = false;

export function isLoginGateEnabled(): boolean {
  return LOGIN_GATE_ENABLED;
}
