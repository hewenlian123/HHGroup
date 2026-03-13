"use client";

import * as React from "react";
import { PageLayout, PageHeader, Drawer } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPunchListItemAction, updatePunchListItemAction } from "./actions";
import { cn } from "@/lib/utils";

type PunchRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  issue: string;
  location: string | null;
  description: string | null;
  assigned_worker_id: string | null;
  worker_name: string | null;
  priority: string;
  status: string;
  photo_url: string | null;
  photo_id: string | null;
  site_photo_url: string | null;
  notes: string | null;
  created_at: string;
};

type StatusFilter = "open" | "assigned" | "completed" | "";

const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  completed: "Completed",
  in_progress: "Assigned",
  resolved: "Completed",
};

function normStatus(s: string): string {
  return s === "in_progress" ? "assigned" : s === "resolved" ? "completed" : s;
}

export default function PunchListPage() {
  const [items, setItems] = React.useState<PunchRow[]>([]);
  const [summary, setSummary] = React.useState({ open: 0, assigned: 0, completed: 0 });
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<PunchRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    project_id: "",
    issue: "",
    location: "",
    description: "",
    assigned_worker_id: "",
    priority: "Medium",
    photo_url: null as string | null,
  });
  const [drawerForm, setDrawerForm] = React.useState({
    description: "",
    assigned_worker_id: "",
    status: "open" as string,
    photo_url: null as string | null,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const drawerFileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectFilter) params.set("project_id", projectFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/operations/punch-list?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setItems(data.items ?? []);
      setSummary(data.summary ?? { open: 0, assigned: 0, completed: 0 });
      setProjects(data.projects ?? []);
      setWorkers(data.workers ?? []);
      if ((data.items ?? []).length === 0 && !projectFilter && !statusFilter) {
        const seedRes = await fetch("/api/seed/operations", { method: "POST" });
        const seedData = await seedRes.json();
        if (seedData.ok && seedData.seeded?.punchList) await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load punch list.");
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openModal = () => {
    setForm({
      project_id: projectFilter || projects[0]?.id || "",
      issue: "",
      location: "",
      description: "",
      assigned_worker_id: "",
      priority: "Medium",
      photo_url: null,
    });
    setError(null);
    setModalOpen(true);
  };

  const openDrawer = (item: PunchRow) => {
    setSelectedItem(item);
    setDrawerForm({
      description: item.description ?? "",
      assigned_worker_id: item.assigned_worker_id ?? "",
      status: normStatus(item.status),
      photo_url: item.photo_url,
    });
    setError(null);
    setDrawerOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/operations/punch-list/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Upload failed");
      setForm((p) => ({ ...p, photo_url: data.path }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDrawerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/operations/punch-list/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Upload failed");
      setDrawerForm((p) => ({ ...p, photo_url: data.path }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveNew = async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    if (!form.issue.trim()) {
      setError("Issue title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createPunchListItemAction({
        project_id: form.project_id,
        issue: form.issue.trim(),
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        assigned_worker_id: form.assigned_worker_id || null,
        priority: form.priority,
        status: "open",
        photo_url: form.photo_url || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setModalOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDrawer = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await updatePunchListItemAction(selectedItem.id, {
        description: drawerForm.description.trim() || null,
        assigned_worker_id: drawerForm.assigned_worker_id || null,
        status: drawerForm.status,
        photo_url: drawerForm.photo_url,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDrawerOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const photoUrl = (path: string | null) =>
    path ? `/api/operations/punch-list/photo?path=${encodeURIComponent(path)}` : null;
  const sitePhotoImageUrl = (path: string | null) =>
    path ? `/api/operations/site-photos/photo?path=${encodeURIComponent(path)}` : null;

  return (
    <PageLayout
      header={
        <PageHeader
          title="Punch List"
          description="Track and resolve construction issues."
          actions={
            <Button size="touch" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90 min-h-[44px]" onClick={openModal}>
              + Add Issue
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-4">
        {/* Dashboard summary */}
        <div className="grid grid-cols-3 gap-2 border-b border-border/60 pb-3">
          <div className="rounded-sm border border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Open Issues</p>
            <p className="text-lg font-semibold tabular-nums">{summary.open}</p>
          </div>
          <div className="rounded-sm border border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Assigned Issues</p>
            <p className="text-lg font-semibold tabular-nums">{summary.assigned}</p>
          </div>
          <div className="rounded-sm border border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Completed Issues</p>
            <p className="text-lg font-semibold tabular-nums">{summary.completed}</p>
          </div>
        </div>

        {/* Filters: stack on mobile */}
        <div className="grid grid-cols-1 gap-3 border-b border-border/60 pb-3 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:border-b-0 sm:pb-0">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm min-w-0 sm:mt-0 sm:min-h-0 sm:h-9 sm:min-w-[160px]"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground sm:ml-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="mt-1 min-h-[44px] w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm min-w-0 sm:mt-0 sm:min-h-0 sm:h-9 sm:min-w-[120px]"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Table / mobile cards */}
        <div className="border border-border/60 rounded-sm overflow-hidden">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error && items.length === 0 ? (
            <div className="py-10 text-center text-sm text-destructive">{error}</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No issues match the filters.</p>
              <Button onClick={openModal} className="mt-4 max-md:min-h-[44px] max-md:w-full max-md:max-w-[280px]" size="sm">
                Add Issue
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile: card layout */}
              <div className="flex flex-col gap-2 md:hidden divide-y divide-border/60">
                {items.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openDrawer(r)}
                    className="flex min-h-[44px] w-full touch-manipulation flex-col items-stretch gap-1 border-0 bg-transparent px-4 py-3 text-left transition-colors active:bg-muted/50"
                  >
                    <span className="font-medium truncate">{r.issue || "—"}</span>
                    <span className="text-xs text-muted-foreground truncate">{r.project_name ?? "—"}{r.location ? ` · ${r.location}` : ""}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          normStatus(r.status) === "completed" && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                          normStatus(r.status) === "assigned" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          normStatus(r.status) === "open" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {STATUS_LABEL[normStatus(r.status)] ?? r.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.priority ?? "Medium"}</span>
                    </div>
                  </button>
                ))}
              </div>
              <table className="hidden w-full text-sm border-collapse md:table">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Project</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Issue</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Location</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Assigned</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openDrawer(r)}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 text-muted-foreground">{r.project_name ?? "—"}</td>
                    <td className="py-2 px-3 font-medium">{r.issue || "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.location ?? "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.worker_name ?? "—"}</td>
                    <td className="py-2 px-3">{r.priority ?? "Medium"}</td>
                    <td className="py-2 px-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          normStatus(r.status) === "completed" && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                          normStatus(r.status) === "assigned" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          normStatus(r.status) === "open" && "bg-muted text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            normStatus(r.status) === "completed" && "bg-green-500",
                            normStatus(r.status) === "assigned" && "bg-amber-500",
                            normStatus(r.status) === "open" && "bg-gray-400"
                          )}
                        />
                        {STATUS_LABEL[normStatus(r.status)] ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {/* Issue detail drawer */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selectedItem?.issue ?? "Issue"}
        description={selectedItem?.location ?? undefined}
      >
        {selectedItem && (
          <div className="space-y-4">
            {selectedItem.site_photo_url && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Related photo</label>
                <div className="mt-1.5 rounded-sm border border-border/60 overflow-hidden bg-muted/20 flex items-center justify-center min-h-[160px]">
                  <img
                    src={sitePhotoImageUrl(selectedItem.site_photo_url)!}
                    alt=""
                    className="max-w-full max-h-48 w-auto h-auto object-contain"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <p className="mt-0.5 text-sm">{selectedItem.project_name ?? "—"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <p className="mt-0.5 text-sm">{selectedItem.location ?? "—"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <p className="mt-0.5 text-sm">{selectedItem.priority ?? "Medium"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assigned Worker</label>
              <select
                value={drawerForm.assigned_worker_id}
                onChange={(e) => setDrawerForm((p) => ({ ...p, assigned_worker_id: e.target.value }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">—</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={drawerForm.description}
                onChange={(e) => setDrawerForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Details"
                rows={3}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Photo</label>
              <input ref={drawerFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleDrawerFileChange} />
              <div className="mt-1 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-sm"
                  disabled={uploading}
                  onClick={() => drawerFileRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {drawerForm.photo_url && (
                  <a href={photoUrl(drawerForm.photo_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">
                    View
                  </a>
                )}
              </div>
              {drawerForm.photo_url && (
                <div className="mt-2 rounded-sm border border-border/60 overflow-hidden max-w-[200px]">
                  <img src={photoUrl(drawerForm.photo_url)!} alt="" className="w-full h-auto object-cover" />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={drawerForm.status}
                onChange={(e) => setDrawerForm((p) => ({ ...p, status: e.target.value }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="open">Open</option>
                <option value="assigned">Assigned</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="rounded-sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSaveDrawer} disabled={submitting}>Save</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Issue modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-sm border-border/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Issue</DialogTitle>
            <DialogDescription>Create a new punch list issue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Issue Title</label>
              <Input
                value={form.issue}
                onChange={(e) => setForm((p) => ({ ...p, issue: e.target.value }))}
                placeholder="Short title"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Room 101"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional details"
                rows={2}
                className="mt-1.5 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assigned Worker</label>
              <select
                value={form.assigned_worker_id}
                onChange={(e) => setForm((p) => ({ ...p, assigned_worker_id: e.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">—</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>{pr}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Photo</label>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
              <div className="mt-1.5 flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {form.photo_url && <span className="text-xs text-muted-foreground">Uploaded</span>}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSaveNew} disabled={submitting}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
