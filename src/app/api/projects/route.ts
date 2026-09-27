import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { getProjects } from "@/lib/data";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Returns project list for health check and API consumers.
 */
export async function GET(request: Request) {
  const guard = await requireOrganizationRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const projects = await getProjects(guard.client);
    const response = withSessionCookies(
      NextResponse.json({ ok: true, projects }),
      guard.sessionResponse
    );

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load projects.";
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
