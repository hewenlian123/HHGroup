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
 * Schema varies: some envs have only `worker_id`, `work_date`, `cost_amount`, flags, `status`
 * (no `project_id` / AM-PM project columns). Try **minimal** shapes first, then richer / `project_id`
 * variants. Never use dropped columns (`project_am_id`, `am_project_id`, `day_rate`, …).
 */
export async function insertLaborEntryForTestSchema(
  c: SupabaseClient,
  opts: { workerId: string; projectId: string; workDate: string }
): Promise<{ id: string }> {
  const { workerId, projectId, workDate } = opts;

  /** Sparse daily labor (matches local Supabase: no project_* on row). */
  const minimalAttempts: Record<string, unknown>[] = [
    { worker_id: workerId, work_date: workDate, cost_amount: 50 },
    { worker_id: workerId, work_date: workDate, cost_amount: 50, status: "pending" },
    { worker_id: workerId, work_date: workDate, cost_amount: 50, status: "Draft" },
    {
      worker_id: workerId,
      work_date: workDate,
      cost_amount: 50,
      morning: true,
      afternoon: true,
    },
    {
      worker_id: workerId,
      work_date: workDate,
      cost_amount: 50,
      hours: 4,
      notes: "workflow-test",
    },
    { worker_id: workerId, work_date: workDate, cost_amount: 50, hours: 0 },
  ];

  /** Wider schemas: project link, alternate date column names, etc. */
  const extendedAttempts: Record<string, unknown>[] = [
    { worker_id: workerId, project_id: projectId, work_date: workDate },
    { worker_id: workerId, project_id: projectId, work_date: workDate, cost_amount: 50 },
    { worker_id: workerId, project_id: projectId, date: workDate },
    { worker_id: workerId, project_id: projectId, entry_date: workDate },
    { worker_id: workerId, project_id: projectId, work_date: workDate, status: "pending" },
    { worker_id: workerId, project_id: projectId, work_date: workDate, status: "Draft" },
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
    { worker_id: workerId, project_id: projectId, date: workDate, cost_amount: 50 },
  ];

  const attempts = [...minimalAttempts, ...extendedAttempts];
  let lastErr = "";
  for (const payload of attempts) {
    const { data, error } = await c.from("labor_entries").insert(payload).select("id").single();
    if (!error && data) return data as { id: string };
    lastErr = error?.message ?? "";
    if (lastErr && !tryNextLaborInsertShape(lastErr)) break;
  }
  throw new Error(lastErr || "labor_entries insert failed");
}
