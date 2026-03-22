/**
 * Previously ran ad-hoc DDL against SUPABASE_DATABASE_URL on each request.
 * Schema is now owned exclusively by `supabase/migrations/` (see repo database rules).
 *
 * Call sites (layout, /api/ensure-schema) are kept for backwards compatibility;
 * this function is a deliberate no-op so production/staging/local stay migration-driven.
 */

/**
 * No-op: tables and columns are created/altered only via Supabase migrations.
 */
export async function ensureConstructionSchema(): Promise<void> {
  // Intentionally empty — do not add DDL here.
}
