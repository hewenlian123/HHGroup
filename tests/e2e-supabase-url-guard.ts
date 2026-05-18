/**
 * Blocks Playwright / E2E DB mutations against hosted Supabase project URLs (`*.supabase.co`)
 * so seed, teardown, and cleanup never target production by accident.
 *
 * Local CLI default: http://127.0.0.1:54321
 *
 * Override (staging team only): `E2E_ALLOW_REMOTE_SUPABASE=1`
 */
export function assertE2ESupabaseUrlSafeForMutations(url: string | undefined | null): void {
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE === "1") return;
  const u = (url ?? "").trim().toLowerCase();
  if (!u) return;
  if (u.includes("supabase.co")) {
    throw new Error(
      "[E2E] Refusing DB mutations: NEXT_PUBLIC_SUPABASE_URL points at supabase.co (hosted project). " +
        "Use local Supabase for E2E: http://127.0.0.1:54321 — see .env.test.example. " +
        "Override only for intentional remote staging: E2E_ALLOW_REMOTE_SUPABASE=1."
    );
  }
}

/**
 * Blocks browser-driven E2E mutations against production app hosts. This matters for singleton
 * resources such as company_profile where UI tests can mutate the server-side production DB even
 * when the local test runner's Supabase env points somewhere safe.
 */
export function assertE2EBaseUrlSafeForMutations(url: string | undefined | null): void {
  if (process.env.E2E_ALLOW_PRODUCTION_APP_MUTATIONS === "1") return;
  const u = (url ?? "").trim().toLowerCase();
  if (!u) return;
  if (u.includes("hhprojectgroup.com")) {
    throw new Error(
      "[E2E] Refusing browser mutations against hhprojectgroup.com. " +
        "Use local app URL for E2E mutations, or set E2E_ALLOW_PRODUCTION_APP_MUTATIONS=1 only for an intentional protected staging run."
    );
  }
}
