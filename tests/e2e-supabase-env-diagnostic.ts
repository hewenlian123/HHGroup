/** Safe Supabase env diagnostics for Playwright. No key characters are returned. */

function urlHost(url: string | undefined): string {
  if (!url?.trim()) return "(missing)";
  try {
    return new URL(url.trim()).host;
  } catch {
    return "(invalid URL)";
  }
}

export type E2ESupabaseEnvDiagnostic = {
  nextPublicSupabaseHost: string;
  hasPublishableKey: boolean;
  hasServerSecret: boolean;
  serverSecretSource: "modern" | "legacy-fallback" | "missing";
  /** True when URL + publishable + server secret are non-empty. */
  looksReadyForAdminMutations: boolean;
};

export function getE2ESupabaseEnvDiagnostic(): E2ESupabaseEnvDiagnostic {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const modernSecret = process.env.SUPABASE_SECRET_KEY;
  const legacySecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasPublishable = Boolean(publishable?.trim());
  const hasServerSecret = Boolean(modernSecret?.trim() || legacySecret?.trim());
  return {
    nextPublicSupabaseHost: urlHost(url),
    hasPublishableKey: hasPublishable,
    hasServerSecret,
    serverSecretSource: modernSecret?.trim()
      ? "modern"
      : legacySecret?.trim()
        ? "legacy-fallback"
        : "missing",
    looksReadyForAdminMutations: Boolean(url?.trim()) && hasPublishable && hasServerSecret,
  };
}

/** Logs one JSON line prefixed for grep-friendly CI logs. */
export function logE2ESupabaseEnvDiagnostics(tag = "[E2E Supabase env]"): void {
  const d = getE2ESupabaseEnvDiagnostic();
  // eslint-disable-next-line no-console
  console.log(tag, JSON.stringify(d));
}
