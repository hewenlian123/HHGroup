import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { getSitePhotoById, updateSitePhoto, deleteSitePhoto } from "@/lib/data";

const STORAGE_BUCKET = "attachments";

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(_req, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const photo = await getSitePhotoById(id, guard.client);
    if (!photo) {
      return NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 });
    }
    return withSessionCookies(
      NextResponse.json({ ok: true as const, photo }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateSitePhoto(
      id,
      {
        description:
          body.description !== undefined ? (body.description?.trim() ?? null) : undefined,
        tags: body.tags !== undefined ? (body.tags?.trim() ?? null) : undefined,
        uploaded_by:
          body.uploaded_by !== undefined ? (body.uploaded_by?.trim() ?? null) : undefined,
      },
      guard.client
    );
    if (!updated) {
      return NextResponse.json(
        { ok: false as const, message: "Not found or no changes." },
        { status: 404 }
      );
    }
    return withSessionCookies(
      NextResponse.json({ ok: true as const, photo: updated }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(_req, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const photo = await getSitePhotoById(id, guard.client);
    if (!photo) {
      return NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 });
    }
    if (photo.photo_url?.trim()) {
      await guard.client.storage.from(STORAGE_BUCKET).remove([photo.photo_url.trim()]);
    }
    await deleteSitePhoto(id, guard.client);
    return withSessionCookies(NextResponse.json({ ok: true as const }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
