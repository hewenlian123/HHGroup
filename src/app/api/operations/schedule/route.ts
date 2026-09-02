import { NextResponse } from "next/server";
import { getAllScheduleWithProject, getProjects, createProjectScheduleItem } from "@/lib/data";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { createRouteSupabaseClient } from "@/lib/supabase-server";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const sessionResponse = NextResponse.next();
  const supabase = createRouteSupabaseClient(request, sessionResponse, {
    noStore: true,
    forwardAuthorization: true,
  });
  if (!supabase) {
    return NextResponse.json(
      { ok: false as const, message: "Authenticated schedule session is not configured." },
      { status: 503 }
    );
  }
  try {
    const [schedule, projects] = await Promise.all([
      getAllScheduleWithProject(supabase),
      getProjects(supabase),
    ]);
    return withSessionCookies(
      NextResponse.json(
        {
          ok: true as const,
          schedule,
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
        },
        { headers: NO_CACHE_HEADERS }
      ),
      sessionResponse
    );
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
