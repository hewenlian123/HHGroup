import { NextResponse } from "next/server";
import { getAllTasksWithProject, getProjects, getWorkers } from "@/lib/data";

export async function GET() {
  try {
    const [tasks, projects, workers] = await Promise.all([
      getAllTasksWithProject(),
      getProjects(),
      getWorkers(),
    ]);
    return NextResponse.json({ ok: true as const, tasks, projects, workers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tasks.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
