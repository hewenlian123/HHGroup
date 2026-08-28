import type { SupabaseClient } from "@supabase/supabase-js";

function isSchemaOrMissingColumn(msg: string): boolean {
  return /could not find the .* column|column .* does not exist|schema cache|pgrst204/i.test(msg);
}

function tryNextLaborInsertShape(msg: string): boolean {
  if (!msg) return false;
  if (isSchemaOrMissingColumn(msg)) return true;
  if (/violates foreign key constraint/i.test(msg)) return false;
  if (/duplicate key|already exists|unique constraint/i.test(msg)) return false;
  if (/null value in column|violates check constraint/i.test(msg)) return true;
  return false;
}

/**
 * Insert one `labor_entries` row for workflow / system tests.
 *
 * Every supported schema must preserve the canonical direct project attribution.
 * Optional status/session fields may vary, but `project_id` is never removed.
 */
export async function insertLaborEntryForTestSchema(
  c: SupabaseClient,
  opts: { workerId: string; projectId: string; workDate: string }
): Promise<{ id: string }> {
  const { workerId, projectId, workDate } = opts;

  const attempts: Record<string, unknown>[] = [
    {
      worker_id: workerId,
      project_id: projectId,
      work_date: workDate,
      morning: true,
      afternoon: true,
      cost_amount: 50,
    },
    {
      worker_id: workerId,
      project_id: projectId,
      work_date: workDate,
      hours: 4,
      cost_amount: 50,
    },
    { worker_id: workerId, project_id: projectId, work_date: workDate, cost_amount: 50 },
    { worker_id: workerId, project_id: projectId, work_date: workDate, status: "Draft" },
    { worker_id: workerId, project_id: projectId, work_date: workDate },
  ];
  let lastErr = "";
  for (const payload of attempts) {
    const { data, error } = await c.from("labor_entries").insert(payload).select("id").single();
    if (!error && data) return data as { id: string };
    lastErr = error?.message ?? "";
    if (lastErr && !tryNextLaborInsertShape(lastErr)) break;
  }
  throw new Error(lastErr || "labor_entries insert failed");
}
