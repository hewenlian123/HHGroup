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
      return NextResponse.json(
        { ok: false, message: error.message || "Upload failed. Ensure bucket 'worker-receipts' exists and policies allow upload." },
        { status: 500 }
      );
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true as const, path, receipt_url: pub.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
