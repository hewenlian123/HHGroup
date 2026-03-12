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
import { createProjectTaskAction, updateProjectTaskAction } from "@/app/projects/actions";
import { cn } from "@/lib/utils";

type TaskRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_worker_id: string | null;
  worker_name: string | null;
  due_date: string | null;
  priority: string;
  created_at: string;
};

type Filter = "all" | "today" | "this_week" | "overdue" | "completed";

const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

function isToday(d: string | null): boolean {
  if (!d) return false;
  const today = new Date().toISOString().slice(0, 10);
  return d.slice(0, 10) === today;
}

function isThisWeek(d: string | null): boolean {
  if (!d) return false;
  const date = new Date(d);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return date >= start && date <= end;
}

function isOverdue(d: string | null): boolean {
  if (!d) return false;
  const today = new Date().toISOString().slice(0, 10);
  return d.slice(0, 10) < today;
}

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedTask, setSelectedTask] = React.useState<TaskRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    project_id: "",
    title: "",
    description: "",
    assigned_worker_id: "",
    due_date: "",
    priority: "medium" as "low" | "medium" | "high",
    status: "todo" as "todo" | "in_progress" | "done",
  });
  const [drawerForm, setDrawerForm] = React.useState({
    title: "",
    description: "",
    assigned_worker_id: "",
    due_date: "",
    priority: "medium" as "low" | "medium" | "high",
    status: "todo" as "todo" | "in_progress" | "done",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations/tasks");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      const taskList = data.tasks ?? [];
      setTasks(taskList);
      setProjects(data.projects ?? []);
      setWorkers(data.workers ?? []);
      if (taskList.length === 0) {
        const seedRes = await fetch("/api/seed/operations", { method: "POST" });
        const seedData = await seedRes.json();
        if (seedData.ok && seedData.seeded?.tasks) await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    if (filter === "completed") return tasks.filter((t) => t.status === "done");
    if (filter === "today") return tasks.filter((t) => t.status !== "done" && isToday(t.due_date));
    if (filter === "this_week") return tasks.filter((t) => t.status !== "done" && isThisWeek(t.due_date));
    if (filter === "overdue") return tasks.filter((t) => t.status !== "done" && isOverdue(t.due_date));
    return tasks;
  }, [tasks, filter]);

  const openModal = () => {
    setForm({
      project_id: projects[0]?.id ?? "",
      title: "",
      description: "",
      assigned_worker_id: "",
      due_date: "",
      priority: "medium",
      status: "todo",
    });
    setError(null);
    setModalOpen(true);
  };

  const openDrawer = (task: TaskRow) => {
    setSelectedTask(task);
    setDrawerForm({
      title: task.title,
      description: task.description ?? "",
      assigned_worker_id: task.assigned_worker_id ?? "",
      due_date: task.due_date ?? "",
      priority: (task.priority as "low" | "medium" | "high") || "medium",
      status: (task.status as "todo" | "in_progress" | "done") || "todo",
    });
    setError(null);
    setDrawerOpen(true);
  };

  const handleSaveNew = async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createProjectTaskAction(form.project_id, {
        title: form.title || "Untitled",
        description: form.description || null,
        assigned_worker_id: form.assigned_worker_id || null,
        due_date: form.due_date || null,
        priority: form.priority,
        status: form.status,
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

  const handleToggleDone = async (e: React.MouseEvent, task: TaskRow) => {
    e.stopPropagation();
    const nextStatus = task.status === "done" ? "todo" : "done";
    const result = await updateProjectTaskAction(task.project_id, task.id, { status: nextStatus });
    if (!result.error) load();
  };

  const handleSaveDrawer = async () => {
    if (!selectedTask) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateProjectTaskAction(selectedTask.project_id, selectedTask.id, {
        title: drawerForm.title || selectedTask.title,
        description: drawerForm.description || null,
        assigned_worker_id: drawerForm.assigned_worker_id || null,
        due_date: drawerForm.due_date || null,
        priority: drawerForm.priority,
        status: drawerForm.status,
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

  const filterTabs: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "today", label: "Today" },
    { value: "this_week", label: "This Week" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <PageLayout
      header={
        <PageHeader
          title="Tasks"
          description="Construction tasks across all projects."
          actions={
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={openModal}>
              + New Task
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
          ) : error ? (
            <div className="py-10 text-center text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No tasks match the filter.</div>
          ) : (
            <table className="w-full text-sm border-collapse table-fixed sm:table-auto">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="w-9 text-left py-2 px-2 sm:px-3" aria-label="Done" />
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Task</th>
                  <th className="hidden sm:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Project</th>
                  <th className="hidden md:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Assigned</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Due</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Priority</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openDrawer(t)}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2 sm:px-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleToggleDone(e, t)}
                        className="rounded border-border/60 text-[#111111] focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                      >
                        <span
                          className={cn(
                            "inline-flex h-4 w-4 items-center justify-center rounded-sm border",
                            t.status === "done" ? "border-[#111111] bg-[#111111] text-white" : "border-border"
                          )}
                        >
                          {t.status === "done" ? "✓" : null}
                        </span>
                      </button>
                    </td>
                    <td className="py-2 px-2 sm:px-3">
                      <span className={cn("font-medium", t.status === "done" && "text-muted-foreground line-through")}>
                        {t.title || "—"}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell py-2 px-3 text-muted-foreground">{t.project_name ?? "—"}</td>
                    <td className="hidden md:table-cell py-2 px-3 text-muted-foreground">{t.worker_name ?? "—"}</td>
                    <td className="py-2 px-2 sm:px-3 text-muted-foreground tabular-nums">
                      {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-2 sm:px-3">
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          t.priority === "high" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                          t.priority === "medium" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          t.priority === "low" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title={selectedTask?.title ?? "Task"} description={selectedTask?.project_name ?? undefined}>
        {selectedTask && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={drawerForm.title}
                onChange={(e) => setDrawerForm((p) => ({ ...p, title: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={drawerForm.description}
                onChange={(e) => setDrawerForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
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
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <Input
                type="date"
                value={drawerForm.due_date}
                onChange={(e) => setDrawerForm((p) => ({ ...p, due_date: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={drawerForm.priority}
                onChange={(e) => setDrawerForm((p) => ({ ...p, priority: e.target.value as "low" | "medium" | "high" }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={drawerForm.status}
                onChange={(e) => setDrawerForm((p) => ({ ...p, status: e.target.value as "todo" | "in_progress" | "done" }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-sm border-border/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New Task</DialogTitle>
            <DialogDescription>Create a task and assign it to a project.</DialogDescription>
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
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task title"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
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
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as "low" | "medium" | "high" }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "todo" | "in_progress" | "done" }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
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
