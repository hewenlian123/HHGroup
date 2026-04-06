"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/base";
import { createProjectTaskAction, updateProjectTaskAction } from "../actions";
import type { ProjectTaskWithWorker } from "@/lib/data";
import type { Worker } from "@/lib/labor-db";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export function ProjectTasksTab({
  projectId,
  tasks,
  workers,
  onTaskCreated,
  onTaskUpdated,
}: {
  projectId: string;
  tasks: ProjectTaskWithWorker[];
  workers: Worker[];
  onTaskCreated: () => void;
  onTaskUpdated: () => void;
}) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignedWorkerId, setAssignedWorkerId] = React.useState<string>("");
  const [dueDate, setDueDate] = React.useState("");
  const [priority, setPriority] = React.useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const handleToggleDone = async (task: ProjectTaskWithWorker) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    setTogglingId(task.id);
    try {
      await updateProjectTaskAction(projectId, task.id, { status: nextStatus });
      onTaskUpdated();
    } finally {
      setTogglingId(null);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAssignedWorkerId("");
    setDueDate("");
    setPriority("medium");
    setError(null);
  };

  const handleOpen = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await createProjectTaskAction(projectId, {
        title: title.trim() || "Untitled",
        description: description.trim() || null,
        assigned_worker_id: assignedWorkerId || null,
        due_date: dueDate || null,
        priority,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setModalOpen(false);
      onTaskCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader label="Tasks" />
        <Button
          size="sm"
          className="rounded-xl bg-black text-white px-4 py-2 hover:bg-black/90"
          onClick={handleOpen}
        >
          + New Task
        </Button>
      </div>
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No tasks yet. Add one to get started.
          </div>
        ) : (
          <div className="airtable-table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="h-8 w-10 px-3 text-left align-middle" />
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Title
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Assigned
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Due date
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Priority
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className={listTableRowStaticClassName}>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle">
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        disabled={togglingId === t.id}
                        onChange={() => handleToggleDone(t)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium text-foreground">
                      {t.title || "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {t.worker_name ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums text-muted-foreground">
                      {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          t.priority === "high" && "bg-red-100 text-red-800",
                          t.priority === "medium" && "bg-amber-100 text-amber-800",
                          t.priority === "low" && "bg-page text-text-secondary"
                        )}
                      >
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-xl border-gray-100 shadow-sm">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>Add a task to this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="mt-1.5 h-10 rounded-lg border-gray-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-gray-100 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Assigned Worker
              </label>
              <select
                value={assignedWorkerId}
                onChange={(e) => setAssignedWorkerId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-100 bg-white px-3 text-sm"
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
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Due Date
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 h-10 rounded-lg border-gray-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-100 bg-white px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter className="border-t border-gray-100 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg bg-black text-white hover:bg-black/90"
              onClick={handleSave}
              disabled={submitting}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
