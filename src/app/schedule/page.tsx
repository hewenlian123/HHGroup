"use client";

import * as React from "react";
import { PageLayout, PageHeader } from "@/components/base";
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

type ScheduleRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  scheduled: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  delayed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  scheduled: "Planned",
  in_progress: "In progress",
  done: "Done",
  delayed: "Delayed",
};

export default function SchedulePage() {
  const [schedule, setSchedule] = React.useState<ScheduleRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    project_id: "",
    title: "",
    start_date: "",
    end_date: "",
    status: "planned",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations/schedule");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setSchedule(data.schedule ?? []);
      setProjects(data.projects ?? []);
      if ((data.schedule ?? []).length === 0) {
        const seedRes = await fetch("/api/seed/operations", { method: "POST" });
        const seedData = await seedRes.json();
        if (seedData.ok && seedData.seeded?.schedule) await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const openModal = () => {
    setForm({
      project_id: projects[0]?.id ?? "",
      title: "",
      start_date: "",
      end_date: "",
      status: "planned",
    });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: form.project_id,
          title: form.title || "Untitled",
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: form.status,
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

  const statusStyle = (status: string) =>
    STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

  return (
    <PageLayout
      header={
        <PageHeader
          title="Schedule"
          description="Project schedule across all projects."
          actions={
            <Button size="touch" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90 min-h-[44px]" onClick={openModal}>
              + New schedule item
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
          ) : schedule.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No schedule items yet.</p>
              <Button onClick={openModal} className="mt-4 max-md:min-h-[44px] max-md:w-full max-md:max-w-[280px]" size="sm">
                New schedule item
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile: card layout */}
              <div className="flex flex-col gap-2 md:hidden divide-y divide-border/60">
                {schedule.map((s) => (
                  <div
                    key={s.id}
                    className="flex min-h-[44px] flex-col gap-1 border-0 bg-transparent px-4 py-3"
                  >
                    <span className="font-medium truncate">{s.title || "—"}</span>
                    <span className="text-xs text-muted-foreground truncate">{s.project_name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.start_date ? new Date(s.start_date).toLocaleDateString() : "—"} – {s.end_date ? new Date(s.end_date).toLocaleDateString() : "—"}
                    </span>
                    <span
                      className={cn(
                        "mt-1 w-fit rounded-sm px-1.5 py-0.5 text-xs font-medium",
                        statusStyle(s.status)
                      )}
                    >
                      {statusLabel(s.status)}
                    </span>
                  </div>
                ))}
              </div>
              <table className="hidden w-full text-sm border-collapse md:table">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Task</th>
                  <th className="hidden sm:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Project</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Start date</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">End date</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors">
                    <td className="py-2 px-2 sm:px-3 font-medium">{s.title || "—"}</td>
                    <td className="hidden sm:table-cell py-2 px-3 text-muted-foreground">{s.project_name ?? "—"}</td>
                    <td className="py-2 px-2 sm:px-3 text-muted-foreground tabular-nums">
                      {s.start_date ? new Date(s.start_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-muted-foreground tabular-nums">
                      {s.end_date ? new Date(s.end_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-2 sm:px-3">
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          statusStyle(s.status)
                        )}
                      >
                        {statusLabel(s.status)}
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-sm border-border/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New schedule item</DialogTitle>
            <DialogDescription>Add a task to the schedule.</DialogDescription>
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
              <label className="text-xs font-medium text-muted-foreground">Task</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task name"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start date</label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  className="mt-1.5 h-9 rounded-sm border-border/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End date</label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  className="mt-1.5 h-9 rounded-sm border-border/60"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="delayed">Delayed</option>
              </select>
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
