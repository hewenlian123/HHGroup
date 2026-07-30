import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { normalizeReceiptLocation } from "@/lib/expense-receipt-reference";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_BUCKET = "attachments";
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

type AttachmentRow = {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
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

function safeFileName(name: string): string {
  const trimmed = name.trim() || "attachment";
  return trimmed.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120);
}

async function requireClient(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return { response: guard.response, supabase: null };
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return { response: apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE), supabase };
  return { response: null, supabase };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { response, supabase } = await requireClient(request);
  if (response || !supabase) return response;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: { attachmentIds?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return apiError(400, "Invalid attachment request.");
    }
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter((value): value is string => typeof value === "string")
      : [];
    if (attachmentIds.length === 0) return apiError(400, "Attachment ids are required.");

    const { data, error } = await supabase
      .from("attachments")
      .select("id, created_at, entity_type, entity_id, file_name, file_path, mime_type, size_bytes")
      .eq("entity_type", "expense")
      .eq("entity_id", id)
      .in("id", attachmentIds);
    if (error) {
      console.error("[expenses/:id/attachments] load for signed urls failed", error);
      return apiError(500, "Failed to load attachments.");
    }

    const signed = await Promise.all(
      ((data ?? []) as AttachmentRow[]).map(async (row) => {
        const location = normalizeReceiptLocation(row.file_path);
        if (!location) return { row, signedUrl: "", signFailed: false };
        const { data: urlData, error: signError } = await supabase.storage
          .from(location.bucket)
          .createSignedUrl(location.path, 60);
        return { row, signedUrl: urlData?.signedUrl ?? "", signFailed: Boolean(signError) };
      })
    );
    if (!signed.some((item) => item.signedUrl)) {
      console.warn("[expenses/:id/attachments] receipt unavailable", {
        attachmentCount: signed.length,
        signingFailureCount: signed.filter((item) => item.signFailed).length,
      });
      return apiError(404, "Original receipt file unavailable.");
    }

    return NextResponse.json(
      {
        ok: true,
        files: signed.map(({ row, signedUrl }) => ({
          id: row.id,
          url: signedUrl,
          fileName: row.file_name ?? "File",
          mimeType: row.mime_type ?? "",
        })),
      },
      { headers: NO_CACHE_HEADERS }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError(400, "Attachment file is required.");
  if (file.size <= 0) return apiError(400, "Attachment file is empty.");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return apiError(400, "Attachment file is too large. Upload a file under 25 MB.");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return apiError(400, "Only JPEG, PNG, WebP, HEIC, HEIF, and PDF attachments are allowed.");
  }

  const fileName = safeFileName(file.name);
  const filePath = `attachments/expenses/${id}/${crypto.randomUUID()}.${safeExtension(file)}`;
  const uploadRes = await supabase.storage.from(ATTACHMENT_BUCKET).upload(filePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadRes.error) {
    console.error("[expenses/:id/attachments] upload failed", uploadRes.error);
    return apiError(500, "Attachment upload failed.");
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert([
      {
        entity_type: "expense",
        entity_id: id,
        file_name: fileName,
        file_path: filePath,
        mime_type: file.type,
        size_bytes: file.size,
      },
    ])
    .select("id, created_at, entity_type, entity_id, file_name, file_path, mime_type, size_bytes")
    .single();
  if (error) {
    console.error("[expenses/:id/attachments] record insert failed", error);
    await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove([filePath])
      .catch(() => {});
    return apiError(500, "Attachment upload failed.");
  }

  return NextResponse.json({ ok: true, attachment: data }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { response, supabase } = await requireClient(request);
  if (response || !supabase) return response;

  const url = new URL(request.url);
  const attachmentId = url.searchParams.get("attachmentId")?.trim();
  if (!attachmentId) return apiError(400, "Attachment id is required.");

  const { data: row, error: loadError } = await supabase
    .from("attachments")
    .select("id, file_path")
    .eq("id", attachmentId)
    .eq("entity_type", "expense")
    .eq("entity_id", id)
    .maybeSingle();
  if (loadError) {
    console.error("[expenses/:id/attachments] delete load failed", loadError);
    return apiError(500, "Failed to delete attachment.");
  }
  if (!row) return apiError(404, "Attachment not found.");

  const filePath = (row as { file_path?: unknown }).file_path;
  if (typeof filePath === "string" && filePath) {
    const storageRes = await supabase.storage.from(ATTACHMENT_BUCKET).remove([filePath]);
    if (storageRes.error) {
      console.error("[expenses/:id/attachments] storage delete failed", storageRes.error);
      return apiError(500, "Failed to delete attachment.");
    }
  }

  const { data, error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("entity_type", "expense")
    .eq("entity_id", id)
    .select("id");
  if (error) {
    console.error("[expenses/:id/attachments] record delete failed", error);
    return apiError(500, "Failed to delete attachment.");
  }
  if (!data || data.length === 0) return apiError(404, "Attachment not found.");
  return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
}
