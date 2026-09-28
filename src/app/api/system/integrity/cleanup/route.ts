/**
 * POST /api/system/integrity/cleanup
 *
 * Body: { category: 'orphaned' | 'ghost' | 'duplicate' | 'stale' }
 * Orphaned, ghost, and duplicate categories previously cleaned project tasks.
 * Those tables are gone. Stale cleanup still deletes matching test projects.
 */

import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { guardDangerousMaintenanceRequest } from "@/lib/production-safety";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

/** Must match integrity/route.ts: only specific test terms, word-boundary matching. */
const TEST_KEYWORDS = ["Workflow Test", "Test Worker", "Test Project", "Test Vendor"];

/** Must match integrity/route.ts: real projects never deleted by stale cleanup. */
const WHITELIST_PROJECT_IDS = ["9d14a300-a682-498a-9e5e-3bd4a7e070c4"];
const CLEANUP_CONFIRMATION = "CLEAN UP";

type CleanupCategory = "orphaned" | "ghost" | "duplicate" | "stale";

export async function POST(request: Request) {
  const strictGuard = await requireSupabaseOwnerOrAdmin(request);
  if (!strictGuard.ok) return strictGuard.response;

  const blocked = guardDangerousMaintenanceRequest(request);
  if (blocked) return blocked;

  let category: CleanupCategory;
  try {
    const body = await request.json().catch(() => ({}));
    category = body?.category;
    if (!category || !["orphaned", "ghost", "duplicate", "stale"].includes(category)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing or invalid category. Use: orphaned, ghost, duplicate, stale.",
        },
        { status: 400 }
      );
    }
    if (body?.confirmation !== CLEANUP_CONFIRMATION) {
      return NextResponse.json(
        {
          ok: false,
          message: "Type CLEAN UP to confirm this integrity cleanup.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const admin = getServerSupabaseAdmin();
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        message: "Database URL not configured (SUPABASE_DATABASE_URL or DATABASE_URL).",
      },
      { status: 503 }
    );
  }

  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  if (category !== "stale") {
    return NextResponse.json({ ok: true, deleted });
  }

  async function deleteProjectIds(sqlClient: postgres.Sql, ids: string[]): Promise<void> {
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
    const staleProjectIds: string[] = [];
    for (const kw of TEST_KEYWORDS) {
      const pattern = `\\m${kw}\\M`;
      const p = await sql`
        SELECT id FROM public.projects WHERE name ~* ${pattern}
      `;
      (p as unknown as { id: string }[]).forEach((r) => staleProjectIds.push(r.id));
    }
    const uniqueProjectIds = [...new Set(staleProjectIds)].filter(
      (id) => !WHITELIST_PROJECT_IDS.includes(id)
    );
    await deleteProjectIds(sql, uniqueProjectIds);
    await sql.end();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, deleted, errors }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted });
}
