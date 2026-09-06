import { NextResponse } from "next/server";
import { getSitePhotos, getProjects, createSitePhoto } from "@/lib/data";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  const { client: supabase, sessionResponse } = guard;
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
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}

export async function POST(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json();
    const project_id = body.project_id as string | undefined;
    const photo_url = (body.photo_url as string)?.trim();
    if (!project_id?.trim()) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false as const, message: "project_id is required." },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }
    if (!photo_url) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false as const, message: "photo_url is required." },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }
    await createSitePhoto(
      {
        project_id,
        photo_url,
        description: body.description?.trim() ?? null,
        tags: body.tags?.trim() ?? null,
        uploaded_by: body.uploaded_by?.trim() ?? null,
      },
      guard.client
    );
    return withSessionCookies(NextResponse.json({ ok: true as const }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create site photo.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
