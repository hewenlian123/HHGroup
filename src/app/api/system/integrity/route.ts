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
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { safeErrorMessage } from "@/lib/system-response-safety";
import postgres from "postgres";

export const dynamic = "force-dynamic";

/** Only very specific test terms; no generic words like "Test", "Example", "Demo", "Untitled". */
const TEST_KEYWORDS = ["Workflow Test", "Test Worker", "Test Project", "Test Vendor"];

/** Known real projects to exclude from stale test data check and cleanup. */
const WHITELIST_PROJECT_IDS = ["9d14a300-a682-498a-9e5e-3bd4a7e070c4"];

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

export async function GET(request: Request): Promise<NextResponse<DataIntegrityResult>> {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response as NextResponse<DataIntegrityResult>;

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

    // Project tasks, punch items, photos, inspections, and material selections are removed.
    // Task integrity categories stay in the response so System Health keeps its contract.
    const orphanedTasks: IntegrityCheck = { ok: true, count: 0, ids: [] };
    const ghostTasks: IntegrityCheck = { ok: true, count: 0, ids: [] };
    const duplicateTasks: IntegrityCheck = { ok: true, count: 0, ids: [] };
    const overdueCount = 0;
    const staleTaskIds: string[] = [];
    let staleProjectIds: string[] = [];
    try {
      for (const kw of TEST_KEYWORDS) {
        const pattern = `\\m${kw}\\M`;
        const p = await sql`
          SELECT id FROM public.projects
          WHERE name ~* ${pattern}
        `;
        (p as unknown as { id: string }[]).forEach((r) => staleProjectIds.push(r.id));
      }
      staleProjectIds = [...new Set(staleProjectIds)].filter(
        (id) => !WHITELIST_PROJECT_IDS.includes(id)
      );
    } catch (e) {
      errors.push(`Stale: ${safeErrorMessage(e)}`);
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
        errors: [safeErrorMessage(e)],
      },
      { status: 500 }
    );
  }
}
