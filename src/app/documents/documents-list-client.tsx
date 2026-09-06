"use client";

import {
  refreshRscNonBlocking,
  syncRouterNonBlocking,
} from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filter-bar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { listTablePrimaryCellClassName, listTableRowClassName } from "@/lib/list-table-interaction";
import { MobileListRow, NeoTable } from "@/components/base";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
} from "@/components/mobile/mobile-list-chrome";
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
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    React.useCallback(
      (detail) => {
        if (!detail.refreshScheduled) refreshRscNonBlocking(router);
      },
      [router]
    ),
    [router]
  );

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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
        syncRouterNonBlocking(router);
      } finally {
        setDeletingId(null);
      }
    },
    [router]
  );

  const activeFilterCount =
    (projectId ? 1 : 0) + (fileType ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

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
          syncRouterNonBlocking(router);
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
      <div className="md:hidden">
        <MobileListHeader
          title="Documents"
          fab={<MobileFabButton ariaLabel="Upload document" onClick={() => setUploadOpen(true)} />}
        />
        <div className="py-hh-3">
          <MobileSearchFiltersRow
            searchSlot={
              <Input
                type="search"
                aria-label="Search documents"
                placeholder="Search files…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={() => setFilters({ search: searchInput })}
                onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
                className="h-hh-control-touch"
              />
            }
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={activeFilterCount}
            filterSheetOpen={filtersOpen}
            filtersTriggerClassName="h-hh-control-touch min-h-hh-touch"
          />
        </div>
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-col gap-4 pb-6">
            <div className="space-y-1">
              <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                Project
              </p>
              <Select
                value={projectId}
                onChange={(e) => {
                  setFilters({ project_id: e.target.value });
                }}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                Type
              </p>
              <Select value={fileType} onChange={(e) => setFilters({ file_type: e.target.value })}>
                <option value="">All types</option>
                {DOCUMENT_FILE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                From
              </p>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setFilters({ date_from: e.target.value })}
                className="h-hh-control-touch"
              />
            </div>
            <div className="space-y-1">
              <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                To
              </p>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setFilters({ date_to: e.target.value })}
                className="h-hh-control-touch"
              />
            </div>
            <Button
              type="button"
              className="min-h-hh-touch w-full"
              onClick={() => setFiltersOpen(false)}
            >
              Done
            </Button>
          </div>
        </MobileFilterSheet>
      </div>

      <div className="hidden md:block">
        <FilterBar>
          <div className="flex w-full flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="max-lg:h-hh-control-touch"
                onClick={() => setUploadOpen(true)}
              >
                Upload
              </Button>
            </div>
            <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1 sm:col-span-2">
                <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                  Search
                </p>
                <Input
                  type="search"
                  aria-label="Search documents"
                  placeholder="File name…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onBlur={() => setFilters({ search: searchInput })}
                  onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
                  className="max-lg:h-hh-control-touch"
                />
              </div>
              <div className="space-y-1">
                <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                  Project
                </p>
                <Select
                  value={projectId}
                  onChange={(e) => setFilters({ project_id: e.target.value })}
                  className="max-lg:h-hh-control-touch"
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                  Type
                </p>
                <Select
                  value={fileType}
                  onChange={(e) => setFilters({ file_type: e.target.value })}
                  className="max-lg:h-hh-control-touch"
                >
                  <option value="">All types</option>
                  {DOCUMENT_FILE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                  From
                </p>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setFilters({ date_from: e.target.value })}
                  className="max-lg:h-hh-control-touch"
                />
              </div>
              <div className="space-y-1">
                <p className="text-hh-metadata font-medium uppercase tracking-[0.2em] text-[var(--hh-text-secondary)]">
                  To
                </p>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setFilters({ date_to: e.target.value })}
                  className="max-lg:h-hh-control-touch"
                />
              </div>
            </div>
          </div>
        </FilterBar>
      </div>
      {localDocuments.length === 0 ? (
        <>
          <div className="hidden md:block">
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
          </div>
          <MobileEmptyState
            icon={<FileUp className="h-8 w-8" aria-hidden />}
            message="No documents found. Upload or adjust filters."
            action={
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                Upload document
              </Button>
            }
          />
        </>
      ) : (
        <div className="border-t border-[var(--hh-border)] pt-0 md:pt-4">
          {/* Mobile list */}
          <div className="divide-y divide-[var(--hh-border)] md:hidden">
            {localDocuments.map((doc) => (
              <MobileListRow key={doc.id} asChild>
                <button
                  type="button"
                  onClick={() => void handlePreview(doc)}
                  className="w-full text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--hh-text-primary)]">
                      {doc.file_name}
                    </p>
                    <p className="truncate text-hh-metadata text-[var(--hh-text-secondary)]">
                      {doc.project_name ?? "—"} · {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="hh-fin font-medium text-[var(--hh-text-primary)]">
                      {formatBytes(doc.size_bytes)}
                    </span>
                    <span className="max-w-[7rem] truncate text-hh-metadata font-medium uppercase tracking-wide text-[var(--hh-text-secondary)]">
                      {doc.file_type}
                    </span>
                  </div>
                </button>
              </MobileListRow>
            ))}
          </div>
          <NeoTable className="hidden md:block" tableClassName="min-w-[880px]">
            <TableHeader>
              <TableRow className="hover:!bg-transparent">
                <TableHead>File</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {localDocuments.map((doc) => {
                const relatedUrl = getRelatedRecordUrl(doc);
                return (
                  <TableRow
                    key={doc.id}
                    className={listTableRowClassName}
                    onClick={() => void handlePreview(doc)}
                  >
                    <TableCell
                      className={cn(
                        "max-w-[200px] truncate font-medium",
                        listTablePrimaryCellClassName
                      )}
                      title={doc.file_name}
                    >
                      {doc.file_name}
                    </TableCell>
                    <TableCell className="text-[var(--hh-text-secondary)]">
                      {doc.project_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-[var(--hh-text-secondary)]">
                      {doc.file_type}
                    </TableCell>
                    <TableCell className="hh-fin text-right text-[var(--hh-text-secondary)]">
                      {formatBytes(doc.size_bytes)}
                    </TableCell>
                    <TableCell className="text-[var(--hh-text-secondary)]">
                      {formatDate(doc.uploaded_at)}
                    </TableCell>
                    <TableCell className="px-hh-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="max-lg:h-hh-control-touch"
                          onClick={() => handlePreview(doc)}
                          disabled={loadingPreview}
                        >
                          Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="max-lg:h-hh-control-touch"
                          onClick={() => handleDownload(doc)}
                        >
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[var(--hh-danger)] max-lg:h-hh-control-touch"
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === doc.id}
                        >
                          {deletingId === doc.id ? "Deleting…" : "Delete"}
                        </Button>
                        {relatedUrl ? (
                          <Link href={relatedUrl}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="max-lg:h-hh-control-touch"
                            >
                              Open related
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </NeoTable>
        </div>
      )}

      <div className="px-4 py-3 md:px-0 md:py-0">
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>

      <DocumentPreviewModal
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        url={previewUrl}
        mimeType={previewDoc?.mime_type ?? null}
        fileName={previewDoc?.file_name ?? ""}
        isLoading={loadingPreview && !!previewDoc}
      />
      {deleteError ? <p className="mt-2 text-xs text-destructive">{deleteError}</p> : null}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
          </DialogHeader>
          <form ref={uploadFormRef} onSubmit={handleUploadSubmit} className="grid gap-3 py-2">
            <div>
              <label
                htmlFor="documents-upload-file"
                className="text-xs font-medium text-muted-foreground"
              >
                File
              </label>
              <input
                id="documents-upload-file"
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,image/*"
                capture="environment"
                className="hh-touch-min mt-1 block h-hh-control-standard w-full text-sm file:mr-2 file:rounded-hh-compact file:border-0 file:bg-[var(--hh-l3-hover)] file:px-hh-2 file:py-hh-1 file:text-hh-metadata file:text-[var(--hh-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Project (optional)
              </label>
              <Select name="project_id" className="mt-1 w-full">
                <option value="">— General —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select name="file_type" defaultValue="Other" className="mt-1 w-full">
                {DOCUMENT_FILE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Input name="notes" placeholder="Notes" className="mt-1 h-9 text-sm" />
            </div>
            {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUploadOpen(false)}
              >
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
