"use server";

import { revalidatePath } from "next/cache";
import * as workersDb from "@/lib/workers-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import type { WorkerDraft, UpdateWorkerPatch, WorkerRow } from "@/lib/workers-db";

function workerActionClient() {
  const client = getServerSupabaseInternal();
  if (!client) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  return client;
}

export async function createWorkerAction(
  draft: WorkerDraft
): Promise<{ ok: true; worker: WorkerRow } | { ok: false; error: string }> {
  try {
    const worker = await workersDb.insertWorker(draft, workerActionClient());
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
    const worker = await workersDb.updateWorker(id, patch, workerActionClient());
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
    await workersDb.deleteWorker(id, workerActionClient());
    revalidatePath("/workers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete worker." };
  }
}
