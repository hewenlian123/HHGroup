"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { getWorkerUsageWithClient } from "@/lib/labor-db";
import * as workersDb from "@/lib/workers-db";
import type { WorkerDraft, UpdateWorkerPatch, WorkerRow } from "@/lib/workers-db";

async function workerActionClient() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) throw new Error(guard.error);
  return guard.client;
}

export async function createWorkerAction(
  draft: WorkerDraft
): Promise<{ ok: true; worker: WorkerRow } | { ok: false; error: string }> {
  try {
    const worker = await workersDb.insertWorker(draft, await workerActionClient());
    revalidatePath("/workers");
    return { ok: true, worker };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add worker." };
  }
}

export async function updateWorkerAction(
  id: string,
  patch: UpdateWorkerPatch
): Promise<{ ok: true; worker: WorkerRow | null } | { ok: false; error: string }> {
  try {
    const worker = await workersDb.updateWorker(id, patch, await workerActionClient());
    revalidatePath("/workers");
    return { ok: true, worker };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update worker." };
  }
}

export async function deleteWorkerAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = await workerActionClient();
    const usage = await getWorkerUsageWithClient(client, id);
    if (usage.used) {
      const source = usage.reason === "invoices" ? "labor invoices" : "labor entries";
      throw new Error(`Worker is used by ${source}.`);
    }
    await workersDb.deleteWorker(id, client);
    revalidatePath("/workers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete worker." };
  }
}
