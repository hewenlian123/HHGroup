import { NextResponse } from "next/server";
import { getAllScheduleWithProject, getProjects, createProjectScheduleItem } from "@/lib/data";

export async function GET() {
  try {
    const [schedule, projects] = await Promise.all([getAllScheduleWithProject(), getProjects()]);
    return NextResponse.json({
      ok: true as const,
      schedule,
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load schedule.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const project_id = body.project_id as string | undefined;
    const title = (body.title as string)?.trim() || "Untitled";
    const start_date = body.start_date ? String(body.start_date).slice(0, 10) : null;
    const end_date = body.end_date ? String(body.end_date).slice(0, 10) : null;
    const status = (body.status as string) || "planned";
    if (!project_id) {
      return NextResponse.json(
        { ok: false as const, message: "project_id is required." },
        { status: 400 }
      );
    }
    await createProjectScheduleItem({
      project_id,
      title,
      start_date: start_date || undefined,
      end_date: end_date || undefined,
      status,
    });
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create schedule item.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
