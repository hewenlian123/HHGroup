"use client";

import { dispatchClientDataSync } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createProjectTaskAction, updateProjectTaskAction } from "@/app/projects/actions";
import { runOptimisticPersist } from "@/lib/optimistic-save";
import { cn } from "@/lib/utils";
import { flushSync } from "react-dom";
import { MoreHorizontal } from "lucide-react";

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
  const titleInputRef = React.useRef<HTMLInputElement>(null);
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
      const res = await fetch(`/api/operations/tasks?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
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

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const tasksRef = React.useRef<TaskRow[]>([]);
  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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
    if (filter === "this_week")
      return tasks.filter((t) => t.status !== "done" && isThisWeek(t.due_date));
    if (filter === "overdue")
      return tasks.filter((t) => t.status !== "done" && isOverdue(t.due_date));
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

  const handleSaveNew = () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    const rawTitle = (form.title || titleInputRef.current?.value || "").trim();
    const projectId = form.project_id;
    const project_name = projects.find((p) => p.id === projectId)?.name ?? null;
    const assigned = form.assigned_worker_id || null;
    const worker_name = assigned ? (workers.find((w) => w.id === assigned)?.name ?? null) : null;
    const tempId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `temp-${crypto.randomUUID()}`
        : `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const formSnap = { ...form };

    type NewSnap = { tasks: TaskRow[]; modalOpen: boolean };
    runOptimisticPersist<NewSnap>({
      setBusy: setSubmitting,
      getSnapshot: () => ({ tasks: [...tasksRef.current], modalOpen: true }),
      apply: () => {
        const optimisticRow: TaskRow = {
          id: tempId,
          project_id: projectId,
          project_name,
          title: rawTitle || "Untitled",
          description: formSnap.description || null,
          status: formSnap.status,
          assigned_worker_id: assigned,
          worker_name,
          due_date: formSnap.due_date || null,
          priority: formSnap.priority,
          created_at: nowIso,
        };
        setTasks((prev) => [optimisticRow, ...prev]);
        setModalOpen(false);
        setError(null);
      },
      rollback: (s) => {
        setTasks(s.tasks);
        setModalOpen(s.modalOpen);
      },
      persist: () =>
        createProjectTaskAction(projectId, {
          title: rawTitle || "Untitled",
          description: formSnap.description || null,
          assigned_worker_id: assigned,
          due_date: formSnap.due_date || null,
          priority: formSnap.priority,
          status: formSnap.status,
        }).then((result) => {
          if (result.error) return { error: result.error };
          const t = result.task;
          if (!t) return { error: "Task was not returned." };
          const row: TaskRow = {
            id: t.id,
            project_id: t.project_id,
            project_name,
            title: t.title,
            description: t.description,
            status: t.status,
            assigned_worker_id: t.assigned_worker_id,
            worker_name: t.assigned_worker_id
              ? (workers.find((w) => w.id === t.assigned_worker_id)?.name ?? null)
              : null,
            due_date: t.due_date,
            priority: t.priority,
            created_at: t.created_at,
          };
          flushSync(() => {
            setTasks((prev) => prev.map((x) => (x.id === tempId ? row : x)));
          });
          dispatchClientDataSync({ reason: "task-created" });
          return undefined;
        }),
      onError: (msg) => setError(msg),
    });
  };

  const handleToggleDone = (e: React.MouseEvent, task: TaskRow) => {
    e.stopPropagation();
    e.preventDefault();
    const nextStatus = task.status === "done" ? "todo" : "done";
    const sel = selectedTask;
    const df = { ...drawerForm };

    type ToggleSnap = { tasks: TaskRow[]; selected: TaskRow | null; drawerForm: typeof drawerForm };
    runOptimisticPersist<ToggleSnap>({
      setBusy: () => {},
      getSnapshot: () => ({
        tasks: [...tasksRef.current],
        selected: sel,
        drawerForm: df,
      }),
      apply: () => {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
        if (sel?.id === task.id) {
          setSelectedTask((prev) =>
            prev?.id === task.id ? { ...prev, status: nextStatus } : prev
          );
          setDrawerForm((prev) => ({ ...prev, status: nextStatus }));
        }
        setError(null);
      },
      rollback: (s) => {
        setTasks(s.tasks);
        setSelectedTask(s.selected);
        setDrawerForm(s.drawerForm);
      },
      persist: () =>
        updateProjectTaskAction(task.project_id, task.id, { status: nextStatus }).then((result) => {
          if (result.error) {
            if (/not found|already deleted/i.test(result.error)) {
              clearStaleTask(task.id);
              return undefined;
            }
            return { error: result.error };
          }
          dispatchClientDataSync({ reason: "task-toggle-done" });
          return undefined;
        }),
      onError: (msg) => setError(msg),
    });
  };

  const handleSaveDrawer = () => {
    if (!selectedTask) return;
    const st = selectedTask;
    const df = { ...drawerForm };
    const title = df.title || st.title;
    const wid = df.assigned_worker_id || null;
    const worker_name = wid ? (workers.find((w) => w.id === wid)?.name ?? null) : null;
    const patch = {
      title,
      description: df.description || null,
      assigned_worker_id: wid,
      due_date: df.due_date || null,
      priority: df.priority,
      status: df.status,
    };

    const updatedRow: TaskRow = {
      ...st,
      title,
      description: patch.description,
      assigned_worker_id: wid,
      worker_name,
      due_date: patch.due_date,
      priority: patch.priority,
      status: patch.status,
    };

    type DrawerSnap = {
      tasks: TaskRow[];
      selected: TaskRow | null;
      drawerOpen: boolean;
      drawerForm: typeof drawerForm;
    };
    runOptimisticPersist<DrawerSnap>({
      setBusy: setSubmitting,
      getSnapshot: () => ({
        tasks: [...tasksRef.current],
        selected: st,
        drawerOpen: true,
        drawerForm: df,
      }),
      apply: () => {
        setTasks((prev) => prev.map((t) => (t.id === st.id ? updatedRow : t)));
        setSelectedTask(updatedRow);
        setDrawerOpen(false);
        setError(null);
      },
      rollback: (s) => {
        setTasks(s.tasks);
        setSelectedTask(s.selected);
        setDrawerOpen(s.drawerOpen);
        setDrawerForm(s.drawerForm);
      },
      persist: () =>
        updateProjectTaskAction(st.project_id, st.id, patch).then((result) => {
          if (result.error) {
            if (/not found|already deleted/i.test(result.error)) {
              clearStaleTask(st.id);
              return undefined;
            }
            return { error: result.error };
          }
          const t = result.task;
          if (t) {
            const row: TaskRow = {
              id: t.id,
              project_id: t.project_id,
              project_name: st.project_name,
              title: t.title,
              description: t.description,
              status: t.status,
              assigned_worker_id: t.assigned_worker_id,
              worker_name: t.assigned_worker_id
                ? (workers.find((w) => w.id === t.assigned_worker_id)?.name ?? null)
                : null,
              due_date: t.due_date,
              priority: t.priority,
              created_at: t.created_at,
            };
            flushSync(() => {
              setTasks((prev) => prev.map((x) => (x.id === row.id ? row : x)));
              setSelectedTask((prev) => (prev?.id === row.id ? row : prev));
            });
          }
          dispatchClientDataSync({ reason: "task-drawer-save" });
          return undefined;
        }),
      onError: (msg) => setError(msg),
    });
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    await handleDeleteTaskById(selectedTask.id);
  };

  const handleDeleteTaskById = (taskId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Are you sure you want to delete this task?")
    )
      return;
    const selectedId = selectedTask?.id;

    type DelSnap = { tasks: TaskRow[]; drawerOpen: boolean; selected: TaskRow | null };
    runOptimisticPersist<DelSnap>({
      setBusy: setSubmitting,
      getSnapshot: () => ({
        tasks: [...tasksRef.current],
        drawerOpen,
        selected: selectedTask,
      }),
      apply: () => {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        if (selectedId === taskId) {
          setDrawerOpen(false);
          setSelectedTask(null);
        }
        setError(null);
      },
      rollback: (s) => {
        setTasks(s.tasks);
        setDrawerOpen(s.drawerOpen);
        setSelectedTask(s.selected);
      },
      persist: () =>
        fetch(`/api/tasks/${taskId}`, { method: "DELETE", cache: "no-store" })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (res.status === 404) {
              clearStaleTask(taskId);
              return undefined;
            }
            if (!res.ok) {
              const msg = (data as { message?: string }).message ?? "Failed to delete task.";
              console.error("[Tasks] Delete failed:", res.status, msg, data);
              return { error: msg };
            }
            dispatchClientDataSync({ reason: "task-deleted" });
            return undefined;
          })
          .catch((e) => ({
            error: e instanceof Error ? e.message : "Failed to delete task.",
          })),
      onError: (msg) => {
        console.error("[Tasks] Delete error:", msg);
        setError(msg);
      },
    });
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
            <Button
              size="touch"
              className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90 min-h-[44px]"
              onClick={openModal}
            >
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
              <Button
                onClick={openModal}
                className="mt-4 max-md:min-h-[44px] max-md:w-full max-md:max-w-[280px]"
                size="sm"
              >
                Create Task
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile: card layout */}
              <div className="flex flex-col gap-2 md:hidden divide-y divide-border/60">
                {filtered.map((t) => (
                  <div
                    key={t.id}
                    className="flex min-h-[44px] w-full touch-manipulation items-center gap-3 border-0 bg-transparent px-4 py-3 transition-colors active:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() => openDrawer(t)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                          t.status === "done"
                            ? "border-[#111111] bg-[#111111] text-white"
                            : "border-border"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDone(e, t);
                        }}
                      >
                        {t.status === "done" ? "✓" : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "font-medium truncate",
                            t.status === "done" && "text-muted-foreground line-through"
                          )}
                        >
                          {t.title || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.project_name ?? "—"} · Due{" "}
                          {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          t.priority === "high" &&
                            "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                          t.priority === "medium" &&
                            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          t.priority === "low" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </button>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-sm touch-manipulation"
                            aria-label="Task actions"
                            disabled={submitting}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[160px] rounded-md border border-border/60 bg-popover text-xs shadow-[var(--shadow-popover)]"
                        >
                          <DropdownMenuItem
                            onSelect={() => openDrawer(t)}
                            className="cursor-pointer"
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleDeleteTaskById(t.id)}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <table className="hidden w-full text-sm border-collapse table-fixed sm:table-auto md:table">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="w-9 text-left py-2 px-2 sm:px-3" aria-label="Done" />
                    <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">
                      Task
                    </th>
                    <th className="hidden sm:table-cell text-left py-2 px-3 font-medium text-muted-foreground">
                      Project
                    </th>
                    <th className="hidden md:table-cell text-left py-2 px-3 font-medium text-muted-foreground">
                      Assigned
                    </th>
                    <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">
                      Due
                    </th>
                    <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">
                      Priority
                    </th>
                    <th className="w-9 text-right py-2 px-2 sm:px-3" aria-label="Actions" />
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
                              t.status === "done"
                                ? "border-[#111111] bg-[#111111] text-white"
                                : "border-border"
                            )}
                          >
                            {t.status === "done" ? "✓" : null}
                          </span>
                        </button>
                      </td>
                      <td className="py-2 px-2 sm:px-3">
                        <span
                          className={cn(
                            "font-medium",
                            t.status === "done" && "text-muted-foreground line-through"
                          )}
                        >
                          {t.title || "—"}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell py-2 px-3 text-muted-foreground">
                        {t.project_name ?? "—"}
                      </td>
                      <td className="hidden md:table-cell py-2 px-3 text-muted-foreground">
                        {t.worker_name ?? "—"}
                      </td>
                      <td className="py-2 px-2 sm:px-3 text-muted-foreground tabular-nums">
                        {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 px-2 sm:px-3">
                        <span
                          className={cn(
                            "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
                            t.priority === "high" &&
                              "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                            t.priority === "medium" &&
                              "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                            t.priority === "low" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {PRIORITY_LABEL[t.priority] ?? t.priority}
                        </span>
                      </td>
                      <td
                        className="py-2 px-2 sm:px-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-sm"
                              aria-label="Task actions"
                              disabled={submitting}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[160px] rounded-md border border-border/60 bg-popover text-xs shadow-[var(--shadow-popover)]"
                          >
                            <DropdownMenuItem
                              onSelect={() => openDrawer(t)}
                              className="cursor-pointer"
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => handleDeleteTaskById(t.id)}
                              className="cursor-pointer text-destructive focus:text-destructive"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selectedTask?.title ?? "Task"}
        description={selectedTask?.project_name ?? undefined}
      >
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
                onChange={(e) =>
                  setDrawerForm((p) => ({ ...p, assigned_worker_id: e.target.value }))
                }
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">—</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
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
                onChange={(e) =>
                  setDrawerForm((p) => ({
                    ...p,
                    priority: e.target.value as "low" | "medium" | "high",
                  }))
                }
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
                onChange={(e) =>
                  setDrawerForm((p) => ({
                    ...p,
                    status: e.target.value as "todo" | "in_progress" | "done",
                  }))
                }
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
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
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-sm"
                  onClick={() => setDrawerOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
                  onClick={handleSaveDrawer}
                  disabled={submitting}
                >
                  Save
                </Button>
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
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
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
                ref={titleInputRef}
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
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
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
                onChange={(e) =>
                  setForm((p) => ({ ...p, priority: e.target.value as "low" | "medium" | "high" }))
                }
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
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    status: e.target.value as "todo" | "in_progress" | "done",
                  }))
                }
                className="mt-1.5 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
              onClick={handleSaveNew}
              disabled={submitting}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
