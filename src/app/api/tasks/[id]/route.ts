import { NextResponse } from "next/server";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { deleteProjectTaskWithClient } from "@/lib/data";
import { isTestTask } from "@/lib/project-tasks-db";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * DELETE /api/tasks/[id]
 * Removes the task from the database. Test data (title starts with "Workflow Test") cannot be deleted from the UI — returns 403.
 * System tests should delete their own tasks via direct Supabase, not this API.
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, message: "Task id is required." }, { status: 400 });
  }

  const admin = getServerSupabaseAdmin();
  const server = admin ?? getServerSupabase();
  if (!server) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  try {
    const { data: row, error: fetchErr } = await server
      .from("project_tasks")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      return NextResponse.json({ ok: false, message: fetchErr.message ?? "Failed to load task." }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, message: "Task not found or already deleted." }, { status: 404 });
    }
    if (isTestTask({ title: (row as { title?: string }).title ?? "" })) {
      return NextResponse.json(
        { ok: false, message: "Test data cannot be deleted from the UI." },
        { status: 403 }
      );
    }
    await deleteProjectTaskWithClient(server, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete task.";
    if (message.includes("not found") || message.includes("already deleted")) {
      return NextResponse.json({ ok: false, message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
