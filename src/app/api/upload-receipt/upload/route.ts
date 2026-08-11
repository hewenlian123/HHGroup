import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

const BUCKET = "worker-receipts";
const MAX_WORKER_RECEIPT_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * Public worker receipt upload. Uses only the anon/RLS client; this endpoint never bypasses Storage policy.
 * Returns the private object path, never a public URL.
 */
export async function POST(req: Request) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonError("Invalid upload request.", 400);
    }

    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonError("Receipt file is required.", 400);
    }
    if (fileValue.size <= 0) {
      return jsonError("Receipt file is empty.", 400);
    }
    if (fileValue.size > MAX_WORKER_RECEIPT_UPLOAD_BYTES) {
      return jsonError("Receipt file is too large. Upload a file under 10 MB.", 413);
    }

    const ext = ALLOWED_RECEIPT_MIME_TYPES.get(fileValue.type);
    if (!ext) {
      return jsonError("Upload a JPG, PNG, WebP, or PDF receipt.", 415);
    }

    const path = `uploads/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, fileValue, {
      contentType: fileValue.type,
      upsert: false,
    });
    if (error) {
      console.error("[upload-receipt/upload] storage upload failed", {
        message: error.message,
        mimeType: fileValue.type,
        size: fileValue.size,
      });
      return jsonError("Receipt upload failed. Please try again.", 500);
    }
    return NextResponse.json({ ok: true as const, path, receipt_url: path });
  } catch (e) {
    console.error("[upload-receipt/upload] unexpected failure", {
      message: e instanceof Error ? e.message : String(e),
    });
    return jsonError("Receipt upload failed. Please try again.", 500);
  }
}
