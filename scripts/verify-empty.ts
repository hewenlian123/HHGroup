/**
 * Verify specified tables have zero rows.
 * Usage: npx tsx scripts/verify-empty.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnvFile(filename: string) {
  const p = join(process.cwd(), filename);
  if (!existsSync(p)) return;
  const content = readFileSync(p, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  });
}

const TABLES_TO_CHECK = [
  "project_tasks",
  "punch_list",
  "projects",
  "workers",
  "invoices",
  "expenses",
];

async function main() {
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env");
    process.exit(1);
  }
  const c = createClient(url, key);
  const counts: Record<string, number> = {};
  for (const table of TABLES_TO_CHECK) {
    const { count, error } = await c.from(table).select("id", { count: "exact", head: true });
    if (error) {
      if (
        /relation.*does not exist|table.*does not exist|could not find the table/i.test(
          error.message ?? ""
        )
      ) {
        counts[table] = -1; // table missing
      } else {
        console.error(`${table}: ${error.message}`);
        counts[table] = -2; // error
      }
    } else {
      counts[table] = count ?? 0;
    }
  }
  console.log("Row counts:", counts);
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
  const missing = Object.entries(counts).filter(([, n]) => n === -1);
  if (missing.length)
    console.log("Tables not found (skipped):", missing.map(([t]) => t).join(", "));
  if (nonEmpty.length) {
    console.log("NON-EMPTY:", nonEmpty.map(([t, n]) => `${t}=${n}`).join(", "));
    process.exit(1);
  }
  console.log("All checked tables are empty.");
  process.exit(0);
}

main();
