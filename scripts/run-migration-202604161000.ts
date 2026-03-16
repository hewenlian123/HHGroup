/**
 * Run migration 202604161000: add created_by (punch_list), approved_by (project_change_orders), project_id (payments_received).
 * Usage: npx tsx scripts/run-migration-202604161000.ts
 * Requires .env.local with SUPABASE_DATABASE_URL or DATABASE_URL.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import postgres from "postgres";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim().replace(/^["']|["']$/g, "");
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
    const migrationPath = join(process.cwd(), "supabase/migrations/202604161000_add_missing_columns.sql");
    const migrationSql = readFileSync(migrationPath, "utf8");

    console.log("Running migration 202604161000 (add missing columns)...");
    await sql.unsafe(migrationSql);
    console.log("Migration applied successfully.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
