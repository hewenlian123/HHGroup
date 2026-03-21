"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Divider,
  SectionHeader,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { EmptyState } from "@/components/empty-state";
import { FileUp } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import {
  getDocumentPreviewUrl,
  getDocumentDownloadUrl,
  deleteDocumentAction,
  uploadDocument,
} from "./actions";
import type { DocumentWithProject } from "@/lib/data";
import { DOCUMENT_FILE_TYPES } from "@/lib/data";

function formatBytes(n: number | null): string {
  if (n == null || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s: string): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

/** Build link to related record when document has related_module and related_id. */
function getRelatedRecordUrl(doc: DocumentWithProject): string | null {
  const mod = (doc.related_module ?? "").trim();
  const id = doc.related_id ?? "";
  if (!id) return null;
  switch (mod) {
    case "Project":
      return `/projects/${id}`;
    case "Estimate":
      return `/estimates/${id}`;
    case "Invoice":
      return `/financial/invoices/${id}`;
    case "Expense":
      return `/financial/expenses`;
    case "Subcontract":
      return doc.project_id ? `/projects/${doc.project_id}/subcontracts/${id}/bills` : null;
    case "Labor":
      return "/labor/entries";
    case "Daily Log":
      return "/labor/daily";
    case "General":
    default:
      return null;
  }
}

type Props = {
  documents: DocumentWithProject[];
  projects: { id: string; name: string }[];
  total: number;
};

export function DocumentsListClient({ documents, projects, total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localDocuments, setLocalDocuments] = React.useState<DocumentWithProject[]>(documents);
  React.useEffect(() => setLocalDocuments(documents), [documents]);
  const [previewDoc, setPreviewDoc] = React.useState<DocumentWithProject | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const search = searchParams.get("search") ?? "";
  const projectId = searchParams.get("project_id") ?? "";
  const fileType = searchParams.get("file_type") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;

  const [searchInput, setSearchInput] = React.useState(search);
  React.useEffect(() => setSearchInput(search), [search]);

  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const uploadFormRef = React.useRef<HTMLFormElement>(null);

  const setFilters = React.useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next.set(k, v);
        else next.delete(k);
      });
      if (!("page" in updates)) next.set("page", "1");
      router.push(`/documents?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    router.push(`/documents?${next.toString()}`, { scroll: false });
  };

  const handlePreview = React.useCallback(async (doc: DocumentWithProject) => {
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

  const handleDownload = React.useCallback(async (doc: DocumentWithProject) => {
    const result = await getDocumentDownloadUrl(doc.id);
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }, []);

  const handleDelete = React.useCallback(
    async (doc: DocumentWithProject) => {
      if (!window.confirm("Delete this document?")) return;
      setDeleteError(null);
      let snapshot: DocumentWithProject[] | undefined;
      setLocalDocuments((prev) => {
        snapshot = prev;
        return prev.filter((d) => d.id !== doc.id);
      });
      setDeletingId(doc.id);
      try {
        const res = await deleteDocumentAction(doc.id);
        if (!res.ok) {
          if (snapshot) setLocalDocuments(snapshot);
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

  const handleUploadSubmit = React.useCallback(
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
        const result = await uploadDocument(formData);
        if (result.ok) {
          uploadFormRef.current?.reset();
          setUploadOpen(false);
          void syncRouterAndClients(router);
        } else {
          setUploadError(result.error ?? "Upload failed.");
        }
      } finally {
        setUploading(false);
      }
    },
    [router]
  );

  return (
    <>
      <SectionHeader
        label="Filters"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
            <Input
              type="text"
              placeholder="Search by name"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={() => setFilters({ search: searchInput })}
              onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
              className="h-8 w-40 text-sm"
            />
            <select
              value={projectId}
              onChange={(e) => setFilters({ project_id: e.target.value })}
              className="h-8 min-w-[140px] rounded border border-input bg-transparent px-2 text-xs"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={fileType}
              onChange={(e) => setFilters({ file_type: e.target.value })}
              className="h-8 min-w-[100px] rounded border border-input bg-transparent px-2 text-xs"
            >
              <option value="">All types</option>
              {DOCUMENT_FILE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setFilters({ date_from: e.target.value })}
              className="h-8 w-[130px] text-sm"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setFilters({ date_to: e.target.value })}
              className="h-8 w-[130px] text-sm"
            />
          </div>
        }
      />
      <Divider />
      {localDocuments.length === 0 ? (
        <EmptyState
          title="No documents found"
          description="Upload a document or adjust filters."
          icon={<FileUp className="h-5 w-5" />}
          action={
            <Button size="sm" className="h-8" onClick={() => setUploadOpen(true)}>
              Upload document
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">File</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Size</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded</th>
                <th className="w-40 px-1" />
              </tr>
            </thead>
            <tbody>
              {localDocuments.map((doc) => {
                const relatedUrl = getRelatedRecordUrl(doc);
                return (
                <tr key={doc.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 font-medium truncate max-w-[200px]" title={doc.file_name}>{doc.file_name}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{doc.project_name ?? "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{doc.file_type}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{formatBytes(doc.size_bytes)}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{formatDate(doc.uploaded_at)}</td>
                  <td className="py-1.5 px-1">
                    <div className="flex items-center gap-1 flex-wrap">
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
                      {relatedUrl ? (
                        <Link href={relatedUrl}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            Open related
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
          </DialogHeader>
          <form ref={uploadFormRef} onSubmit={handleUploadSubmit} className="grid gap-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">File</label>
              <input
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,image/*"
                capture="environment"
                className="mt-1 block w-full min-h-[44px] text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs md:min-h-0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project (optional)</label>
              <select
                name="project_id"
                className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
              >
                <option value="">— General —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                name="file_type"
                defaultValue="Other"
                className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
              >
                {DOCUMENT_FILE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Input name="notes" placeholder="Notes" className="mt-1 h-9 text-sm" />
            </div>
            {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
