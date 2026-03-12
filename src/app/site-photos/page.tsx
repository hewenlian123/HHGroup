"use client";

import * as React from "react";
import { PageLayout, PageHeader, Drawer } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

      // If there are no site photos at all, seed demo data once and reload.
      if (!list.length) {
        const seedRes = await fetch("/api/seed/operations", { method: "POST" });
        const seedData = await seedRes.json();
        if (seedData.ok && seedData.seeded?.sitePhotos) {
          const again = await fetch(url);
          const againData = await again.json();
          if (againData.ok) {
            setPhotos(againData.photos ?? []);
            setProjects(againData.projects ?? []);
          }
        }
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

  const openDetail = (photo: PhotoRow) => {
    setSelectedPhoto(photo);
    setDetailForm({
      description: photo.description ?? "",
      tags: photo.tags ?? "",
      uploaded_by: photo.uploaded_by ?? "",
    });
    setDetailOpen(true);
  };

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
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={openUpload}>
              + Upload Photo
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2">
          <label className="text-xs font-medium text-muted-foreground">Project</label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-9 rounded-sm border border-border/60 bg-background px-2.5 text-sm min-w-[160px]"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-destructive">{error}</div>
        ) : photos.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No photos yet. Upload a photo to get started.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openDetail(p)}
                className="text-left rounded-sm border border-border/60 overflow-hidden hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="aspect-square bg-muted/50 relative">
                  <img
                    src={photoImageUrl(p.photo_url)}
                    alt={p.description || "Site photo"}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium text-foreground truncate">{p.project_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.description || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.uploaded_by ? `By ${p.uploaded_by}` : "—"}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {p.created_at ? new Date(p.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Drawer open={detailOpen} onOpenChange={setDetailOpen} title="Photo detail" description={selectedPhoto?.project_name ?? undefined}>
        {selectedPhoto && (
          <div className="space-y-4">
            <div className="rounded-sm border border-border/60 overflow-hidden bg-muted/30">
              <img
                src={photoImageUrl(selectedPhoto.photo_url)}
                alt={selectedPhoto.description || "Photo"}
                className="w-full max-h-48 object-contain"
              />
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
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="rounded-sm" onClick={() => setDetailOpen(false)}>Cancel</Button>
              <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSaveDetail} disabled={submitting}>Save</Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setUploadOpen(false)}>
          <div
            className="bg-background border border-border/60 rounded-sm p-4 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium">Upload Photo</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <select
                value={uploadForm.project_id}
                onChange={(e) => setUploadForm((f) => ({ ...f, project_id: e.target.value }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
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
              <Button size="sm" variant="outline" className="rounded-sm" onClick={() => { setUploadOpen(false); setError(null); }}>Cancel</Button>
              <Button
                size="sm"
                className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
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
