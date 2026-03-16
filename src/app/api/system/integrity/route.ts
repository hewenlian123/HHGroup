/**
 * GET /api/system/integrity
 *
 * Data integrity checks for the System Health page:
 * - Orphaned tasks (project no longer exists)
 * - Ghost tasks (missing title or project_id)
 * - Duplicate tasks (same title in same project)
 * - Overdue not completed (count only, for awareness)
 * - Stale test data (Untitled or test keywords)
 *
 * Returns counts and IDs for each category so the UI can show "Clean up" actions.
 */

import { NextResponse } from "next/server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

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

export type IntegrityCheck = {
  ok: boolean;
  count: number;
  ids?: string[];
};

export type DataIntegrityResult = {
  ok: boolean;
  orphanedTasks: IntegrityCheck;
  ghostTasks: IntegrityCheck;
  duplicateTasks: IntegrityCheck;
  overdueNotCompleted: { count: number };
  staleTestData: {
    tasks: IntegrityCheck;
    projects: IntegrityCheck;
  };
  errors?: string[];
};

export async function GET(): Promise<NextResponse<DataIntegrityResult>> {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json({
      ok: true,
      orphanedTasks: { ok: true, count: 0 },
      ghostTasks: { ok: true, count: 0 },
      duplicateTasks: { ok: true, count: 0 },
      overdueNotCompleted: { count: 0 },
      staleTestData: {
        tasks: { ok: true, count: 0 },
        projects: { ok: true, count: 0 },
      },
      errors: [
        "Data Integrity requires SUPABASE_DATABASE_URL or DATABASE_URL in .env.local. Add the direct PostgreSQL connection string from Supabase → Project Settings → Database → Connection string (URI).",
      ],
    });
  }

  const errors: string[] = [];

  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });

    // 1. Orphaned tasks — project_id not in projects
    let orphanedTasks: IntegrityCheck = { ok: true, count: 0 };
    try {
      const rows = await sql`
        SELECT pt.id
        FROM public.project_tasks pt
        LEFT JOIN public.projects p ON p.id = pt.project_id
        WHERE p.id IS NULL
      `;
      const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
      orphanedTasks = { ok: ids.length === 0, count: ids.length, ids };
    } catch (e) {
      errors.push(`Orphan: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Ghost tasks — no title or empty title (project_id is NOT NULL in schema)
    let ghostTasks: IntegrityCheck = { ok: true, count: 0 };
    try {
      const rows = await sql`
        SELECT id FROM public.project_tasks
        WHERE trim(coalesce(title, '')) = ''
      `;
      const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
      ghostTasks = { ok: ids.length === 0, count: ids.length, ids };
    } catch (e) {
      errors.push(`Ghost: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3. Duplicate tasks — same (project_id, title) with count > 1; return IDs to delete (keep one per group)
    let duplicateTasks: IntegrityCheck = { ok: true, count: 0 };
    try {
      const rows = await sql`
        WITH dupes AS (
          SELECT id, project_id, title,
            row_number() OVER (PARTITION BY project_id, trim(coalesce(title,'')) ORDER BY created_at ASC) AS rn
          FROM public.project_tasks
        )
        SELECT id FROM dupes WHERE rn > 1
      `;
      const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
      duplicateTasks = { ok: ids.length === 0, count: ids.length, ids };
    } catch (e) {
      errors.push(`Duplicate: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4. Overdue not completed — count only
    let overdueCount = 0;
    try {
      const rows = await sql`
        SELECT count(*)::int AS c
        FROM public.project_tasks
        WHERE due_date IS NOT NULL AND due_date < current_date AND status != 'done'
      `;
      overdueCount = Number((rows[0] as { c: number })?.c ?? 0);
    } catch (e) {
      errors.push(`Overdue: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 5. Stale test data — tasks and projects matching Untitled or test keywords
    let staleTaskIds: string[] = [];
    let staleProjectIds: string[] = [];
    try {
      for (const kw of TEST_KEYWORDS) {
        const t = await sql`
          SELECT id FROM public.project_tasks
          WHERE ilike(title, ${"%" + kw + "%"})
             OR (description IS NOT NULL AND ilike(description, ${"%" + kw + "%"}))
        `;
        (t as unknown as { id: string }[]).forEach((r) => staleTaskIds.push(r.id));
        const p = await sql`
          SELECT id FROM public.projects
          WHERE ilike(name, ${"%" + kw + "%"})
        `;
        (p as unknown as { id: string }[]).forEach((r) => staleProjectIds.push(r.id));
      }
      staleTaskIds = [...new Set(staleTaskIds)];
      staleProjectIds = [...new Set(staleProjectIds)];
    } catch (e) {
      errors.push(`Stale: ${e instanceof Error ? e.message : String(e)}`);
    }

    await sql.end();

    const staleTasks: IntegrityCheck = {
      ok: staleTaskIds.length === 0,
      count: staleTaskIds.length,
      ids: staleTaskIds,
    };
    const staleProjects: IntegrityCheck = {
      ok: staleProjectIds.length === 0,
      count: staleProjectIds.length,
      ids: staleProjectIds,
    };

    const ok =
      errors.length === 0 &&
      orphanedTasks.count === 0 &&
      ghostTasks.count === 0 &&
      duplicateTasks.count === 0 &&
      staleTasks.count === 0 &&
      staleProjects.count === 0;

    return NextResponse.json({
      ok,
      orphanedTasks,
      ghostTasks,
      duplicateTasks,
      overdueNotCompleted: { count: overdueCount },
      staleTestData: { tasks: staleTasks, projects: staleProjects },
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        orphanedTasks: { ok: false, count: 0 },
        ghostTasks: { ok: false, count: 0 },
        duplicateTasks: { ok: false, count: 0 },
        overdueNotCompleted: { count: 0 },
        staleTestData: {
          tasks: { ok: false, count: 0 },
          projects: { ok: false, count: 0 },
        },
        errors: [e instanceof Error ? e.message : String(e)],
      },
      { status: 500 }
    );
  }
}
