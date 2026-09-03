import { NextResponse } from "next/server";
import { getProjects } from "@/lib/data";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Returns project list for health check and API consumers.
 */
export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const projects = await getProjects(guard.client);
    const response = NextResponse.json({ ok: true, projects });
    for (const cookie of guard.sessionResponse.cookies.getAll()) {
      response.cookies.set(cookie);
    }
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load projects.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
