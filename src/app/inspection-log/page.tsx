"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
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
import { cn } from "@/lib/utils";

type InspectionRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  inspection_type: string;
  inspector: string | null;
  inspection_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

const STATUS_STYLES: Record<string, string> = {
  passed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  pending: "bg-muted text-muted-foreground",
};

export default function InspectionLogPage() {
  const [entries, setEntries] = React.useState<InspectionRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = React.useState<InspectionRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    project_id: "",
    inspection_type: "",
    inspector: "",
    inspection_date: "",
    status: "pending" as "passed" | "failed" | "pending",
    notes: "",
  });
  const [drawerForm, setDrawerForm] = React.useState({
    inspection_type: "",
    inspector: "",
    inspection_date: "",
    status: "pending" as "passed" | "failed" | "pending",
    notes: "",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations/inspection-log");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setEntries(data.entries ?? []);
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inspection log.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openModal = () => {
    setForm({
      project_id: projects[0]?.id ?? "",
      inspection_type: "",
      inspector: "",
      inspection_date: "",
      status: "pending",
      notes: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const openDrawer = (entry: InspectionRow) => {
    setSelectedEntry(entry);
    setDrawerForm({
      inspection_type: entry.inspection_type,
      inspector: entry.inspector ?? "",
      inspection_date: entry.inspection_date ?? "",
      status: (entry.status as "passed" | "failed" | "pending") || "pending",
      notes: entry.notes ?? "",
    });
    setError(null);
    setDrawerOpen(true);
  };

  const handleCreate = async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/inspection-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: form.project_id,
          inspection_type: form.inspection_type.trim() || "Inspection",
          inspector: form.inspector.trim() || null,
          inspection_date: form.inspection_date || null,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to create");
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDrawer = async () => {
    if (!selectedEntry) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operations/inspection-log/${selectedEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_type: drawerForm.inspection_type.trim() || selectedEntry.inspection_type,
          inspector: drawerForm.inspector.trim() || null,
          inspection_date: drawerForm.inspection_date || null,
          status: drawerForm.status,
          notes: drawerForm.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to update");
      setDrawerOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout
      header={
        <PageHeader
          title="Inspection Log"
          description="Track inspections by project."
          actions={
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={openModal}>
              + New Inspection
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        <div className="border border-border/60 rounded-sm overflow-hidden">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-destructive">{error}</div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No inspections yet.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Project</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Inspection Type</th>
                  <th className="hidden md:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Inspector</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openDrawer(row)}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2 sm:px-3 text-muted-foreground tabular-nums">
                      {row.inspection_date ? new Date(row.inspection_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-muted-foreground">{row.project_name ?? "—"}</td>
                    <td className="py-2 px-2 sm:px-3 font-medium">{row.inspection_type || "—"}</td>
                    <td className="hidden md:table-cell py-2 px-3 text-muted-foreground">{row.inspector ?? "—"}</td>
                    <td className="py-2 px-2 sm:px-3">
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium capitalize",
                          STATUS_STYLES[row.status] ?? STATUS_STYLES.pending
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Inspection detail" description={selectedEntry?.project_name ?? undefined}>
        {selectedEntry && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection type</label>
              <Input
                value={drawerForm.inspection_type}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspection_type: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspector</label>
              <Input
                value={drawerForm.inspector}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspector: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection date</label>
              <Input
                type="date"
                value={drawerForm.inspection_date}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspection_date: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={drawerForm.status}
                onChange={(e) => setDrawerForm((f) => ({ ...f, status: e.target.value as "passed" | "failed" | "pending" }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={drawerForm.notes}
                onChange={(e) => setDrawerForm((f) => ({ ...f, notes: e.target.value }))}
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
            <DialogTitle className="text-base font-semibold">New Inspection</DialogTitle>
            <DialogDescription>Add an inspection log entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection type</label>
              <Input
                value={form.inspection_type}
                onChange={(e) => setForm((f) => ({ ...f, inspection_type: e.target.value }))}
                placeholder="e.g. Foundation, Framing"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspector</label>
              <Input
                value={form.inspector}
                onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))}
                placeholder="Inspector name"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection date</label>
              <Input
                type="date"
                value={form.inspection_date}
                onChange={(e) => setForm((f) => ({ ...f, inspection_date: e.target.value }))}
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "passed" | "failed" | "pending" }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
                className="mt-1.5 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleCreate} disabled={submitting}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
