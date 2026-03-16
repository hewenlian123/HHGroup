"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
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
      const res = await fetch(`/api/operations/tasks?t=${Date.now()}`, { cache: "no-store", headers: { Pragma: "no-cache" } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      const taskList = data.tasks ?? [];
      setTasks(taskList);
      setProjects(data.projects ?? []);
      setWorkers(data.workers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const clearStaleTask = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask(null);
      setDrawerOpen(false);
      setError("Task no longer exists.");
      if (typeof window !== "undefined" && window.location.search) {
        router.replace(pathname ?? "/tasks");
      }
      if (typeof window !== "undefined") window.setTimeout(() => setError(null), 4000);
    },
    [router, pathname]
  );

  React.useEffect(() => {
    if (!selectedTask) return;
    const exists = tasks.some((t) => t.id === selectedTask.id);
    if (!exists) clearStaleTask(selectedTask.id);
  }, [tasks, selectedTask, clearStaleTask]);

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
      await load();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDone = async (e: React.MouseEvent, task: TaskRow) => {
    e.stopPropagation();
    e.preventDefault();
    const nextStatus = task.status === "done" ? "todo" : "done";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );
    if (selectedTask?.id === task.id) {
      setSelectedTask((prev) => (prev?.id === task.id ? { ...prev, status: nextStatus } : prev));
      setDrawerForm((prev) => ({ ...prev, status: nextStatus }));
    }
    const result = await updateProjectTaskAction(task.project_id, task.id, { status: nextStatus });
    if (result.error) {
      const isNotFound = /not found|already deleted/i.test(result.error) || result.status === 404;
      if (isNotFound) {
        clearStaleTask(task.id);
        return;
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      if (selectedTask?.id === task.id) {
        setSelectedTask((prev) => (prev?.id === task.id ? { ...prev, status: task.status } : prev));
        setDrawerForm((prev) => ({ ...prev, status: task.status }));
      }
      setError(result.error);
      return;
    }
    router.refresh();
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
        const isNotFound = /not found|already deleted/i.test(result.error) || result.status === 404;
        if (isNotFound) {
          clearStaleTask(selectedTask.id);
          return;
        }
        setError(result.error);
        return;
      }
      setDrawerOpen(false);
      await load();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this task? This cannot be undone.")) return;
    const taskIdToRemove = selectedTask.id;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskIdToRemove}`, { method: "DELETE", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          clearStaleTask(taskIdToRemove);
          return;
        }
        setError((data as { message?: string }).message ?? "Failed to delete task.");
        return;
      }
      setDrawerOpen(false);
      setSelectedTask(null);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task.");
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
            <Button size="touch" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90 min-h-[44px]" onClick={openModal}>
              + New Task
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
          {filterTabs.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "min-h-[44px] min-w-[44px] rounded-sm border px-3 py-2 text-sm font-medium transition-colors touch-manipulation md:min-h-0 md:min-w-0 md:px-2.5 md:py-1.5 md:text-xs",
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
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No tasks match the filter.</p>
              <Button onClick={openModal} className="mt-4 max-md:min-h-[44px] max-md:w-full max-md:max-w-[280px]" size="sm">
                Create Task
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile: card layout */}
              <div className="flex flex-col gap-2 md:hidden divide-y divide-border/60">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openDrawer(t)}
                    className="flex min-h-[44px] w-full touch-manipulation items-center gap-3 border-0 bg-transparent px-4 py-3 text-left transition-colors active:bg-muted/50"
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                        t.status === "done" ? "border-[#111111] bg-[#111111] text-white" : "border-border"
                      )}
                      onClick={(e) => { e.stopPropagation(); handleToggleDone(e, t); }}
                    >
                      {t.status === "done" ? "✓" : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium truncate", t.status === "done" && "text-muted-foreground line-through")}>{t.title || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.project_name ?? "—"} · Due {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                        t.priority === "high" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                        t.priority === "medium" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                        t.priority === "low" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                  </button>
                ))}
              </div>
              {/* Desktop: table */}
              <table className="hidden w-full text-sm border-collapse table-fixed sm:table-auto md:table">
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
            </>
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
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
              <Button
                size="sm"
                variant="ghost"
                className="rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDeleteTask}
                disabled={submitting}
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => setDrawerOpen(false)} disabled={submitting}>Cancel</Button>
                <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSaveDrawer} disabled={submitting}>Save</Button>
              </div>
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
