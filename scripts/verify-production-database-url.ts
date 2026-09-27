import { assertSupabaseTransactionPoolerUrl } from "../src/lib/supabase-database-url";

if (process.env.VERCEL) {
  const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!databaseUrl || !publicUrl) {
    throw new Error("Vercel requires SUPABASE_DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL.");
  }
  assertSupabaseTransactionPoolerUrl(databaseUrl, publicUrl);
  console.log("[env-gate] Supabase transaction pooler verified; runtime SSL is required.");
}
