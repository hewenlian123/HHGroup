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
  assigned_worker_id: string | null;
  worker_name: string | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
};

type Filter = "open" | "assigned" | "completed";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "Assigned",
  resolved: "Completed",
};

export default function PunchListPage() {
  const [items, setItems] = React.useState<PunchRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("open");
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
    assigned_worker_id: "",
    status: "open",
    photo_url: "" as string | null,
  });
  const [drawerForm, setDrawerForm] = React.useState({
    issue: "",
    location: "",
    assigned_worker_id: "",
    status: "open",
    notes: "",
    photo_url: null as string | null,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const drawerFileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations/punch-list");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      const list = data.items ?? [];
      setItems(list);
      setProjects(data.projects ?? []);
      setWorkers(data.workers ?? []);
      if (list.length === 0) {
        const seedRes = await fetch("/api/seed/operations", { method: "POST" });
        const seedData = await seedRes.json();
        if (seedData.ok && seedData.seeded?.punchList) await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load punch list.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    if (filter === "open") return items.filter((i) => i.status === "open");
    if (filter === "assigned") return items.filter((i) => i.status === "in_progress");
    if (filter === "completed") return items.filter((i) => i.status === "resolved");
    return items;
  }, [items, filter]);

  const openModal = () => {
    setForm({
      project_id: projects[0]?.id ?? "",
      issue: "",
      location: "",
      assigned_worker_id: "",
      status: "open",
      photo_url: null,
    });
    setError(null);
    setModalOpen(true);
  };

  const openDrawer = (item: PunchRow) => {
    setSelectedItem(item);
    setDrawerForm({
      issue: item.issue,
      location: item.location ?? "",
      assigned_worker_id: item.assigned_worker_id ?? "",
      status: item.status,
      notes: item.notes ?? "",
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
      setError("Issue is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createPunchListItemAction({
        project_id: form.project_id,
        issue: form.issue.trim(),
        location: form.location.trim() || null,
        assigned_worker_id: form.assigned_worker_id || null,
        status: form.status,
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
        issue: drawerForm.issue.trim() || selectedItem.issue,
        location: drawerForm.location.trim() || null,
        assigned_worker_id: drawerForm.assigned_worker_id || null,
        status: drawerForm.status,
        photo_url: drawerForm.photo_url,
        notes: drawerForm.notes.trim() || null,
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

  const filterTabs: { value: Filter; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "assigned", label: "Assigned" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <PageLayout
      header={
        <PageHeader
          title="Punch List"
          description="Track and resolve construction issues."
          actions={
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={openModal}>
              + Add Issue
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center gap-1 border-b border-border/60 pb-2">
          {filterTabs.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors",
                filter === f.value
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="border border-border/60 rounded-sm overflow-hidden">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error && items.length === 0 ? (
            <div className="py-10 text-center text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No issues in this filter.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Issue</th>
                  <th className="hidden sm:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Location</th>
                  <th className="hidden md:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Assigned</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openDrawer(r)}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2 sm:px-3 font-medium">{r.issue || "—"}</td>
                    <td className="hidden sm:table-cell py-2 px-3 text-muted-foreground">{r.location ?? "—"}</td>
                    <td className="hidden md:table-cell py-2 px-3 text-muted-foreground">{r.worker_name ?? "—"}</td>
                    <td className="py-2 px-2 sm:px-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          r.status === "resolved" && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                          r.status === "in_progress" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          r.status === "open" && "bg-muted text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            r.status === "resolved" && "bg-green-500",
                            r.status === "in_progress" && "bg-amber-500",
                            r.status === "open" && "bg-gray-400"
                          )}
                        />
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title={selectedItem?.issue ?? "Issue"} description={selectedItem?.location ?? undefined}>
        {selectedItem && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Issue</label>
              <textarea
                value={drawerForm.issue}
                onChange={(e) => setDrawerForm((p) => ({ ...p, issue: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                value={drawerForm.location}
                onChange={(e) => setDrawerForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Room 101"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assigned</label>
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
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={drawerForm.status}
                onChange={(e) => setDrawerForm((p) => ({ ...p, status: e.target.value }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Photo</label>
              <input
                ref={drawerFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleDrawerFileChange}
              />
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
                  <a
                    href={photoUrl(drawerForm.photo_url) ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={drawerForm.notes}
                onChange={(e) => setDrawerForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Notes for this issue"
                rows={3}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="rounded-sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSaveDrawer} disabled={submitting}>Save</Button>
            </div>
          </div>
        )}
      </Drawer>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-sm border-border/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Issue</DialogTitle>
            <DialogDescription>Add a punch list issue.</DialogDescription>
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
              <label className="text-xs font-medium text-muted-foreground">Issue</label>
              <textarea
                value={form.issue}
                onChange={(e) => setForm((p) => ({ ...p, issue: e.target.value }))}
                placeholder="Describe the issue"
                rows={3}
                className="mt-1.5 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Room 101, North wall"
                className="mt-1.5 h-9 rounded-sm border-border/60"
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
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Photo</label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
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
