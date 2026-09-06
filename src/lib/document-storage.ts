import type { SupabaseClient } from "@supabase/supabase-js";
import { insertDocument, type DocumentDraft, type DocumentRow } from "@/lib/documents-db";

/** Reserve metadata first so Storage authorizes the exact resource and its organization. */
export async function uploadDocumentFile(
  client: SupabaseClient,
  draft: Omit<DocumentDraft, "file_path">,
  body: File | Blob | ArrayBuffer
): Promise<DocumentRow> {
  let organizationId = draft.organization_id;
  if (draft.project_id) {
    const { data, error } = await client
      .from("projects")
      .select("organization_id")
      .eq("id", draft.project_id)
      .single();
    if (error || !data?.organization_id)
      throw new Error("Project is unavailable or access was denied.");
    organizationId = data.organization_id;
  } else if (!organizationId) {
    const { data, error } = await client
      .from("organization_memberships")
      .select("organization_id")
      .eq("status", "active");
    if (error || data?.length !== 1)
      throw new Error("Choose an authorized organization before uploading.");
    organizationId = data[0].organization_id;
  }
  const id = crypto.randomUUID();
  const filename = draft.file_name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
  const scope = draft.project_id ? `projects/${draft.project_id}/documents` : "documents";
  const path = `organizations/${organizationId}/${scope}/${id}/${filename}`;
  const document = await insertDocument(
    { ...draft, id, organization_id: organizationId, file_path: path },
    client
  );
  try {
    const { error } = await client.storage.from("attachments").upload(path, body, {
      contentType: draft.mime_type || undefined,
      upsert: false,
    });
    if (error) throw new Error(error.message || "Document upload failed.");
    return document;
  } catch (error) {
    const cleanup = await client.storage
      .from("attachments")
      .remove([path])
      .catch(() => ({ error: { message: "Object cleanup unavailable." } }));
    if (cleanup.error)
      throw new Error(
        "Document upload failed and file cleanup failed. Its metadata was retained for recovery."
      );
    const removed = await client.from("documents").delete().eq("id", id).select("id");
    if (removed.error || !removed.data?.length)
      throw new Error(
        "Document upload failed and metadata cleanup failed. Please retry deleting the document."
      );
    throw error instanceof Error ? error : new Error("Document upload failed.");
  }
}
