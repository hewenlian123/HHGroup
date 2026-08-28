/** User-facing message when a server page’s primary data fetch fails (e.g. Supabase/env). */
export function serverDataLoadWarning(err: unknown, context: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Supabase is not configured") || msg.includes("not configured")) {
    return "Database connection is not configured. Check NEXT_PUBLIC_SUPABASE_URL and keys in the deployment environment.";
  }
  if (/\b42501\b|permission denied|row-level security|violates row-level security/i.test(msg)) {
    return `You do not have permission to load ${context}. Sign in with an authorized owner or admin account.`;
  }
  return `Could not load ${context}: ${msg}`;
}

export function logServerPageDataError(route: string, err: unknown): void {
  console.error(`[${route}] data load failed`, err);
}
