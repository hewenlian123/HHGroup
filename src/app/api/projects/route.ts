import { NextResponse } from "next/server";
import { getProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Returns project list for health check and API consumers.
 */
export async function GET() {
  try {
    const projects = await getProjects();
    return NextResponse.json({ ok: true, projects });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load projects.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
