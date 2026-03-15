import { NextResponse } from "next/server";
import { getAllTasksWithProject, getProjects, getWorkers } from "@/lib/data";
import { isTestTask } from "@/lib/project-tasks-db";

export async function GET() {
  try {
    const [allTasks, projects, workers] = await Promise.all([
      getAllTasksWithProject(),
      getProjects(),
      getWorkers(),
    ]);
    const tasks = allTasks.filter((t) => !isTestTask(t));
    return NextResponse.json({ ok: true as const, tasks, projects, workers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tasks.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
