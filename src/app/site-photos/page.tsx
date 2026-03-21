"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { Trash2, Download, ClipboardList } from "lucide-react";
import { PageLayout, PageHeader, Drawer } from "@/components/base";
import { Button } from "@/components/ui/button";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { FilterBar } from "@/components/filter-bar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPunchListItemAction } from "@/app/punch-list/actions";

type PhotoRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  photo_url: string;
  description: string | null;
  tags: string | null;
  uploaded_by: string | null;
  created_at: string;
};

function isDemoMissingPath(path: string): boolean {
  return /^site-photos\/demo-\d+\.jpg$/i.test((path ?? "").trim());
}

function photoImageUrl(path: string): string {
  return `/api/operations/site-photos/photo?path=${encodeURIComponent(path)}`;
}

export default function SitePhotosPage() {
  const [photos, setPhotos] = React.useState<PhotoRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selectedPhoto, setSelectedPhoto] = React.useState<PhotoRow | null>(null);
  const [detailForm, setDetailForm] = React.useState({ description: "", tags: "", uploaded_by: "" });
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadForm, setUploadForm] = React.useState({
    project_id: "",
    description: "",
    tags: "",
    uploaded_by: "",
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [failedPhotoIds, setFailedPhotoIds] = React.useState<Set<string>>(new Set());
  const [deleteConfirmPhoto, setDeleteConfirmPhoto] = React.useState<PhotoRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [viewerPhoto, setViewerPhoto] = React.useState<PhotoRow | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [punchIssuePhoto, setPunchIssuePhoto] = React.useState<PhotoRow | null>(null);
  const [punchIssueForm, setPunchIssueForm] = React.useState({ issue: "", location: "", description: "", priority: "Medium", assigned_worker_id: "" });
  const [punchIssueSubmitting, setPunchIssueSubmitting] = React.useState(false);
  const [punchIssueWorkers, setPunchIssueWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [editMode, setEditMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = React.useState(false);
  const canDelete = true;

  const markPhotoFailed = React.useCallback((id: string) => {
    setFailedPhotoIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const url = projectFilter
        ? `/api/operations/site-photos?project_id=${encodeURIComponent(projectFilter)}`
        : "/api/operations/site-photos";
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      const list = data.photos ?? [];
      setPhotos(list);
      setProjects(data.projects ?? []);
      // Avoid noisy 404s for legacy demo rows that point to missing files.
      // These records may exist in some dev DBs from older seeds.
      const demoMissing = new Set<string>(
        (list as PhotoRow[]).filter((p) => isDemoMissingPath(p.photo_url)).map((p) => p.id)
      );
      if (demoMissing.size) {
        setFailedPhotoIds((prev) => {
          const next = new Set(prev);
          demoMissing.forEach((id) => next.add(id));
          return next;
        });
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load site photos.");
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const handleDeleteClick = (e: React.MouseEvent, photo: PhotoRow) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDelete) setDeleteConfirmPhoto(photo);
  };

  const openPunchIssueModal = React.useCallback(async (e: React.MouseEvent, photo: PhotoRow) => {
    e.preventDefault();
    e.stopPropagation();
    setPunchIssuePhoto(photo);
    setPunchIssueForm({
      issue: photo.description?.slice(0, 120) ?? "",
      location: "",
      description: photo.description ?? "",
      priority: "Medium",
      assigned_worker_id: "",
    });
    setError(null);
    try {
      const res = await fetch("/api/operations/punch-list");
      const data = await res.json();
      if (data.ok) setPunchIssueWorkers(data.workers ?? []);
    } catch {
      setPunchIssueWorkers([]);
    }
  }, []);

  const handleCreatePunchIssue = async () => {
    if (!punchIssuePhoto) return;
    if (!punchIssueForm.issue.trim()) {
      setError("Issue title is required.");
      return;
    }
    setPunchIssueSubmitting(true);
    setError(null);
    try {
      const result = await createPunchListItemAction({
        project_id: punchIssuePhoto.project_id,
        issue: punchIssueForm.issue.trim(),
        location: punchIssueForm.location.trim() || null,
        description: punchIssueForm.description.trim() || null,
        priority: punchIssueForm.priority,
        assigned_worker_id: punchIssueForm.assigned_worker_id || null,
        photo_id: punchIssuePhoto.id,
        status: "open",
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setPunchIssuePhoto(null);
    } finally {
      setPunchIssueSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmPhoto) return;
    setDeleting(true);
    setError(null);
    const id = deleteConfirmPhoto.id;
    try {
      // Optimistic UI update: remove from grid immediately.
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setFailedPhotoIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteConfirmPhoto(null);
      if (detailOpen && selectedPhoto?.id === id) setDetailOpen(false);

      const res = await fetch(`/api/operations/site-photos/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to delete");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete photo.");
      void load();
    } finally {
      setDeleting(false);
    }
  };

  const openDetail = (photo: PhotoRow) => {
    setSelectedPhoto(photo);
    setDetailForm({
      description: photo.description ?? "",
      tags: photo.tags ?? "",
      uploaded_by: photo.uploaded_by ?? "",
    });
    setDetailOpen(true);
  };

  const openViewer = (photo: PhotoRow) => {
    setViewerPhoto(photo);
  };

  const handleDownload = React.useCallback(async () => {
    if (!viewerPhoto) return;
    setDownloading(true);
    try {
      const url = photoImageUrl(viewerPhoto.photo_url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const ext = viewerPhoto.photo_url.split(".").pop()?.toLowerCase() || "jpg";
      const name = viewerPhoto.description?.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40) || "site-photo";
      const filename = `${name}-${viewerPhoto.id.slice(0, 8)}.${ext}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }, [viewerPhoto]);

  const handleSaveDetail = async () => {
    if (!selectedPhoto) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operations/site-photos/${selectedPhoto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: detailForm.description.trim() || null,
          tags: detailForm.tags.trim() || null,
          uploaded_by: detailForm.uploaded_by.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to update");
      setDetailOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setSubmitting(false);
    }
  };

  const openUpload = () => {
    setUploadForm({
      project_id: projects[0]?.id ?? "",
      description: "",
      tags: "",
      uploaded_by: "",
    });
    setUploadOpen(true);
    setError(null);
  };

  const toggleEditMode = () => {
    setEditMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const togglePhotoSelection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPhotos = () => {
    setSelectedIds(new Set(photos.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const openBulkDeleteConfirm = () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteConfirmOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      // Optimistic UI: remove selected rows immediately.
      setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setFailedPhotoIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      // Delete in parallel with a small concurrency limit to speed up,
      // without overwhelming the server/storage.
      const concurrency = 6;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, ids.length) }).map(async () => {
        while (cursor < ids.length) {
          const id = ids[cursor++];
          const res = await fetch(`/api/operations/site-photos/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message ?? "Failed to delete");
          }
        }
      });
      await Promise.all(workers);

      setBulkDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      setEditMode(false);
      if (detailOpen && selectedPhoto && ids.includes(selectedPhoto.id)) setDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      void load();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadForm.project_id) {
      setError("Select a project first.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploadRes = await fetch("/api/operations/site-photos/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.ok) throw new Error(uploadData.message || "Upload failed");
      const createRes = await fetch("/api/operations/site-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: uploadForm.project_id,
          photo_url: uploadData.path,
          description: uploadForm.description.trim() || null,
          tags: uploadForm.tags.trim() || null,
          uploaded_by: uploadForm.uploaded_by.trim() || null,
        }),
      });
      const createData = await createRes.json();
      if (!createData.ok) throw new Error(createData.message || "Failed to save");
      setUploadOpen(false);
      load();
      e.target.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <PageLayout
      header={
        <PageHeader
          title="Site Photos"
          description="Photos by project."
          actions={
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <Button size="sm" variant="outline" className="rounded-sm" onClick={toggleEditMode} disabled={bulkDeleting}>
                    Cancel
                  </Button>
                  <button
                    type="button"
                    onClick={selectAllPhotos}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-sm"
                    onClick={openBulkDeleteConfirm}
                    disabled={selectedIds.size === 0 || bulkDeleting}
                  >
                    Delete ({selectedIds.size})
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={toggleEditMode}>
                    Edit
                  </Button>
                  <Button size="sm" onClick={openUpload}>
                    + Upload Photo
                  </Button>
                </>
              )}
            </div>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        <FilterBar className="flex-col items-stretch sm:items-stretch">
          <div className="w-full max-w-md space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">Project</p>
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="min-w-[160px]"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        </FilterBar>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-destructive">{error}</div>
        ) : photos.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No photos yet. Upload a photo to get started.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div
                key={p.id}
                className={`group relative text-left rounded-sm border overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-ring ${
                  editMode && selectedIds.has(p.id) ? "border-foreground/80 ring-1 ring-foreground/20" : "border-[#EBEBE9] hover:bg-[#F7F7F5] dark:border-border/60 dark:hover:bg-muted/30"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (editMode) {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      });
                    } else {
                      openViewer(p);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editMode) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        });
                      } else openViewer(p);
                    }
                  }}
                  className="block w-full text-left cursor-pointer focus:outline-none"
                >
                  <div className="aspect-square bg-[#F7F7F5]/80 relative dark:bg-muted/30">
                    {editMode && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); togglePhotoSelection(e, p.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); togglePhotoSelection(e as unknown as React.MouseEvent, p.id); } }}
                        className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-sm border border-border bg-background shadow-sm"
                      >
                        {selectedIds.has(p.id) ? (
                          <span className="text-xs font-medium text-[#111111]">✓</span>
                        ) : null}
                      </div>
                    )}
                    {!editMode && (
                      <div
                        className="absolute top-1.5 right-1.5 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for photo`}
                          touchFriendly={false}
                          className="h-8 w-8 bg-background/90 hover:bg-background rounded-sm"
                          actions={[
                            { label: "View", onClick: () => openViewer(p) },
                            { label: "Edit", onClick: () => openDetail(p) },
                            {
                              label: "Create Punch Issue",
                              onClick: () => openPunchIssueModal({ preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent, p),
                            },
                            ...(canDelete ? [{ label: "Delete", onClick: () => setDeleteConfirmPhoto(p), destructive: true }] : []),
                          ]}
                        />
                      </div>
                    )}
                    {failedPhotoIds.has(p.id) ? (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Photo unavailable
                      </div>
                    ) : (
                      <img
                        src={photoImageUrl(p.photo_url)}
                        alt={p.description || "Site photo"}
                        className="w-full h-full object-cover"
                        onError={() => markPhotoFailed(p.id)}
                      />
                    )}
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs font-medium text-foreground truncate">{p.project_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.description || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.uploaded_by ? `By ${p.uploaded_by}` : "—"}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {p.created_at ? new Date(p.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!deleteConfirmPhoto} onOpenChange={(open) => !open && setDeleteConfirmPhoto(null)}>
        <DialogContent className="max-w-sm border-border/60 rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete Photo</DialogTitle>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete this photo? This action cannot be undone.</p>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-3 border-t border-border/60">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setDeleteConfirmPhoto(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="rounded-sm" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={(open) => !open && setBulkDeleteConfirmOpen(false)}>
        <DialogContent className="max-w-sm border-border/60 rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete photos</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Delete {selectedIds.size} photo{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-3 border-t border-border/60">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setBulkDeleteConfirmOpen(false)} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="rounded-sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewerPhoto} onOpenChange={(open) => !open && setViewerPhoto(null)}>
        <DialogContent className="max-w-4xl border-border/60 rounded-sm p-2 flex flex-col max-h-[90vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo</DialogTitle>
          </DialogHeader>
          {viewerPhoto && (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/30 rounded-sm overflow-auto p-2">
                {failedPhotoIds.has(viewerPhoto.id) ? (
                  <p className="text-sm text-muted-foreground">Photo unavailable</p>
                ) : (
                  <img
                    src={photoImageUrl(viewerPhoto.photo_url)}
                    alt={viewerPhoto.description || "Site photo"}
                    className="max-w-full max-h-[70vh] w-auto h-auto object-contain"
                    onError={() => markPhotoFailed(viewerPhoto.id)}
                  />
                )}
              </div>
              <DialogFooter className="gap-2 pt-3 border-t border-border/60 shrink-0">
                <Button variant="outline" size="sm" className="rounded-sm" onClick={handleDownload} disabled={downloading || failedPhotoIds.has(viewerPhoto.id)}>
                  <Download className="h-4 w-4 mr-1.5" />
                  {downloading ? "Downloading…" : "Download"}
                </Button>
                <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setViewerPhoto(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!punchIssuePhoto} onOpenChange={(open) => !open && setPunchIssuePhoto(null)}>
        <DialogContent className="max-w-lg border-border/60 rounded-sm p-0 flex flex-col max-h-[90vh] overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border/60 shrink-0">
            <DialogTitle className="text-base font-semibold">Create Punch Issue</DialogTitle>
          </DialogHeader>
          {punchIssuePhoto && (
            <>
              <div className="px-4 py-3 bg-muted/20 flex items-center justify-center min-h-[200px] max-h-[280px] shrink-0">
                {failedPhotoIds.has(punchIssuePhoto.id) ? (
                  <p className="text-sm text-muted-foreground">Photo unavailable</p>
                ) : (
                  <img
                    src={photoImageUrl(punchIssuePhoto.photo_url)}
                    alt={punchIssuePhoto.description || "Site photo"}
                    className="max-w-full max-h-[260px] w-auto h-auto object-contain rounded-sm"
                  />
                )}
              </div>
              <div className="px-4 py-3 space-y-3 overflow-auto flex-1 min-h-0">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Project</label>
                  <p className="mt-0.5 text-sm">{punchIssuePhoto.project_name ?? "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Issue Title</label>
                  <Input
                    value={punchIssueForm.issue}
                    onChange={(e) => setPunchIssueForm((f) => ({ ...f, issue: e.target.value }))}
                    placeholder="Short title"
                    className="mt-1 h-9 rounded-sm border-border/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Location</label>
                  <Input
                    value={punchIssueForm.location}
                    onChange={(e) => setPunchIssueForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Room 101"
                    className="mt-1 h-9 rounded-sm border-border/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={punchIssueForm.description}
                    onChange={(e) => setPunchIssueForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional details"
                    rows={2}
                    className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority</label>
                  <Select
                    value={punchIssueForm.priority}
                    onChange={(e) => setPunchIssueForm((f) => ({ ...f, priority: e.target.value }))}
                    className="mt-1 w-full"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Assigned Worker</label>
                  <Select
                    value={punchIssueForm.assigned_worker_id}
                    onChange={(e) => setPunchIssueForm((f) => ({ ...f, assigned_worker_id: e.target.value }))}
                    className="mt-1 w-full"
                  >
                    <option value="">—</option>
                    {punchIssueWorkers.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </Select>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter className="gap-2 px-4 py-3 border-t border-border/60 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setPunchIssuePhoto(null)} disabled={punchIssueSubmitting}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreatePunchIssue} disabled={punchIssueSubmitting || !punchIssueForm.issue.trim()}>
                  {punchIssueSubmitting ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Drawer open={detailOpen} onOpenChange={setDetailOpen} title="Photo detail" description={selectedPhoto?.project_name ?? undefined}>
        {selectedPhoto && (
          <div className="space-y-4">
            <div className="rounded-sm border border-[#EBEBE9] overflow-hidden bg-background min-h-[8rem] flex items-center justify-center dark:border-border/60">
              {failedPhotoIds.has(selectedPhoto.id) ? (
                <span className="text-sm text-muted-foreground">Photo unavailable</span>
              ) : (
                <img
                  src={photoImageUrl(selectedPhoto.photo_url)}
                  alt={selectedPhoto.description || "Photo"}
                  className="w-full max-h-48 object-contain"
                  onError={() => markPhotoFailed(selectedPhoto.id)}
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={detailForm.description}
                onChange={(e) => setDetailForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tags</label>
              <Input
                value={detailForm.tags}
                onChange={(e) => setDetailForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. foundation, framing"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Uploaded by</label>
              <Input
                value={detailForm.uploaded_by}
                onChange={(e) => setDetailForm((f) => ({ ...f, uploaded_by: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Created: {selectedPhoto.created_at ? new Date(selectedPhoto.created_at).toLocaleString() : "—"}
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setDetailOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteConfirmPhoto(selectedPhoto)}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button size="sm" onClick={handleSaveDetail} disabled={submitting}>Save</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Upload flow: hidden file input + modal for project/fields when file selected */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setUploadOpen(false)}>
          <div
            className="bg-background border border-[#EBEBE9] rounded-sm p-4 w-full max-w-sm space-y-3 dark:border-border/60"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium">Upload Photo</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <Select
                value={uploadForm.project_id}
                onChange={(e) => setUploadForm((f) => ({ ...f, project_id: e.target.value }))}
                className="mt-1 w-full"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input
                value={uploadForm.description}
                onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tags</label>
              <Input
                value={uploadForm.tags}
                onChange={(e) => setUploadForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="Optional"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Uploaded by</label>
              <Input
                value={uploadForm.uploaded_by}
                onChange={(e) => setUploadForm((f) => ({ ...f, uploaded_by: e.target.value }))}
                placeholder="Your name"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setUploadOpen(false); setError(null); }}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !uploadForm.project_id}
              >
                {uploading ? "Uploading…" : "Choose file or capture"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Select a project, then choose file. On mobile, you can capture from camera.</p>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
