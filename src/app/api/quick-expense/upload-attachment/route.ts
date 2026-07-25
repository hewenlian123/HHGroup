import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

const BUCKET = "expense-attachments";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function safeExtension(file: File): string {
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export async function POST(req: Request) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!(file instanceof File)) return apiError(400, "Receipt file is required.");
    if (file.size <= 0) return apiError(400, "Receipt file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError(400, "Receipt file is too large. Upload a file under 25 MB.");
    }
    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      return apiError(400, "Only JPEG, PNG, WebP, HEIC, HEIF, and PDF receipts are allowed.");
    }

    const path = `quick-expense/${Date.now()}-${crypto.randomUUID()}.${safeExtension(file)}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error("[quick-expense/upload-attachment] upload failed", error);
      return apiError(500, "Receipt upload failed.");
    }

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
    return NextResponse.json(
      {
        ok: true as const,
        path,
        signed_url: signed?.signedUrl ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[quick-expense/upload-attachment] unexpected upload error", e);
    return apiError(500, "Receipt upload failed.");
  }
}
