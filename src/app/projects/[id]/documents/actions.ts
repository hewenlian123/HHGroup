"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";
import type { DocumentFileType } from "@/lib/documents-db";
import { DOCUMENT_FILE_TYPES } from "@/lib/data";

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

export async function uploadProjectDocument(
  projectId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireOrganizationServerActionClient({
    noStore: true,
    projectId,
    write: true,
  });
  if (!guard.ok) return { ok: false, error: guard.error };
  const file = formData.get("file") as File | null;
  if (!file?.size) return { ok: false, error: "No file selected." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File size must be under 20MB" };
  if (!ALLOWED_MIME.has(file.type || "")) return { ok: false, error: "Unsupported file type." };
  const fileTypeRaw = (formData.get("file_type") as string)?.trim();
  const fileType: DocumentFileType = DOCUMENT_FILE_TYPES.includes(fileTypeRaw as DocumentFileType)
    ? (fileTypeRaw as DocumentFileType)
    : "Other";
  const notes = (formData.get("notes") as string)?.trim() || null;

  try {
    await uploadDocumentFile(
      guard.client,
      {
        file_name: file.name,
        file_type: fileType,
        mime_type: file.type || null,
        size_bytes: file.size,
        project_id: projectId,
        notes,
      },
      file
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Document upload failed." };
  }

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
