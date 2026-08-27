/** Shared project-file metadata. Files are stored in the attachments bucket. */

import { getSupabaseClient } from "@/lib/supabase";

export const DOCUMENT_FILE_TYPES = [
  "Contract",
  "Estimate",
  "Invoice",
  "Receipt",
  "Subcontract",
  "Permit",
  "Photo",
  "Daily Log",
  "Other",
] as const;

export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number];

export type DocumentRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: DocumentFileType;
  mime_type: string | null;
  size_bytes: number | null;
  project_id: string | null;
  related_module: string | null;
  related_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
};

export type DocumentDraft = {
  file_name: string;
  file_path: string;
  file_type?: DocumentFileType;
  mime_type?: string | null;
  size_bytes?: number | null;
  project_id?: string | null;
  related_module?: string | null;
  related_id?: string | null;
  uploaded_by?: string | null;
  notes?: string | null;
};

const BUCKET = "attachments";

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function mapRow(r: Record<string, unknown>): DocumentRow {
  return {
    id: (r.id as string) ?? "",
    file_name: (r.file_name as string) ?? "",
    file_path: (r.file_path as string) ?? "",
    file_type: (r.file_type as DocumentFileType) ?? "Other",
    mime_type: (r.mime_type as string | null) ?? null,
    size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    project_id: (r.project_id as string | null) ?? null,
    related_module: (r.related_module as string | null) ?? null,
    related_id: (r.related_id as string | null) ?? null,
    uploaded_by: (r.uploaded_by as string | null) ?? null,
    uploaded_at: (r.uploaded_at as string) ?? "",
    notes: (r.notes as string | null) ?? null,
  };
}

/** Get documents for a single project. */
export async function getDocumentsByProject(projectId: string): Promise<DocumentRow[]> {
  try {
    const c = client();
    const { data: rows, error } = await c
      .from("documents")
      .select(
        "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes"
      )
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });
    if (error) return [];
    return (rows ?? []).map((r: Record<string, unknown>) => mapRow(r));
  } catch {
    return [];
  }
}

/** Get one document by id. */
export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  try {
    const c = client();
    const { data: row, error } = await c
      .from("documents")
      .select(
        "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes"
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !row) return null;
    return mapRow(row as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Insert a document record (file must already be in storage at file_path). */
export async function insertDocument(draft: DocumentDraft): Promise<DocumentRow> {
  const c = client();
  const payload = {
    file_name: draft.file_name.trim(),
    file_path: draft.file_path.trim(),
    file_type: DOCUMENT_FILE_TYPES.includes(draft.file_type as DocumentFileType)
      ? draft.file_type
      : "Other",
    mime_type: draft.mime_type?.trim() || null,
    size_bytes: draft.size_bytes != null ? Number(draft.size_bytes) : null,
    project_id: draft.project_id || null,
    related_module: draft.related_module?.trim() || null,
    related_id: draft.related_id || null,
    uploaded_by: draft.uploaded_by?.trim() || null,
    notes: draft.notes?.trim() || null,
  };
  const { data: row, error } = await c.from("documents").insert(payload).select("*").single();
  if (error) throw new Error(error.message ?? "Failed to save document.");
  return mapRow(row as Record<string, unknown>);
}

/** Delete document record and optionally remove file from storage. */
export async function deleteDocument(id: string, removeFromStorage = true): Promise<boolean> {
  const c = client();
  const doc = await getDocumentById(id);
  if (!doc) return false;
  if (removeFromStorage) {
    const { error: storageError } = await c.storage.from(BUCKET).remove([doc.file_path]);
    if (storageError)
      throw new Error(storageError.message ?? "Failed to delete file from storage.");
  }
  const { error } = await c.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete document record.");
  return !error;
}

/** Create a signed URL for preview/download (expires in 60 seconds). */
export async function getDocumentSignedUrl(
  filePath: string,
  expiresIn = 60
): Promise<{ url: string | null; error?: string }> {
  const c = client();
  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(filePath, expiresIn);
  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null };
}

/** Check if mime type is previewable (PDF or image). */
export function isPreviewableMime(mime: string | null): boolean {
  if (!mime) return false;
  const t = mime.toLowerCase();
  return t === "application/pdf" || t.startsWith("image/");
}
