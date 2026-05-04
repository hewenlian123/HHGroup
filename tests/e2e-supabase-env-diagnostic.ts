/**
 * Safe Supabase env diagnostics for Playwright (no full secrets).
 * Call from global-setup or specs before sensitive E2E steps.
 */

function maskKeySuffix(value: string | undefined, visiblePrefixLen = 8): string {
  if (!value || value.trim() === "") return "(missing)";
  const v = value.trim();
  if (v.length <= visiblePrefixLen) return `${v.slice(0, 2)}…(${v.length} chars)`;
  return `${v.slice(0, visiblePrefixLen)}…`;
}

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
  hasAnonKey: boolean;
  anonKeyPrefix: string;
  hasServiceRoleKey: boolean;
  serviceRoleKeyPrefix: string;
  /** True when URL + anon + service role are non-empty (matches typical Playwright DB seed requirements). */
  looksReadyForAdminMutations: boolean;
};

export function getE2ESupabaseEnvDiagnostic(): E2ESupabaseEnvDiagnostic {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAnon = Boolean(anon?.trim());
  const hasSr = Boolean(sr?.trim());
  return {
    nextPublicSupabaseHost: urlHost(url),
    hasAnonKey: hasAnon,
    anonKeyPrefix: maskKeySuffix(anon),
    hasServiceRoleKey: hasSr,
    serviceRoleKeyPrefix: maskKeySuffix(sr),
    looksReadyForAdminMutations: Boolean(url?.trim()) && hasAnon && hasSr,
  };
}

/** Logs one JSON line prefixed for grep-friendly CI logs. */
export function logE2ESupabaseEnvDiagnostics(tag = "[E2E Supabase env]"): void {
  const d = getE2ESupabaseEnvDiagnostic();
  // eslint-disable-next-line no-console
  console.log(tag, JSON.stringify(d));
}
