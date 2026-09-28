import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { getSitePhotoById, updateSitePhoto, deleteSitePhoto } from "@/lib/data";
import { deleteDocument } from "@/lib/documents-db";

const STORAGE_BUCKET = "attachments";

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(_req, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const photo = await getSitePhotoById(id, guard.client);
    if (!photo) {
      return withSessionCookies(
        NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 }),
        guard.sessionResponse
      );
    }
    return withSessionCookies(
      NextResponse.json({ ok: true as const, photo }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load photo.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
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
      return withSessionCookies(
        NextResponse.json(
          { ok: false as const, message: "Not found or no changes." },
          { status: 404 }
        ),
        guard.sessionResponse
      );
    }
    return withSessionCookies(
      NextResponse.json({ ok: true as const, photo: updated }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update photo.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(_req, { noStore: true });
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const photo = await getSitePhotoById(id, guard.client);
    if (!photo) {
      return withSessionCookies(
        NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 }),
        guard.sessionResponse
      );
    }
    const writeGuard = await requireOrganizationRequestClient(_req, {
      projectId: photo.project_id,
      write: true,
      noStore: true,
    });
    if (!writeGuard.ok) return writeGuard.response;
    if (photo.photo_url?.trim()) {
      const path = photo.photo_url.trim();
      const document = await writeGuard.client
        .from("documents")
        .select("id")
        .eq("project_id", photo.project_id)
        .eq("file_path", path)
        .maybeSingle();
      if (document.error) throw new Error("Photo metadata is unavailable.");
      if (document.data) {
        await deleteDocument(document.data.id, true, writeGuard.client);
      } else if (!/^https?:\/\//i.test(path)) {
        const removed = await writeGuard.client.storage.from(STORAGE_BUCKET).remove([path]);
        if (removed.error) throw new Error(removed.error.message || "Photo cleanup failed.");
      }
    }
    await deleteSitePhoto(id, writeGuard.client);
    return withSessionCookies(NextResponse.json({ ok: true as const }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete photo.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
