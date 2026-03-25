#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const entries = readdirSync(dir).filter((name) => {
  const full = join(dir, name);
  return statSync(full).isFile();
});

const expected = /^\d{12,14}_[a-z0-9_]+\.sql$/;
const bad = entries.filter((name) => !expected.test(name));

if (bad.length > 0) {
  console.error("Invalid migration file names found in supabase/migrations:");
  for (const name of bad) console.error(` - ${name}`);
  console.error("Expected pattern: <12-14 digit timestamp>_name.sql");
  process.exit(1);
}

console.log("Migration filename check passed.");
