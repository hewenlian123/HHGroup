import { NextResponse } from "next/server";
import { getInspectionLogs, getProjects, createInspectionLog } from "@/lib/data";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  try {
    const [entries, projects] = await Promise.all([
      getInspectionLogs(guard.client),
      getProjects(guard.client),
    ]);
    return withSessionCookies(
      NextResponse.json({
        ok: true as const,
        entries,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
      }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load inspection log.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json();
    const project_id = body.project_id as string | undefined;
    if (!project_id?.trim()) {
      return NextResponse.json(
        { ok: false as const, message: "project_id is required." },
        { status: 400 }
      );
    }
    const status = (body.status as string) || "pending";
    if (!["passed", "failed", "pending"].includes(status)) {
      return NextResponse.json(
        { ok: false as const, message: "status must be passed, failed, or pending." },
        { status: 400 }
      );
    }
    await createInspectionLog(
      {
        project_id,
        inspection_type: (body.inspection_type as string)?.trim() || "Inspection",
        inspector: body.inspector?.trim() ?? null,
        inspection_date: body.inspection_date?.slice(0, 10) ?? null,
        status: status as "passed" | "failed" | "pending",
        notes: body.notes?.trim() ?? null,
      },
      guard.client
    );
    return withSessionCookies(NextResponse.json({ ok: true as const }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create inspection.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
