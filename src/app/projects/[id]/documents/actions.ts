"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { insertDocument } from "@/lib/data";
import type { DocumentFileType } from "@/lib/documents-db";
import { DOCUMENT_FILE_TYPES } from "@/lib/data";

const BUCKET = "attachments";
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export async function uploadProjectDocument(
  projectId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file?.size) return { ok: false, error: "No file selected." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File size must be under 20MB" };
  if (!ALLOWED_MIME.has(file.type || "")) return { ok: false, error: "Unsupported file type." };
  const fileTypeRaw = (formData.get("file_type") as string)?.trim();
  const fileType: DocumentFileType = DOCUMENT_FILE_TYPES.includes(fileTypeRaw as DocumentFileType)
    ? (fileTypeRaw as DocumentFileType)
    : "Other";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!supabase) return { ok: false, error: "Storage not configured." };

  const safeName = sanitizeFileName(file.name);
  const path = `documents/${projectId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  await insertDocument({
    file_name: file.name,
    file_path: path,
    file_type: fileType,
    mime_type: file.type || null,
    size_bytes: file.size,
    project_id: projectId,
    notes,
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
