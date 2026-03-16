/**
 * Ensure project_tasks table exists. Run when System Tests fail with "Table 'project_tasks' not found".
 * Usage: npx tsx scripts/ensure-project-tasks.ts
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
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

loadEnvLocal();

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

const PROJECT_TASKS_DDL = [
  `CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  due_date date,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON public.project_tasks (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_tasks_created_at ON public.project_tasks (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks (status)`,
  `ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`,
];

async function main() {
  if (!url) {
    console.error("Missing SUPABASE_DATABASE_URL or DATABASE_URL in .env.local");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    console.log("Ensuring project_tasks table...");
    for (const stmt of PROJECT_TASKS_DDL) {
      await sql.unsafe(stmt);
    }
    console.log("Done. project_tasks table and indexes are ready.");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
