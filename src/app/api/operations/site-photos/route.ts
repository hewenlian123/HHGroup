import { NextResponse } from "next/server";
import { getSitePhotos, getProjects, createSitePhoto } from "@/lib/data";
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

export async function GET(req: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;
  const sessionResponse = NextResponse.next();
  const supabase = createRouteSupabaseClient(req, sessionResponse, {
    noStore: true,
    forwardAuthorization: true,
  });
  if (!supabase) {
    return NextResponse.json(
      { ok: false as const, message: "Authenticated site-photo session is not configured." },
      { status: 503 }
    );
  }
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id") || undefined;
    const [photos, projects] = await Promise.all([
      getSitePhotos(projectId || null, supabase),
      getProjects(supabase),
    ]);
    return withSessionCookies(
      NextResponse.json(
        {
          ok: true as const,
          photos,
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
        },
        { headers: NO_CACHE_HEADERS }
      ),
      sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load site photos.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const project_id = body.project_id as string | undefined;
    const photo_url = (body.photo_url as string)?.trim();
    if (!project_id?.trim()) {
      return NextResponse.json(
        { ok: false as const, message: "project_id is required." },
        { status: 400 }
      );
    }
    if (!photo_url) {
      return NextResponse.json(
        { ok: false as const, message: "photo_url is required." },
        { status: 400 }
      );
    }
    await createSitePhoto({
      project_id,
      photo_url,
      description: body.description?.trim() ?? null,
      tags: body.tags?.trim() ?? null,
      uploaded_by: body.uploaded_by?.trim() ?? null,
    });
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create site photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
