import { NextResponse } from "next/server";
import { getAllScheduleWithProject, getProjects, createProjectScheduleItem } from "@/lib/data";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { attachServerTiming } from "@/lib/performance/server-timing";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(request: Request) {
  const handlerStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  const authDuration = performance.now() - authStartedAt;
  let serverDataDuration = 0;
  const finish = <T extends Response>(response: T) =>
    attachServerTiming(response, {
      hh_auth: authDuration,
      hh_server_data: serverDataDuration,
      hh_handler_total: performance.now() - handlerStartedAt,
    });
  if (!guard.ok) return finish(guard.response);
  const { client: supabase, sessionResponse } = guard;
  const serverDataStartedAt = performance.now();
  try {
    const projectsPromise = getProjects(supabase);
    const schedulePromise = getAllScheduleWithProject(supabase, projectsPromise);
    const [schedule, projects] = await Promise.all([schedulePromise, projectsPromise]);
    serverDataDuration = performance.now() - serverDataStartedAt;
    return finish(
      withSessionCookies(
        NextResponse.json(
          {
            ok: true as const,
            schedule,
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
          },
          { headers: NO_CACHE_HEADERS }
        ),
        sessionResponse
      )
    );
  } catch (e) {
    serverDataDuration = performance.now() - serverDataStartedAt;
    const message = e instanceof Error ? e.message : "Failed to load schedule.";
    return finish(NextResponse.json({ ok: false as const, message }, { status: 500 }));
  }
}

export async function POST(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
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
    await createProjectScheduleItem(
      {
        project_id,
        title,
        start_date: start_date || undefined,
        end_date: end_date || undefined,
        status,
      },
      guard.client
    );
    return withSessionCookies(NextResponse.json({ ok: true as const }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create schedule item.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
