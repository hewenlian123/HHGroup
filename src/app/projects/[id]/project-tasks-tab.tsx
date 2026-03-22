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
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No tasks yet. Add one to get started.
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-10 py-2.5 px-3 text-left" />
                <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Title
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Assigned
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Due date
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/80 transition-colors"
                >
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={t.status === "done"}
                      disabled={togglingId === t.id}
                      onChange={() => handleToggleDone(t)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="py-2 px-3 font-medium text-gray-900">{t.title || "—"}</td>
                  <td className="py-2 px-3 text-gray-600">{t.worker_name ?? "—"}</td>
                  <td className="py-2 px-3 text-gray-600">
                    {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        t.priority === "high" && "bg-red-100 text-red-800",
                        t.priority === "medium" && "bg-amber-100 text-amber-800",
                        t.priority === "low" && "bg-gray-100 text-gray-600"
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-xl border-gray-200 shadow-sm">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>Add a task to this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="mt-1.5 h-10 rounded-lg border-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned Worker
              </label>
              <select
                value={assignedWorkerId}
                onChange={(e) => setAssignedWorkerId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
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
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 h-10 rounded-lg border-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter className="border-t border-gray-200 pt-4">
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
