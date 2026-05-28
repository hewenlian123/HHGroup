import type { SupabaseClient } from "@supabase/supabase-js";

const OT_MULTIPLIER = 1.5;

export type WorkerRateHistory = {
  id: string;
  workerId: string;
  rateType: "daily";
  dailyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EffectiveDailyRate = {
  dailyRate: number;
  rateHistoryId: string | null;
  effectiveFrom: string | null;
};

export type LaborEntryRateSnapshot = {
  days_worked: number;
  daily_rate_snapshot: number;
  amount_snapshot: number;
  labor_cost_snapshot: number;
  cost_amount: number;
  rate_history_id: string | null;
};

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(value: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) throw new Error("Effective date is required.");
  return text.slice(0, 10);
}

function previousDate(value: string): string {
  const date = new Date(`${normalizeDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMissingRateHistorySchemaError(error: { message?: string; code?: string } | null) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    /worker_rate_history|schema cache|could not find the table|relation .* does not exist|column/i.test(
      message
    )
  );
}

function mapHistoryRow(row: Record<string, unknown>): WorkerRateHistory {
  return {
    id: String(row.id ?? ""),
    workerId: String(row.worker_id ?? ""),
    rateType: "daily",
    dailyRate: safeNumber(row.daily_rate),
    effectiveFrom: String(row.effective_from ?? "").slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

async function fallbackWorkerDailyRate(
  c: SupabaseClient,
  workerId: string
): Promise<EffectiveDailyRate> {
  const { data, error } = await c
    .from("workers")
    .select("id, daily_rate, half_day_rate, created_at")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load worker daily rate.");
  const row = (data ?? {}) as {
    daily_rate?: number | null;
    half_day_rate?: number | null;
    created_at?: string | null;
  };
  const dailyRate =
    row.daily_rate != null && safeNumber(row.daily_rate) > 0
      ? safeNumber(row.daily_rate)
      : safeNumber(row.half_day_rate);
  return {
    dailyRate: Math.max(0, dailyRate),
    rateHistoryId: null,
    effectiveFrom: row.created_at ? String(row.created_at).slice(0, 10) : null,
  };
}

export async function getWorkerRateHistoryWithClient(
  c: SupabaseClient,
  workerId: string
): Promise<WorkerRateHistory[]> {
  const { data, error } = await c
    .from("worker_rate_history")
    .select(
      "id, worker_id, rate_type, daily_rate, effective_from, effective_to, notes, created_at, updated_at"
    )
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRateHistorySchemaError(error)) return [];
    throw new Error(error.message ?? "Failed to load worker rate history.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapHistoryRow);
}

export async function resolveWorkerDailyRateForDateWithClient(
  c: SupabaseClient,
  workerId: string,
  workDate: string
): Promise<EffectiveDailyRate> {
  const date = normalizeDate(workDate);
  const { data, error } = await c
    .from("worker_rate_history")
    .select("id, daily_rate, effective_from")
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    const row = data as { id?: string; daily_rate?: number | null; effective_from?: string | null };
    return {
      dailyRate: Math.max(0, safeNumber(row.daily_rate)),
      rateHistoryId: row.id ?? null,
      effectiveFrom: row.effective_from ? String(row.effective_from).slice(0, 10) : null,
    };
  }
  if (error && !isMissingRateHistorySchemaError(error)) {
    throw new Error(error.message ?? "Failed to resolve worker daily rate.");
  }
  return fallbackWorkerDailyRate(c, workerId);
}

export async function getWorkerCurrentDailyRateWithClient(
  c: SupabaseClient,
  workerId: string,
  asOfDate = todayYmd()
): Promise<EffectiveDailyRate> {
  return resolveWorkerDailyRateForDateWithClient(c, workerId, asOfDate);
}

export function daysWorkedFromLaborInput(input: {
  hours?: unknown;
  morning?: unknown;
  afternoon?: unknown;
}): number {
  const hasMorning = input.morning === true;
  const hasAfternoon = input.afternoon === true;
  if (hasMorning || hasAfternoon) {
    return (hasMorning ? 0.5 : 0) + (hasAfternoon ? 0.5 : 0);
  }
  const rawHours = safeNumber(input.hours);
  if (rawHours <= 0) return 0;
  return rawHours <= 2 ? rawHours : rawHours / 8;
}

export function laborCostFromDailyRate(dailyRate: number, daysWorked: number, otHours = 0): number {
  const basePay = Math.max(0, safeNumber(dailyRate)) * Math.max(0, safeNumber(daysWorked));
  const otPay =
    Math.max(0, safeNumber(otHours)) * (Math.max(0, safeNumber(dailyRate)) / 8) * OT_MULTIPLIER;
  return basePay + otPay;
}

export async function buildLaborEntryRateSnapshotWithClient(
  c: SupabaseClient,
  params: {
    workerId: string;
    workDate: string;
    hours?: unknown;
    morning?: unknown;
    afternoon?: unknown;
    otHours?: unknown;
    existingDailyRateSnapshot?: unknown;
  }
): Promise<LaborEntryRateSnapshot> {
  const daysWorked = daysWorkedFromLaborInput(params);
  const effective =
    params.existingDailyRateSnapshot != null && safeNumber(params.existingDailyRateSnapshot) > 0
      ? {
          dailyRate: safeNumber(params.existingDailyRateSnapshot),
          rateHistoryId: null,
          effectiveFrom: null,
        }
      : await resolveWorkerDailyRateForDateWithClient(c, params.workerId, params.workDate);
  const amount = laborCostFromDailyRate(
    effective.dailyRate,
    daysWorked,
    safeNumber(params.otHours)
  );
  return {
    days_worked: daysWorked,
    daily_rate_snapshot: effective.dailyRate,
    amount_snapshot: amount,
    labor_cost_snapshot: amount,
    cost_amount: amount,
    rate_history_id: effective.rateHistoryId,
  };
}

export async function changeWorkerDailyRateWithClient(
  c: SupabaseClient,
  workerId: string,
  input: { dailyRate: unknown; effectiveFrom: string; notes?: string | null }
): Promise<WorkerRateHistory> {
  const dailyRate = safeNumber(input.dailyRate);
  if (!Number.isFinite(dailyRate) || dailyRate < 0) {
    throw new Error("Daily rate must be a valid non-negative number.");
  }
  const effectiveFrom = normalizeDate(input.effectiveFrom);
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const closeTo = previousDate(effectiveFrom);

  const { data: worker, error: workerErr } = await c
    .from("workers")
    .select("id")
    .eq("id", workerId)
    .maybeSingle();
  if (workerErr) throw new Error(workerErr.message ?? "Failed to load worker.");
  if (!worker) throw new Error("Worker not found.");

  const nextRes = await c
    .from("worker_rate_history")
    .select("effective_from")
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .gt("effective_from", effectiveFrom)
    .order("effective_from", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextRes.error && !isMissingRateHistorySchemaError(nextRes.error)) {
    throw new Error(nextRes.error.message ?? "Failed to load next rate history.");
  }
  const nextEffectiveFrom = (nextRes.data as { effective_from?: string | null } | null)
    ?.effective_from;
  const effectiveTo = nextEffectiveFrom ? previousDate(String(nextEffectiveFrom)) : null;

  const overlapping = await c
    .from("worker_rate_history")
    .update({ effective_to: closeTo })
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .lt("effective_from", effectiveFrom)
    .or(`effective_to.is.null,effective_to.gte.${effectiveFrom}`);
  if (overlapping.error && !isMissingRateHistorySchemaError(overlapping.error)) {
    throw new Error(overlapping.error.message ?? "Failed to close previous daily rate.");
  }

  const { data: sameDate } = await c
    .from("worker_rate_history")
    .select("id")
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .eq("effective_from", effectiveFrom)
    .maybeSingle();

  const payload = {
    worker_id: workerId,
    rate_type: "daily",
    daily_rate: dailyRate,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
  };
  const write = sameDate
    ? await c
        .from("worker_rate_history")
        .update(payload)
        .eq("id", (sameDate as { id: string }).id)
        .select(
          "id, worker_id, rate_type, daily_rate, effective_from, effective_to, notes, created_at, updated_at"
        )
        .single()
    : await c
        .from("worker_rate_history")
        .insert(payload)
        .select(
          "id, worker_id, rate_type, daily_rate, effective_from, effective_to, notes, created_at, updated_at"
        )
        .single();
  if (write.error || !write.data) {
    throw new Error(write.error?.message ?? "Failed to save worker daily rate history.");
  }

  if (effectiveFrom <= todayYmd()) {
    await c
      .from("workers")
      .update({ daily_rate: dailyRate, half_day_rate: dailyRate })
      .eq("id", workerId);
  }

  return mapHistoryRow(write.data as Record<string, unknown>);
}

export async function ensureInitialWorkerRateHistoryWithClient(
  c: SupabaseClient,
  params: {
    workerId: string;
    dailyRate: unknown;
    effectiveFrom?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  const workerId = params.workerId.trim();
  if (!workerId) return;
  const { data: existing, error: existingErr } = await c
    .from("worker_rate_history")
    .select("id")
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .limit(1);
  if (existingErr) {
    if (isMissingRateHistorySchemaError(existingErr)) return;
    throw new Error(existingErr.message ?? "Failed to load worker rate history.");
  }
  if ((existing ?? []).length > 0) return;

  const effectiveFrom = params.effectiveFrom ? normalizeDate(params.effectiveFrom) : todayYmd();
  const { error } = await c.from("worker_rate_history").insert({
    worker_id: workerId,
    rate_type: "daily",
    daily_rate: Math.max(0, safeNumber(params.dailyRate)),
    effective_from: effectiveFrom,
    effective_to: null,
    notes: params.notes?.trim() || "Initial daily rate",
  });
  if (error && !isMissingRateHistorySchemaError(error)) {
    throw new Error(error.message ?? "Failed to create initial worker rate history.");
  }
}
