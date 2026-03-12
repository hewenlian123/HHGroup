import { NextResponse } from "next/server";
import { getPunchListAll, getProjects, getWorkers } from "@/lib/data";

export async function GET() {
  try {
    const [items, projects, workers] = await Promise.all([
      getPunchListAll(),
      getProjects(),
      getWorkers(),
    ]);
    return NextResponse.json({ ok: true as const, items, projects, workers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load punch list.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
