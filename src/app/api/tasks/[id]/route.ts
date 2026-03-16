import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { deleteProjectTaskWithClient } from "@/lib/data";
import { isTestTask } from "@/lib/project-tasks-db";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * DELETE /api/tasks/[id]
 * Removes the task from the database. Idempotent: if the task is already deleted, returns 200 so the client can clear UI state.
 * Test data (title starts with "Workflow Test") cannot be deleted from the UI — returns 403.
 * System tests should delete their own tasks via direct Supabase, not this API.
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, message: "Task id is required." }, { status: 400 });
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required for task delete (RLS bypass)." },
      { status: 500 }
    );
  }

  try {
    const { data: row, error: fetchErr } = await admin
      .from("project_tasks")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      return NextResponse.json({ ok: false, message: fetchErr.message ?? "Failed to load task." }, { status: 500 });
    }
    if (row && isTestTask({ title: (row as { title?: string }).title ?? "" })) {
      return NextResponse.json(
        { ok: false, message: "Test data cannot be deleted from the UI." },
        { status: 403 }
      );
    }
    // Always attempt delete so we never return success without persisting. Idempotent: 0 rows → 200.
    const rowsDeleted = await deleteProjectTaskWithClient(admin, id);
    return NextResponse.json({ ok: true, rowsDeleted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete task.";
    if (message.includes("not found") || message.includes("already deleted")) {
      return NextResponse.json({ ok: true, rowsDeleted: 0 });
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
