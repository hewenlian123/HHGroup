"use server";

import { revalidatePath } from "next/cache";
import { deleteDocument, getDocumentById, getDocumentSignedUrl, insertDocument } from "@/lib/data";
import type { DocumentFileType } from "@/lib/documents-db";
import { DOCUMENT_FILE_TYPES } from "@/lib/data";
import { supabase } from "@/lib/supabase";

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

export async function getDocumentPreviewUrl(documentId: string): Promise<{ url: string | null; error?: string }> {
  const doc = await getDocumentById(documentId);
  if (!doc) return { url: null, error: "Document not found." };
  return getDocumentSignedUrl(doc.file_path, 120);
}

/** Return a signed URL for document download (same as preview, client can use for download). */
export async function getDocumentDownloadUrl(documentId: string): Promise<{ url: string | null; error?: string }> {
  return getDocumentPreviewUrl(documentId);
}

export async function deleteDocumentAction(documentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!documentId) return { ok: false, error: "Missing document id." };
    await deleteDocument(documentId, true);
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete document." };
  }
}

/** Upload a document (global or to a project). project_id optional. */
export async function uploadDocument(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file?.size) return { ok: false, error: "No file selected." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File size must be under 20MB" };
  if (!ALLOWED_MIME.has(file.type || "")) return { ok: false, error: "Unsupported file type." };
  const projectId = (formData.get("project_id") as string)?.trim() || null;
  const fileTypeRaw = (formData.get("file_type") as string)?.trim();
  const fileType: DocumentFileType = DOCUMENT_FILE_TYPES.includes(fileTypeRaw as DocumentFileType)
    ? (fileTypeRaw as DocumentFileType)
    : "Other";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!supabase) return { ok: false, error: "Storage not configured." };

  const safeName = sanitizeFileName(file.name);
  const pathPrefix = projectId ? `documents/${projectId}` : "documents/general";
  const path = `${pathPrefix}/${crypto.randomUUID()}-${safeName}`;

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

  revalidatePath("/documents");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
