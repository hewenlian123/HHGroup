import "server-only";

import postgres, { type Sql } from "postgres";
import { assertSupabaseTransactionPoolerUrl } from "@/lib/supabase-database-url";

let sql: Sql | undefined;

export function getSupabaseServerPostgres(): Sql | null {
  const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  const hostname = new URL(databaseUrl).hostname;

  if (process.env.VERCEL) {
    assertSupabaseTransactionPoolerUrl(
      databaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ""
    );
  }

  sql ??= postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: ["127.0.0.1", "localhost"].includes(hostname) ? false : "require",
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
  return sql;
}
