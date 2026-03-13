import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const BUCKET = "worker-receipts";

/**
 * Upload receipt image to Supabase Storage. Bucket must exist and allow anon upload, or use service role.
 * Returns public URL for receipt_url.
 */
export async function POST(req: Request) {
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }
  try {
    // Debug: API upload start
    // eslint-disable-next-line no-console
    console.log("[api/upload-receipt/upload] start");
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json({ ok: false, message: "No file provided." }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["jpg", "jpeg", "png", "gif", "webp", "pdf"].includes(ext) ? ext : "jpg";
    const path = `uploads/${crypto.randomUUID()}.${safeExt}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[api/upload-receipt/upload] storage upload error", error);
      return NextResponse.json(
        { ok: false, message: error.message || "Upload failed. Ensure bucket 'worker-receipts' exists and policies allow upload." },
        { status: 500 }
      );
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Debug: API upload success
    // eslint-disable-next-line no-console
    console.log("[api/upload-receipt/upload] success", { bucket: BUCKET, path, publicUrl: pub.publicUrl });
    return NextResponse.json({ ok: true as const, path, receipt_url: pub.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    // eslint-disable-next-line no-console
    console.error("[api/upload-receipt/upload] unexpected error", e);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
