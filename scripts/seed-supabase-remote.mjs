/**
 * Apply supabase/seed.sql to a remote Supabase project via the Management API.
 * Replaces removed CLI command: `supabase db execute --file ... --project-ref ...`
 *
 * Env:
 *   SUPABASE_PROJECT_REF   — project ref (dashboard URL)
 *   SUPABASE_ACCESS_TOKEN  — Personal Access Token with database_write (or legacy broad PAT)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seedPath = path.join(root, "supabase", "seed.sql");

const ref = process.env.SUPABASE_PROJECT_REF?.trim();
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!ref || !token) {
  console.error(
    "Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN.\n" +
      "Use a Supabase Personal Access Token with database_write for the Management API."
  );
  process.exit(1);
}

const query = fs.readFileSync(seedPath, "utf8");
const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Supabase Management API error ${res.status}: ${text}`);
  process.exit(1);
}

if (text) console.log(text);
else console.log("Remote seed completed.");
