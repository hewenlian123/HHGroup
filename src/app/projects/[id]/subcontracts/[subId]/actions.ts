"use server";

import { revalidatePath } from "next/cache";
import { updateSubcontractStatus } from "@/lib/data";

export async function updateSubcontractStatusAction(
  projectId: string,
  subcontractId: string,
  status: "Draft" | "Active" | "Completed" | "Cancelled"
): Promise<{ ok: boolean; error?: string }> {
  try {
    await updateSubcontractStatus(subcontractId, status);
    revalidatePath(`/projects/${projectId}/subcontracts`);
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update status." };
  }
}

