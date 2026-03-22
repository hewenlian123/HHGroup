import { NextResponse } from "next/server";
import { getInspectionLogs, getProjects, createInspectionLog } from "@/lib/data";

export async function GET() {
  try {
    const [entries, projects] = await Promise.all([getInspectionLogs(), getProjects()]);
    return NextResponse.json({
      ok: true as const,
      entries,
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load inspection log.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
    await createInspectionLog({
      project_id,
      inspection_type: (body.inspection_type as string)?.trim() || "Inspection",
      inspector: body.inspector?.trim() ?? null,
      inspection_date: body.inspection_date?.slice(0, 10) ?? null,
      status: status as "passed" | "failed" | "pending",
      notes: body.notes?.trim() ?? null,
    });
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create inspection.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
