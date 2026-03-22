import { NextResponse } from "next/server";
import { getSitePhotoById, updateSitePhoto, deleteSitePhoto } from "@/lib/data";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

const STORAGE_BUCKET = "attachments";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const photo = await getSitePhotoById(id);
    if (!photo) {
      return NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true as const, photo });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateSitePhoto(id, {
      description: body.description !== undefined ? (body.description?.trim() ?? null) : undefined,
      tags: body.tags !== undefined ? (body.tags?.trim() ?? null) : undefined,
      uploaded_by: body.uploaded_by !== undefined ? (body.uploaded_by?.trim() ?? null) : undefined,
    });
    if (!updated) {
      return NextResponse.json(
        { ok: false as const, message: "Not found or no changes." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true as const, photo: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const photo = await getSitePhotoById(id);
    if (!photo) {
      return NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 });
    }
    const supabase = getServerSupabaseAdmin();
    if (supabase && photo.photo_url?.trim()) {
      await supabase.storage.from(STORAGE_BUCKET).remove([photo.photo_url.trim()]);
    }
    await deleteSitePhoto(id);
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete photo.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
