/**
 * POST /api/system/integrity/cleanup
 *
 * Body: { category: "stale", confirmation: "CLEAN UP" }
 * Deletes stale test projects while preserving the explicit allowlist.
 */

import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { guardDangerousMaintenanceRequest } from "@/lib/production-safety";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

const TEST_KEYWORDS = ["Workflow Test", "Test Worker", "Test Project", "Test Vendor"];
const WHITELIST_PROJECT_IDS = ["9d14a300-a682-498a-9e5e-3bd4a7e070c4"];
const CLEANUP_CONFIRMATION = "CLEAN UP";

export async function POST(request: Request) {
  const strictGuard = await requireSupabaseOwnerOrAdmin(request);
  if (!strictGuard.ok) return strictGuard.response;

  const blocked = guardDangerousMaintenanceRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.category !== "stale") {
      return NextResponse.json(
        { ok: false, message: "Missing or invalid category. Use: stale." },
        { status: 400 }
      );
    }
    if (body?.confirmation !== CLEANUP_CONFIRMATION) {
      return NextResponse.json(
        { ok: false, message: "Type CLEAN UP to confirm this integrity cleanup." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

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
  const admin = getServerSupabaseAdmin();
  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  try {
    const staleProjectIds: string[] = [];
    for (const keyword of TEST_KEYWORDS) {
      const pattern = `\\m${keyword}\\M`;
      const rows = await sql`
        SELECT id FROM public.projects WHERE name ~* ${pattern}
      `;
      (rows as unknown as { id: string }[]).forEach((row) => staleProjectIds.push(row.id));
    }

    const uniqueProjectIds = [...new Set(staleProjectIds)].filter(
      (id) => !WHITELIST_PROJECT_IDS.includes(id)
    );

    if (uniqueProjectIds.length > 0) {
      if (admin) {
        const { error } = await admin.from("projects").delete().in("id", uniqueProjectIds);
        if (error) errors.push(`projects: ${error.message}`);
        else deleted.projects = uniqueProjectIds.length;
      } else {
        for (const id of uniqueProjectIds) {
          await sql`DELETE FROM public.projects WHERE id = ${id}::uuid`;
          deleted.projects = (deleted.projects ?? 0) + 1;
        }
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await sql.end();
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, deleted, errors }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted });
}
