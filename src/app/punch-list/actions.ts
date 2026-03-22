"use server";

import { revalidatePath } from "next/cache";
import { createPunchListItem, updatePunchListItem } from "@/lib/data";

export async function createPunchListItemAction(draft: {
  project_id: string;
  issue: string;
  location?: string | null;
  description?: string | null;
  assigned_worker_id?: string | null;
  priority?: string;
  status?: string;
  photo_url?: string | null;
  photo_id?: string | null;
  notes?: string | null;
}): Promise<{ error?: string }> {
  try {
    await createPunchListItem({
      project_id: draft.project_id,
      issue: draft.issue.trim() || "Issue",
      location: draft.location?.trim() || null,
      description: draft.description?.trim() || null,
      assigned_worker_id: draft.assigned_worker_id ?? null,
      priority: draft.priority ?? "Medium",
      status: draft.status ?? "open",
      photo_url: draft.photo_url?.trim() || null,
      photo_id: draft.photo_id ?? null,
      notes: draft.notes?.trim() || null,
    });
    revalidatePath("/punch-list");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create issue.";
    return { error: message };
  }
}

export async function updatePunchListItemAction(
  id: string,
  patch: {
    issue?: string;
    location?: string | null;
    description?: string | null;
    assigned_worker_id?: string | null;
    priority?: string;
    status?: string;
    photo_url?: string | null;
    notes?: string | null;
  }
): Promise<{ error?: string }> {
  try {
    await updatePunchListItem(id, patch);
    revalidatePath("/punch-list");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update issue.";
    return { error: message };
  }
}
