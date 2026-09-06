"use server";

import { revalidatePath } from "next/cache";
import { deleteDocument, getDocumentById, getDocumentSignedUrl } from "@/lib/data";
import type { DocumentFileType } from "@/lib/documents-db";
import { DOCUMENT_FILE_TYPES } from "@/lib/data";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";

import { uploadDocumentFile } from "@/lib/document-storage";
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

export async function getDocumentPreviewUrl(
  documentId: string
): Promise<{ url: string | null; error?: string }> {
  const guard = await requireOrganizationServerActionClient({ noStore: true });
  if (!guard.ok) return { url: null, error: guard.error };
  try {
    const doc = await getDocumentById(documentId, guard.client);
    if (!doc) return { url: null, error: "Document not found." };
    return await getDocumentSignedUrl(doc.file_path, 120, guard.client);
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "Document unavailable." };
  }
}

/** Return a signed URL for document download (same as preview, client can use for download). */
export async function getDocumentDownloadUrl(
  documentId: string
): Promise<{ url: string | null; error?: string }> {
  return getDocumentPreviewUrl(documentId);
}

export async function deleteDocumentAction(
  documentId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!documentId) return { ok: false, error: "Missing document id." };
    const guard = await requireOrganizationServerActionClient({ noStore: true });
    if (!guard.ok) return { ok: false, error: guard.error };
    const record = await guard.client
      .from("documents")
      .select("organization_id")
      .eq("id", documentId)
      .maybeSingle();
    if (record.error || !record.data) return { ok: false, error: "Document is unavailable." };
    const organizationId = record.data.organization_id;
    if (
      !guard.context.memberships.some(
        (member) => member.organization_id === organizationId && member.role !== "assistant"
      )
    )
      return { ok: false, error: "Organization administrator access required." };
    const deleted = await deleteDocument(documentId, true, guard.client);
    if (!deleted) return { ok: false, error: "Document not found or could not be deleted." };
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete document." };
  }
}

/** Upload a document (global or to a project). project_id optional. */
export async function uploadDocument(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const projectId = (formData.get("project_id") as string)?.trim() || null;
  const guard = await requireOrganizationServerActionClient({
    noStore: true,
    write: true,
    ...(projectId ? { projectId } : {}),
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
        organization_id: guard.context.organizationId ?? undefined,
      },
      file
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Document upload failed." };
  }

  revalidatePath("/documents");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
