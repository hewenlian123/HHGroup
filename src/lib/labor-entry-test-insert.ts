import type { SupabaseClient } from "@supabase/supabase-js";

function isSchemaOrMissingColumn(msg: string): boolean {
  return /could not find the .* column|column .* does not exist|schema cache/i.test(msg);
}

/**
 * Insert one `labor_entries` row for workflow / system tests. Shapes differ by migration
 * (timesheet vs daily log vs project_id + work_date only).
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
      hours: 4,
      cost_amount: 50,
    },
    {
      worker_id: workerId,
      project_id: projectId,
      work_date: workDate,
      cost_amount: 50,
    },
    {
      worker_id: workerId,
      project_id: projectId,
      work_date: workDate,
    },
    {
      worker_id: workerId,
      work_date: workDate,
      project_am_id: projectId,
      day_rate: 50,
      ot_amount: 0,
      total: 50,
    },
    {
      worker_id: workerId,
      date: workDate,
      am_project_id: projectId,
      pm_project_id: projectId,
      half_day_rate: 50,
      ot_amount: 0,
      total: 50,
      status: "draft",
    },
    {
      worker_id: workerId,
      entry_date: workDate,
      am_worked: true,
      pm_worked: true,
      am_project_id: projectId,
      pm_project_id: projectId,
      ot_amount: 0,
      total: 50,
      status: "draft",
    },
  ];
  let lastErr = "";
  for (const payload of attempts) {
    const { data, error } = await c.from("labor_entries").insert(payload).select("id").single();
    if (!error && data) return data as { id: string };
    lastErr = error?.message ?? "";
    if (lastErr && !isSchemaOrMissingColumn(lastErr)) break;
  }
  throw new Error(lastErr || "labor_entries insert failed");
}
