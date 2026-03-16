/**
 * Connect to the database and delete all test/seed data:
 * - Tasks (project_tasks): title "Untitled", title containing test keywords, or is_test = true
 * - Projects: name "Untitled" or name containing test keywords
 *
 * Usage: npx tsx scripts/cleanup-test-data.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const TEST_KEYWORDS = [
  "Workflow Test",
  "Test",
  "Test Vendor",
  "Test Worker",
  "Test Project",
  "Example",
  "Demo",
  "Untitled",
];

function loadEnvFile(filename: string) {
  const path = join(process.cwd(), filename);
  if (!existsSync(path)) return;
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

function uniqueIds(ids: string[]): string[] {
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  }
  return out;
}

async function main() {
  loadEnvFile(".env.local");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local");
    process.exit(1);
  }

  const client = createClient(url, key);
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  // 1. Tasks: "Untitled", test keywords, or is_test = true (tasks first — they reference projects)
  const taskIds: string[] = [];

  try {
    const { data: byFlag } = await client.from("project_tasks").select("id").eq("is_test", true);
    (byFlag ?? []).forEach((r: { id: string }) => taskIds.push(r.id));
  } catch {
    // Column is_test may not exist yet
  }

  for (const kw of TEST_KEYWORDS) {
    const { data } = await client.from("project_tasks").select("id").ilike("title", `%${kw}%`);
    (data ?? []).forEach((r: { id: string }) => taskIds.push(r.id));
  }

  const uniqueTaskIds = uniqueIds(taskIds);
  if (uniqueTaskIds.length > 0) {
    const { error } = await client.from("project_tasks").delete().in("id", uniqueTaskIds);
    if (error) {
      errors.push(`project_tasks: ${error.message}`);
    } else {
      deleted["project_tasks"] = uniqueTaskIds.length;
    }
  }

  // 2. Projects: "Untitled" or test keywords
  const projectIds: string[] = [];
  for (const kw of TEST_KEYWORDS) {
    const { data } = await client.from("projects").select("id").ilike("name", `%${kw}%`);
    (data ?? []).forEach((r: { id: string }) => projectIds.push(r.id));
  }
  const uniqueProjectIds = uniqueIds(projectIds);
  if (uniqueProjectIds.length > 0) {
    const { error } = await client.from("projects").delete().in("id", uniqueProjectIds);
    if (error) {
      errors.push(`projects: ${error.message}`);
    } else {
      deleted["projects"] = uniqueProjectIds.length;
    }
  }

  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  if (errors.length > 0) {
    console.error("Errors:");
    errors.forEach((e) => console.error("  ", e));
    process.exit(1);
  }
  if (total > 0) {
    console.log("Deleted:", deleted);
    console.log("Total rows removed:", total);
  } else {
    console.log("No test/seed tasks or projects found to delete.");
  }
}

main();
