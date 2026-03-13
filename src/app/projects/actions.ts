"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createProject,
  deleteProject,
  getProjectUsageCounts,
  updateProject,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  insertActivityLog,
} from "@/lib/data";
import type { ProjectUsageCounts } from "@/lib/data";
import type { ProjectTaskStatus } from "@/lib/project-tasks-db";

export async function createProjectAction(prevState: { error?: string } | null, formData: FormData): Promise<{ error?: string } | null> {
  const name = (formData.get("name") as string)?.trim();
  const budgetRaw = formData.get("budget");
  const budget = Number(budgetRaw);
  const status = (formData.get("status") as "active" | "pending" | "completed") ?? "pending";
  if (!name) return { error: "Project name is required." };
  if (!Number.isFinite(budget) || budget <= 0) return { error: "Budget must be greater than 0." };
  // projects.budget is the canonical contract value used by profit-engine (revenue base).
  await createProject({ name, budget, status });
  revalidatePath("/projects");
  redirect("/projects");
}

/** Returns usage counts for the project. If any count > 0, deletion should be blocked. */
export async function getProjectUsageAction(projectId: string): Promise<
  { blocked: false } | { blocked: true; counts: ProjectUsageCounts }
> {
  if (!projectId?.trim()) return { blocked: false };
  try {
    const counts = await getProjectUsageCounts(projectId);
    const hasAny =
      (counts.labor_entries ?? 0) > 0 ||
      (counts.expenses ?? 0) > 0 ||
      (counts.bills ?? 0) > 0 ||
      (counts.invoices ?? 0) > 0 ||
      (counts.subcontracts ?? 0) > 0 ||
      (counts.project_change_orders ?? 0) > 0 ||
      (counts.worker_receipts ?? 0) > 0 ||
      (counts.site_photos ?? 0) > 0 ||
      (counts.materials ?? 0) > 0;
    if (hasAny) return { blocked: true, counts };
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

/** Archive project (set status to completed). */
export async function archiveProjectAction(projectId: string): Promise<{ error?: string }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    await updateProject(projectId, { status: "completed" });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/dashboard");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to archive project.";
    return { error: message };
  }
}

export async function deleteProjectAction(projectId: string): Promise<{ error?: string; blocked?: boolean; counts?: ProjectUsageCounts }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    const usage = await getProjectUsageCounts(projectId);
    const hasAny =
      (usage.labor_entries ?? 0) > 0 ||
      (usage.expenses ?? 0) > 0 ||
      (usage.bills ?? 0) > 0 ||
      (usage.invoices ?? 0) > 0 ||
      (usage.subcontracts ?? 0) > 0 ||
      (usage.project_change_orders ?? 0) > 0 ||
      (usage.worker_receipts ?? 0) > 0 ||
      (usage.site_photos ?? 0) > 0 ||
      (usage.materials ?? 0) > 0;
    if (hasAny) {
      return { blocked: true, counts: usage };
    }
    const ok = await deleteProject(projectId);
    if (!ok) return { error: "Failed to delete project." };
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    redirect("/projects");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete project.";
    return { error: message };
  }
}

export async function createProjectTaskAction(projectId: string, draft: {
  title: string;
  description?: string | null;
  assigned_worker_id?: string | null;
  due_date?: string | null;
  priority?: "low" | "medium" | "high";
  status?: ProjectTaskStatus;
}): Promise<{ error?: string }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    await createProjectTask({
      project_id: projectId,
      title: draft.title.trim() || "Untitled",
      description: draft.description?.trim() || null,
      assigned_worker_id: draft.assigned_worker_id ?? null,
      due_date: draft.due_date?.slice(0, 10) ?? null,
      priority: (draft.priority as "low" | "medium" | "high") ?? "medium",
      status: draft.status ?? "todo",
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/tasks");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create task.";
    return { error: message };
  }
}

export async function updateProjectTaskAction(
  projectId: string,
  taskId: string,
  patch: { title?: string; description?: string | null; status?: ProjectTaskStatus; assigned_worker_id?: string | null; due_date?: string | null; priority?: "low" | "medium" | "high" }
): Promise<{ error?: string }> {
  if (!projectId?.trim() || !taskId?.trim()) return { error: "Project and task ID are required." };
  try {
    const updated = await updateProjectTask(taskId, patch);
    if (patch.status === "done" && updated?.project_id) {
      await insertActivityLog(updated.project_id, "task_completed", "Task completed");
    }
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update task.";
    return { error: message };
  }
}

export async function deleteProjectTaskAction(projectId: string, taskId: string): Promise<{ error?: string }> {
  if (!projectId?.trim() || !taskId?.trim()) return { error: "Project and task ID are required." };
  try {
    await deleteProjectTask(taskId);
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete task.";
    return { error: message };
  }
}
