/**
 * Worker advances: salary advances to be deducted from future payments.
 * Table: worker_advances.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

/** API row shape for labor/advances pages (names joined in app — avoids brittle PostgREST embeds). */
export type WorkerAdvanceApiRow = {
  id: string;
  workerId: string;
  workerName: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  advanceDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
};

export type WorkerAdvanceSelectRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  amount: unknown;
  advance_date: unknown;
  status: unknown;
  notes: unknown;
  created_at: unknown;
};

/**
 * Attach worker / project names for API responses. Prefer labor_workers (Worker Balances source), then workers.
 */
export async function mapWorkerAdvanceRowsForApi(
  admin: SupabaseClient,
  rows: WorkerAdvanceSelectRow[]
): Promise<WorkerAdvanceApiRow[]> {
  const workerIds = [...new Set(rows.map((r) => String(r.worker_id ?? "").trim()).filter(Boolean))];
  const projectIds = [
    ...new Set(
      rows.map((r) => (r.project_id != null ? String(r.project_id).trim() : "")).filter(Boolean)
    ),
  ];

  const [lwRes, wRes, pRes] = await Promise.all([
    workerIds.length
      ? admin.from("labor_workers").select("id, name").in("id", workerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    workerIds.length
      ? admin.from("workers").select("id, name").in("id", workerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    projectIds.length
      ? admin.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
  ]);

  const nameByWorker = new Map<string, string>();
  for (const r of lwRes.data ?? []) {
    if (r?.id) nameByWorker.set(String(r.id), String(r.name ?? "").trim());
  }
  for (const r of wRes.data ?? []) {
    if (!r?.id) continue;
    const id = String(r.id);
    if (nameByWorker.has(id)) continue;
    nameByWorker.set(id, String(r.name ?? "").trim());
  }

  const nameByProject = new Map<string, string | null>();
  for (const r of pRes.data ?? []) {
    if (r?.id) nameByProject.set(String(r.id), r.name ?? null);
  }

  return rows.map((r) => {
    const wid = String(r.worker_id ?? "");
    const pid = r.project_id != null ? String(r.project_id) : null;
    return {
      id: r.id,
      workerId: wid,
      workerName: nameByWorker.get(wid) ?? "",
      projectId: pid,
      projectName: pid ? (nameByProject.get(pid) ?? null) : null,
      amount: Number(r.amount) || 0,
      advanceDate: String(r.advance_date ?? "").slice(0, 10),
      status: String(r.status ?? "pending"),
      notes: (r.notes as string | null) ?? null,
      createdAt: String(r.created_at ?? ""),
    };
  });
}

export type WorkerAdvanceStatus = "pending" | "deducted" | "cancelled";

export type WorkerAdvance = {
  id: string;
  workerId: string;
  projectId: string | null;
  amount: number;
  advanceDate: string;
  status: WorkerAdvanceStatus;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type CreateWorkerAdvanceInput = {
  workerId: string;
  projectId?: string | null;
  amount: number;
  advanceDate?: string; // YYYY-MM-DD
  notes?: string | null;
};

export type UpdateWorkerAdvanceInput = {
  projectId?: string | null;
  amount?: number;
  advanceDate?: string;
  status?: WorkerAdvanceStatus;
  notes?: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return (
    /schema cache|relation.*does not exist|could not find the table|table.*does not exist|pgrst205/i.test(
      m
    ) || err?.code === "PGRST205"
  );
}

const COLS =
  "id, worker_id, project_id, amount, advance_date, status, notes, created_at, created_by";

function fromRow(r: Record<string, unknown>): WorkerAdvance {
  return {
    id: (r.id as string) ?? "",
    workerId: (r.worker_id as string) ?? "",
    projectId: (r.project_id as string | null) ?? null,
    amount: Number(r.amount) || 0,
    advanceDate: ((r.advance_date as string) ?? "").slice(0, 10),
    status: ((r.status as string) ?? "pending").toLowerCase() as WorkerAdvanceStatus,
    notes: (r.notes as string | null) ?? null,
    createdAt: (r.created_at as string) ?? "",
    createdBy: (r.created_by as string | null) ?? null,
  };
}

export async function createWorkerAdvance(input: CreateWorkerAdvanceInput): Promise<WorkerAdvance> {
  const c = client();
  const amt = Number(input.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be greater than 0.");

  const payload = {
    worker_id: input.workerId,
    project_id: input.projectId ?? null,
    amount: amt,
    advance_date: (input.advanceDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await c.from("worker_advances").insert(payload).select(COLS).single();
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("未找到 worker_advances 表。请先运行对应的 migration 再创建预支记录。");
    }
    throw new Error(error.message ?? "Failed to create worker advance.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function getWorkerAdvances(filters?: {
  workerId?: string;
  projectId?: string;
  status?: WorkerAdvanceStatus | "active";
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<WorkerAdvance[]> {
  const c = client();
  let q = c
    .from("worker_advances")
    .select(COLS)
    .order("advance_date", { ascending: false })
    .order("created_at", {
      ascending: false,
    });

  if (filters?.workerId) q = q.eq("worker_id", filters.workerId);
  if (filters?.projectId) q = q.eq("project_id", filters.projectId);
  if (filters?.fromDate) q = q.gte("advance_date", filters.fromDate);
  if (filters?.toDate) q = q.lte("advance_date", filters.toDate);
  if (filters?.status === "active") {
    q = q.in("status", ["pending", "deducted"]);
  } else if (filters?.status) {
    q = q.eq("status", filters.status);
  }
  if (filters?.limit) q = q.limit(Math.max(1, Math.min(filters.limit, 500)));

  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load worker advances.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getWorkerAdvanceById(id: string): Promise<WorkerAdvance | null> {
  const c = client();
  const { data, error } = await c.from("worker_advances").select(COLS).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load worker advance.");
  }
  return data ? fromRow(data as Record<string, unknown>) : null;
}

export async function updateWorkerAdvance(
  id: string,
  patch: UpdateWorkerAdvanceInput
): Promise<WorkerAdvance | null> {
  const c = client();
  const payload: Record<string, unknown> = {};
  if (patch.projectId !== undefined) payload.project_id = patch.projectId;
  if (patch.amount !== undefined) payload.amount = Number(patch.amount);
  if (patch.advanceDate !== undefined) payload.advance_date = patch.advanceDate.slice(0, 10);
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;

  const { data, error } = await c
    .from("worker_advances")
    .update(payload)
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to update worker advance.");
  }
  return data ? fromRow(data as Record<string, unknown>) : null;
}

export async function deleteWorkerAdvance(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("worker_advances").delete().eq("id", id);
  if (error) {
    if (isMissingTable(error)) return;
    throw new Error(error.message ?? "Failed to delete worker advance.");
  }
}
