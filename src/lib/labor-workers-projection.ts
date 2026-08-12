import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keep the minimal labor-worker projection required by legacy Labor FK paths.
 * Call this only with the privileged, request-authorized server client.
 */
export async function syncLaborWorkerProjectionWithClient(
  client: SupabaseClient,
  worker: Pick<{ id: string; name: string }, "id" | "name">
): Promise<void> {
  const id = worker.id?.trim();
  const name = worker.name?.trim();
  if (!id || !name) {
    throw new Error("labor_workers projection requires a worker id and name.");
  }

  const { error } = await client.from("labor_workers").upsert({ id, name }, { onConflict: "id" });
  if (error) {
    throw new Error(error.message ?? "labor_workers projection sync failed.");
  }
}
