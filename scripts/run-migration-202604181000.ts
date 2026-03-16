import fs from "fs";
import path from "path";
import postgres from "postgres";

async function main() {
  const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("SUPABASE_DATABASE_URL or DATABASE_URL is required to run migrations.");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });

  const migrationPath = path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "202604181000_worker_advances.sql",
  );

  const text = fs.readFileSync(migrationPath, "utf8");

  console.log("Running migration 202604181000_worker_advances.sql...");
  await sql.unsafe(text);
  await sql.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

