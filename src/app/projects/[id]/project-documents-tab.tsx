"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { SectionHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { deleteDocumentAction, getDocumentPreviewUrl, getDocumentDownloadUrl } from "@/app/documents/actions";
import { uploadProjectDocument } from "./documents/actions";
import { DOCUMENT_FILE_TYPES } from "@/lib/data";
import type { DocumentRow } from "@/lib/data";

function formatDate(s: string): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

type Props = {
  projectId: string;
  documents: DocumentRow[];
};

export function ProjectDocumentsTab({ projectId, documents }: Props) {
  const router = useRouter();
  const [previewDoc, setPreviewDoc] = React.useState<DocumentRow | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const handlePreview = React.useCallback(async (doc: DocumentRow) => {
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setLoadingPreview(true);
    try {
      const result = await getDocumentPreviewUrl(doc.id);
      if (result.url) setPreviewUrl(result.url);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleDownload = React.useCallback(async (doc: DocumentRow) => {
    const result = await getDocumentDownloadUrl(doc.id);
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }, []);

  const handleDelete = React.useCallback(
    async (doc: DocumentRow) => {
      if (!window.confirm("Delete this document?")) return;
      setDeleteError(null);
      setDeletingId(doc.id);
      try {
        const res = await deleteDocumentAction(doc.id);
        if (!res.ok) {
          setDeleteError(res.error ?? "Delete failed.");
          return;
        }
        void syncRouterAndClients(router);
      } finally {
        setDeletingId(null);
      }
    },
    [router]
  );

  const handleUpload = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setUploadError(null);
      const form = e.currentTarget;
      const formData = new FormData(form);
      const file = formData.get("file") as File | null;
      if (!file?.size) {
        setUploadError("Select a file.");
        return;
      }
      setUploading(true);
      try {
        const result = await uploadProjectDocument(projectId, formData);
        if (result.ok) {
          formRef.current?.reset();
          void syncRouterAndClients(router);
        } else {
          setUploadError(result.error ?? "Upload failed.");
        }
      } finally {
        setUploading(false);
      }
    },
    [projectId, router]
  );

  return (
    <>
      <SectionHeader
        label="Upload"
        action={
          <form ref={formRef} onSubmit={handleUpload} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,image/*"
              capture="environment"
              className="min-h-[44px] text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs md:min-h-0"
            />
            <select
              name="file_type"
              defaultValue="Other"
              className="h-8 min-w-[100px] rounded border border-input bg-transparent px-2 text-xs"
            >
              {DOCUMENT_FILE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input
              name="notes"
              placeholder="Notes (optional)"
              className="h-8 w-36 text-xs"
            />
            <Button type="submit" size="sm" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            {uploadError && <span className="text-xs text-destructive">{uploadError}</span>}
          </form>
        }
      />
      <Divider />
      <SectionHeader label="Documents" className="mt-4" />
      <Divider />
      {documents.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No documents yet. Upload files above or view all in{" "}
          <a href="/documents" className="hover:text-foreground">Documents</a>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">File</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded</th>
                <th className="w-32 px-1" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 font-medium truncate max-w-[240px]" title={doc.file_name}>{doc.file_name}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{doc.file_type}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{formatDate(doc.uploaded_at)}</td>
                  <td className="py-1.5 px-1">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handlePreview(doc)}
                        disabled={loadingPreview}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleDownload(doc)}
                      >
                        Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DocumentPreviewModal
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        url={previewUrl}
        mimeType={previewDoc?.mime_type ?? null}
        fileName={previewDoc?.file_name ?? ""}
      />
      {deleteError ? (
        <p className="mt-2 text-xs text-destructive">
          {deleteError}
        </p>
      ) : null}
    </>
  );
}
