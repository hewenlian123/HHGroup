"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  deleteProjectWithClient,
  forceDeleteProjectWithClient,
  getProjectUsageCountsWithClient,
  createProjectWithClient,
  updateProjectWithClient,
} from "@/lib/projects-db";
import {
  createServerSupabaseClient,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { authorizedAppRole } from "@/lib/auth-role";
import type { ProjectUsageCounts } from "@/lib/data";
import type { DeleteBlockedPayload } from "@/lib/projects-db";

async function getProjectActionClient() {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) return null;
  return getServerSupabaseInternalNoStore();
}

export async function createProjectAction(
  prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const name = (formData.get("name") as string)?.trim();
  const client = (formData.get("client") as string)?.trim();
  const customerId = (formData.get("customerId") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim();
  const budgetRaw = formData.get("budget");
  const budget = Number(budgetRaw);
  const status = (formData.get("status") as "active" | "pending" | "completed") ?? "pending";
  if (!name) return { error: "Project name is required." };
  if (!client) return { error: "Client name is required." };
  if (!address) return { error: "Project address is required." };
  if (!Number.isFinite(budget) || budget <= 0) return { error: "Budget must be greater than 0." };
  // projects.budget is the canonical contract value used by profit-engine (revenue base).
  const server = await getProjectActionClient();
  if (!server) return { error: "Server Supabase is not configured." };
  await createProjectWithClient(server, { name, client, customerId, address, budget, status });
  revalidatePath("/projects");
  redirect("/projects");
}

/** Returns usage counts for the project. If any count > 0, deletion should be blocked. */
export async function getProjectUsageAction(
  projectId: string
): Promise<{ blocked: false } | { blocked: true; counts: ProjectUsageCounts }> {
  if (!projectId?.trim()) return { blocked: false };
  try {
    const server = await getProjectActionClient();
    if (!server) return { blocked: false };
    const counts = await getProjectUsageCountsWithClient(server, projectId);
    const hasAny =
      (counts.labor_entries ?? 0) > 0 ||
      (counts.expenses ?? 0) > 0 ||
      (counts.bills ?? 0) > 0 ||
      (counts.invoices ?? 0) > 0 ||
      (counts.subcontracts ?? 0) > 0 ||
      (counts.project_change_orders ?? 0) > 0 ||
      (counts.worker_receipts ?? 0) > 0;
    if (hasAny) return { blocked: true, counts };
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

/** Update project name, client, address, budget, and optional customer_id. */
export async function updateProjectAction(
  projectId: string,
  patch: {
    name: string;
    client?: string;
    address?: string;
    budget: number;
    customerId?: string | null;
  }
): Promise<{ error?: string }> {
  const strictGuard = await requireSupabaseOwnerOrAdminServerAction();
  if (!strictGuard.ok) return { error: "Authentication required." };

  if (!projectId?.trim()) return { error: "Project ID is required." };
  const name = patch.name?.trim();
  const client = patch.client?.trim();
  const address = patch.address?.trim();
  if (!name) return { error: "Project name is required." };
  if (!client) return { error: "Client name is required." };
  if (!address) return { error: "Project address is required." };
  const budget = Number(patch.budget);
  if (!Number.isFinite(budget) || budget < 0) return { error: "Budget must be 0 or greater." };
  try {
    const authClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = authClient
      ? await authClient.auth.getUser().catch(() => ({ data: { user: null } }))
      : { data: { user: null } };
    if (!user || !authorizedAppRole(user)) {
      return { error: "Authentication required." };
    }

    const server = getServerSupabaseInternalNoStore();
    if (!server) return { error: "Server Supabase is not configured." };

    await updateProjectWithClient(server, projectId, {
      name,
      client,
      address,
      budget,
      contractAmount: budget,
      ...(patch.customerId !== undefined ? { customerId: patch.customerId?.trim() || null } : {}),
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/dashboard");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update project.";
    return { error: message };
  }
}

/** Update project status only (active | pending | completed). */
export async function updateProjectStatusAction(
  projectId: string,
  status: "active" | "pending" | "completed"
): Promise<{ error?: string }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    const server = await getProjectActionClient();
    if (!server) return { error: "Server Supabase is not configured." };
    const updated = await updateProjectWithClient(server, projectId, { status });
    if (!updated) return { error: "Project was not found or could not be updated." };
    if (updated.status !== status) return { error: "Project status was not updated." };
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/dashboard");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update status.";
    return { error: message };
  }
}

/** Archive project (set status to completed). */
export async function archiveProjectAction(projectId: string): Promise<{ error?: string }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    const server = await getProjectActionClient();
    if (!server) return { error: "Server Supabase is not configured." };
    const updated = await updateProjectWithClient(server, projectId, { status: "completed" });
    if (!updated) return { error: "Project was not found or could not be archived." };
    if (updated.status !== "completed") return { error: "Project status was not archived." };
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/dashboard");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to archive project.";
    return { error: message };
  }
}

export async function deleteProjectAction(
  projectId: string
): Promise<{ error?: string; blocked?: boolean; counts?: Record<string, number> }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    const server = await getProjectActionClient();
    if (!server) return { error: "Server Supabase is not configured." };
    const usage = await getProjectUsageCountsWithClient(server, projectId);
    const hasAny =
      (usage.labor_entries ?? 0) > 0 ||
      (usage.expenses ?? 0) > 0 ||
      (usage.bills ?? 0) > 0 ||
      (usage.invoices ?? 0) > 0 ||
      (usage.subcontracts ?? 0) > 0 ||
      (usage.project_change_orders ?? 0) > 0 ||
      (usage.worker_receipts ?? 0) > 0;
    if (hasAny) {
      return { blocked: true, counts: usage };
    }
    const ok = await deleteProjectWithClient(server, projectId);
    if (!ok) return { error: "Failed to delete project." };
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return {};
  } catch (e) {
    const payload = e as DeleteBlockedPayload | undefined;
    if (payload && payload.__deleteBlocked === true && payload.counts) {
      return { blocked: true, counts: payload.counts };
    }
    const message = e instanceof Error ? e.message : "Failed to delete project.";
    return { error: message };
  }
}

/** Force delete project and all related data. Use after user confirms in the delete-blocked dialog. */
export async function forceDeleteProjectAction(projectId: string): Promise<{ error?: string }> {
  if (!projectId?.trim()) return { error: "Project ID is required." };
  try {
    const server = await getProjectActionClient();
    if (!server) return { error: "Server Supabase is not configured." };
    await forceDeleteProjectWithClient(server, projectId);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Force delete failed.";
    return { error: message };
  }
}
