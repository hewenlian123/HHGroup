const SUPABASE_PUBLIC_HOST = /^([a-z0-9]+)\.supabase\.co$/i;

export function assertSupabaseTransactionPoolerUrl(
  databaseUrl: string,
  publicSupabaseUrl: string
): void {
  let database: URL;
  let publicUrl: URL;
  try {
    database = new URL(databaseUrl);
    publicUrl = new URL(publicSupabaseUrl);
  } catch {
    throw new Error("Supabase database connection is invalid.");
  }

  const projectRef = publicUrl.hostname.match(SUPABASE_PUBLIC_HOST)?.[1];
  if (!projectRef) throw new Error("Supabase public URL is invalid.");

  const sharedPooler =
    database.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(database.username).endsWith(`.${projectRef}`);
  const dedicatedPooler = database.hostname === `db.${projectRef}.supabase.co`;
  if (database.port !== "6543" || (!sharedPooler && !dedicatedPooler)) {
    throw new Error("SUPABASE_DATABASE_URL must use this project's transaction pooler.");
  }

  const sslMode = database.searchParams.get("sslmode");
  if (sslMode && !["require", "verify-full"].includes(sslMode)) {
    throw new Error("SUPABASE_DATABASE_URL must require SSL.");
  }
}
