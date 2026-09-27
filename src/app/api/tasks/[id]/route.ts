import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
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
  const guard = await requireOrganizationRequestClient(_req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) {
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Task id is required." }, { status: 400 }),
      guard.sessionResponse
    );
  }

  const client = guard.client;

  try {
    const { data: row, error: fetchErr } = await client
      .from("project_tasks")
      .select("id, title, project_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: fetchErr.message ?? "Failed to load task." },
          { status: 500 }
        ),
        guard.sessionResponse
      );
    }
    if (row && isTestTask({ title: (row as { title?: string }).title ?? "" })) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Test data cannot be deleted from the UI." },
          { status: 403 }
        ),
        guard.sessionResponse
      );
    }
    if (row) {
      const writeGuard = await requireOrganizationRequestClient(_req, {
        projectId: row.project_id,
        write: true,
        noStore: true,
      });
      if (!writeGuard.ok) return writeGuard.response;
    }
    // Always attempt delete so we never return success without persisting. Idempotent: 0 rows → 200.
    const rowsDeleted = await deleteProjectTaskWithClient(client, id);
    return withSessionCookies(NextResponse.json({ ok: true, rowsDeleted }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete task.";
    if (message.includes("not found") || message.includes("already deleted")) {
      return withSessionCookies(
        NextResponse.json({ ok: true, rowsDeleted: 0 }),
        guard.sessionResponse
      );
    }
    const isFkError = /foreign key|violates foreign key|referential integrity|referenced by/i.test(
      message
    );
    if (isFkError) {
      return withSessionCookies(
        NextResponse.json(
          {
            ok: false,
            message:
              "This task cannot be deleted because it is referenced by other records. Remove those references first, or try again later.",
          },
          { status: 409 }
        ),
        guard.sessionResponse
      );
    }
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
