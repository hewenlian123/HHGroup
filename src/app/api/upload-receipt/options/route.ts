import { NextResponse } from "next/server";
import { getWorkers, getProjects } from "@/lib/data";

/**
 * Public-friendly dropdown data (no auth). Workers + projects for receipt upload form.
 */
export async function GET() {
  try {
    const [workers, projects] = await Promise.all([getWorkers(), getProjects()]);
    return NextResponse.json({
      workers: workers.map((w) => ({ id: w.id, name: w.name })),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load options";
    return NextResponse.json({ message }, { status: 500 });
  }
}
