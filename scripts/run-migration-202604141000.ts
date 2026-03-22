/**
 * Run migration 202604141000: add source, source_id to expenses and 'paid' status.
 * Usage from project root: npx tsx scripts/run-migration-202604141000.ts
 * Requires .env.local with SUPABASE_DATABASE_URL or DATABASE_URL (Supabase → Project Settings → Database → Connection string).
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import postgres from "postgres";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.warn(".env.local not found; using existing process.env");
    return;
  }
  const content = readFileSync(path, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

loadEnvLocal();

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

async function main() {
  if (!url) {
    console.error("Missing SUPABASE_DATABASE_URL or DATABASE_URL in .env.local");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  try {
    const migrationPath = join(
      process.cwd(),
      "supabase/migrations/202604141000_expenses_source_source_id_paid.sql"
    );
    const migrationSql = readFileSync(migrationPath, "utf8");

    console.log("Running migration 202604141000...");
    await sql.unsafe(migrationSql);
    console.log("Migration applied successfully.");

    const cols = await sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'expenses'
      and column_name in ('source', 'source_id')
      order by column_name
    `;
    console.log(
      "expenses columns (source, source_id):",
      cols.length === 2 ? "both exist" : cols.map((r) => r.column_name)
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
