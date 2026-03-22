/**
 * Documents Center — canonical document metadata. Files stored in Supabase Storage (attachments bucket).
 */

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

export type DocumentWithProject = DocumentRow & {
  project_name: string | null;
};

export type DocumentFilters = {
  project_id?: string | null;
  file_type?: DocumentFileType | null;
  related_module?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  search?: string | null;
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

/** On any query error, return empty/list so app does not 500. */
function safeReturnDocuments(): DocumentWithProject[] {
  return [];
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

/** List documents with optional filters and search. */
export async function getDocuments(filters: DocumentFilters = {}): Promise<DocumentWithProject[]> {
  const c = client();
  const colsWithProject =
    "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes, projects(name)";
  const colsOnly =
    "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes";

  let q = c.from("documents").select(colsWithProject).order("uploaded_at", { ascending: false });

  if (filters.project_id) q = q.eq("project_id", filters.project_id);
  if (filters.file_type) q = q.eq("file_type", filters.file_type);
  if (filters.related_module) q = q.eq("related_module", filters.related_module);
  if (filters.date_from) q = q.gte("uploaded_at", filters.date_from);
  if (filters.date_to) q = q.lte("uploaded_at", filters.date_to + "T23:59:59.999Z");
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    q = q.ilike("file_name", term);
  }

  const { data: rows, error } = await q;
  if (error) {
    try {
      let qFallback = c
        .from("documents")
        .select(colsOnly)
        .order("uploaded_at", { ascending: false });
      if (filters.project_id) qFallback = qFallback.eq("project_id", filters.project_id);
      if (filters.file_type) qFallback = qFallback.eq("file_type", filters.file_type);
      if (filters.related_module)
        qFallback = qFallback.eq("related_module", filters.related_module);
      if (filters.date_from) qFallback = qFallback.gte("uploaded_at", filters.date_from);
      if (filters.date_to)
        qFallback = qFallback.lte("uploaded_at", filters.date_to + "T23:59:59.999Z");
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim().toLowerCase()}%`;
        qFallback = qFallback.ilike("file_name", term);
      }
      const res = await qFallback;
      if (res.error) return safeReturnDocuments();
      return (res.data ?? []).map((r: Record<string, unknown>) => ({
        ...mapRow(r),
        project_name: null,
      }));
    } catch {
      return safeReturnDocuments();
    }
  }
  return (rows ?? []).map((r: Record<string, unknown>) => {
    const proj = r.projects as { name?: string } | null;
    const row = mapRow(r);
    return { ...row, project_name: proj?.name ?? null };
  });
}

export async function getDocumentsPaged(
  input: DocumentFilters & { page?: number; pageSize?: number } = {}
): Promise<{ rows: DocumentWithProject[]; total: number }> {
  const c = client();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const colsWithProject =
    "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes, projects(name)";
  const colsOnly =
    "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes";

  let q = c
    .from("documents")
    .select(colsWithProject, { count: "exact" })
    .order("uploaded_at", { ascending: false });

  if (input.project_id) q = q.eq("project_id", input.project_id);
  if (input.file_type) q = q.eq("file_type", input.file_type);
  if (input.related_module) q = q.eq("related_module", input.related_module);
  if (input.date_from) q = q.gte("uploaded_at", input.date_from);
  if (input.date_to) q = q.lte("uploaded_at", input.date_to + "T23:59:59.999Z");
  if (input.search?.trim()) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    q = q.ilike("file_name", term);
  }

  const res = await q.range(from, to);
  if (res.error) {
    try {
      let qFallback = c
        .from("documents")
        .select(colsOnly, { count: "exact" })
        .order("uploaded_at", { ascending: false });
      if (input.project_id) qFallback = qFallback.eq("project_id", input.project_id);
      if (input.file_type) qFallback = qFallback.eq("file_type", input.file_type);
      if (input.related_module) qFallback = qFallback.eq("related_module", input.related_module);
      if (input.date_from) qFallback = qFallback.gte("uploaded_at", input.date_from);
      if (input.date_to) qFallback = qFallback.lte("uploaded_at", input.date_to + "T23:59:59.999Z");
      if (input.search?.trim()) {
        const term = `%${input.search.trim().toLowerCase()}%`;
        qFallback = qFallback.ilike("file_name", term);
      }
      const fallback = await qFallback.range(from, to);
      if (fallback.error) return { rows: safeReturnDocuments(), total: 0 };
      return {
        rows: (fallback.data ?? []).map((r: Record<string, unknown>) => ({
          ...mapRow(r),
          project_name: null,
        })),
        total: fallback.count ?? 0,
      };
    } catch {
      return { rows: safeReturnDocuments(), total: 0 };
    }
  }

  const rows = (res.data ?? []).map((r: Record<string, unknown>) => {
    const proj = r.projects as { name?: string } | null;
    const row = mapRow(r);
    return { ...row, project_name: proj?.name ?? null };
  });
  return { rows, total: res.count ?? rows.length };
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
export async function getDocumentById(id: string): Promise<DocumentWithProject | null> {
  try {
    const c = client();
    const { data: row, error } = await c
      .from("documents")
      .select(
        "id, file_name, file_path, file_type, mime_type, size_bytes, project_id, related_module, related_id, uploaded_by, uploaded_at, notes, projects(name)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !row) return null;
    const r = row as Record<string, unknown>;
    const proj = r.projects as { name?: string } | null;
    return { ...mapRow(r), project_name: proj?.name ?? null };
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
