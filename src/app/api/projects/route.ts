import { NextResponse } from "next/server";
import { getProjects } from "@/lib/data";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { createRouteSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Returns project list for health check and API consumers.
 */
export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const sessionResponse = NextResponse.next();
    const supabase = createRouteSupabaseClient(request, sessionResponse);
    if (!supabase) {
      return NextResponse.json(
        { ok: false, message: "Authenticated project session is not configured." },
        { status: 503 }
      );
    }
    const projects = await getProjects(supabase);
    const response = NextResponse.json({ ok: true, projects });
    for (const cookie of sessionResponse.cookies.getAll()) {
      response.cookies.set(cookie);
    }
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load projects.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
