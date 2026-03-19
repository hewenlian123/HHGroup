/**
 * POST /api/system/integrity/cleanup
 *
 * Body: { category: 'orphaned' | 'ghost' | 'duplicate' | 'stale' }
 * Deletes the records for that category. For 'stale', deletes tasks then projects.
 */

import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

/** Must match integrity/route.ts: only specific test terms, word-boundary matching. */
const TEST_KEYWORDS = [
  "Workflow Test",
  "Test Worker",
  "Test Project",
  "Test Vendor",
];

/** Must match integrity/route.ts: real projects never deleted by stale cleanup. */
const WHITELIST_PROJECT_IDS = [
  "9d14a300-a682-498a-9e5e-3bd4a7e070c4",
];

type CleanupCategory = "orphaned" | "ghost" | "duplicate" | "stale";

export async function POST(request: Request) {
  let category: CleanupCategory;
  try {
    const body = await request.json().catch(() => ({}));
    category = body?.category;
    if (!category || !["orphaned", "ghost", "duplicate", "stale"].includes(category)) {
      return NextResponse.json(
        { ok: false, message: "Missing or invalid category. Use: orphaned, ghost, duplicate, stale." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const admin = getServerSupabaseAdmin();
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json(
      { ok: false, message: "Database URL not configured (SUPABASE_DATABASE_URL or DATABASE_URL)." },
      { status: 503 }
    );
  }

  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  async function deleteTaskIds(
    sqlClient: postgres.Sql,
    ids: string[]
  ): Promise<void> {
    if (ids.length === 0) return;
    if (admin) {
      const { error } = await admin.from("project_tasks").delete().in("id", ids);
      if (error) errors.push(`project_tasks: ${error.message}`);
      else deleted["project_tasks"] = (deleted["project_tasks"] ?? 0) + ids.length;
    } else {
      for (const id of ids) {
        await sqlClient`DELETE FROM public.project_tasks WHERE id = ${id}::uuid`;
        deleted["project_tasks"] = (deleted["project_tasks"] ?? 0) + 1;
      }
    }
  }

  async function deleteProjectIds(
    sqlClient: postgres.Sql,
    ids: string[]
  ): Promise<void> {
    if (ids.length === 0) return;
    if (admin) {
      const { error } = await admin.from("projects").delete().in("id", ids);
      if (error) errors.push(`projects: ${error.message}`);
      else deleted["projects"] = (deleted["projects"] ?? 0) + ids.length;
    } else {
      for (const id of ids) {
        await sqlClient`DELETE FROM public.projects WHERE id = ${id}::uuid`;
        deleted["projects"] = (deleted["projects"] ?? 0) + 1;
      }
    }
  }

  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });

    if (category === "orphaned") {
      const rows = await sql`
        SELECT pt.id FROM public.project_tasks pt
        LEFT JOIN public.projects p ON p.id = pt.project_id
        WHERE p.id IS NULL
      `;
      const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
      await deleteTaskIds(sql, ids);
      await sql.end();
    } else if (category === "ghost") {
      const rows = await sql`
        SELECT id FROM public.project_tasks
        WHERE trim(coalesce(title, '')) = ''
      `;
      const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
      await deleteTaskIds(sql, ids);
      await sql.end();
    } else if (category === "duplicate") {
      const rows = await sql`
        WITH dupes AS (
          SELECT id, row_number() OVER (PARTITION BY project_id, trim(coalesce(title,'')) ORDER BY created_at ASC) AS rn
          FROM public.project_tasks
        )
        SELECT id FROM dupes WHERE rn > 1
      `;
      const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
      await deleteTaskIds(sql, ids);
      await sql.end();
    } else {
      const staleTaskIds: string[] = [];
      const staleProjectIds: string[] = [];
      for (const kw of TEST_KEYWORDS) {
        const pattern = `\\m${kw}\\M`;
        const t = await sql`
          SELECT id FROM public.project_tasks
          WHERE title ~* ${pattern}
             OR (description IS NOT NULL AND description ~* ${pattern})
        `;
        (t as unknown as { id: string }[]).forEach((r) => staleTaskIds.push(r.id));
        const p = await sql`
          SELECT id FROM public.projects WHERE name ~* ${pattern}
        `;
        (p as unknown as { id: string }[]).forEach((r) => staleProjectIds.push(r.id));
      }
      const uniqueTaskIds = [...new Set(staleTaskIds)];
      const uniqueProjectIds = [...new Set(staleProjectIds)].filter(
        (id) => !WHITELIST_PROJECT_IDS.includes(id)
      );
      await deleteTaskIds(sql, uniqueTaskIds);
      // Delete all tasks belonging to stale projects so project delete can succeed (FK / CASCADE)
      if (uniqueProjectIds.length > 0) {
        const tasksInStaleProjects = await sql`
          SELECT id FROM public.project_tasks
          WHERE project_id IN ${sql(uniqueProjectIds)}
        `;
        const idsToDelete = (tasksInStaleProjects as unknown as { id: string }[]).map((r) => r.id);
        await deleteTaskIds(sql, idsToDelete);
      }
      await deleteProjectIds(sql, uniqueProjectIds);
      await sql.end();
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, deleted, errors }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted });
}
