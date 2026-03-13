import { NextResponse } from "next/server";
import { getPunchListAll, getPunchListSummary, getProjects, getWorkers } from "@/lib/data";

function normStatus(s: string): string {
  return s === "in_progress" ? "assigned" : s === "resolved" ? "completed" : s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id")?.trim() || null;
  const statusFilter = url.searchParams.get("status")?.trim()?.toLowerCase() || null;
  try {
    const [allItems, summary, projects, workers] = await Promise.all([
      getPunchListAll(),
      getPunchListSummary(),
      getProjects(),
      getWorkers(),
    ]);
    let items = allItems;
    if (projectId) items = items.filter((i) => i.project_id === projectId);
    if (statusFilter && ["open", "assigned", "completed"].includes(statusFilter)) {
      items = items.filter((i) => normStatus(i.status) === statusFilter);
    }
    return NextResponse.json({ ok: true as const, items, summary, projects, workers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load punch list.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
