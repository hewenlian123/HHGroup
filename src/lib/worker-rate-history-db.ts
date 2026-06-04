import type { SupabaseClient } from "@supabase/supabase-js";
import { laborEntryPaymentIdMapFromWorkerPayments } from "@/lib/labor-balance-shared";
import { normalizeWorkerRateDate } from "@/lib/worker-rate-date";

export { normalizeWorkerRateDate } from "@/lib/worker-rate-date";

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

export type WorkerRateUnpaidApplySummary = {
  rateHistoryId: string;
  dailyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  affectedCount: number;
  skippedCount: number;
  oldTotal: number;
  newTotal: number;
  difference: number;
};

export type WorkerRateChangeMode = "until_next_rate" | "replace_future_rates";

type LaborRateApplyCandidate = {
  id: string;
  daysWorked: number;
  oldAmount: number;
  newAmount: number;
  notes: string | null;
};

type LaborRateApplyCandidateResult = {
  candidates: LaborRateApplyCandidate[];
  skippedCount: number;
};

type LaborRateApplyRow = {
  id?: unknown;
  work_date?: unknown;
  hours?: unknown;
  morning?: unknown;
  afternoon?: unknown;
  days_worked?: unknown;
  daily_rate_snapshot?: unknown;
  amount_snapshot?: unknown;
  labor_cost_snapshot?: unknown;
  cost_amount?: unknown;
  status?: unknown;
  worker_payment_id?: unknown;
  rate_history_id?: unknown;
  notes?: unknown;
};

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeDate(value: string): string {
  return normalizeWorkerRateDate(value);
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

function amountSnapshotForRateApply(row: LaborRateApplyRow): number {
  const laborCost = row.labor_cost_snapshot;
  if (laborCost != null && safeNumber(laborCost) !== 0) return safeNumber(laborCost);
  const amount = row.amount_snapshot;
  if (amount != null && safeNumber(amount) !== 0) return safeNumber(amount);
  return safeNumber(row.cost_amount);
}

function daysWorkedForRateApply(row: LaborRateApplyRow): number | null {
  const savedDays = safeNumber(row.days_worked);
  if (savedDays > 0 && savedDays <= 1) return savedDays;
  const morning = row.morning === true;
  const afternoon = row.afternoon === true;
  if (morning || afternoon) return (morning ? 0.5 : 0) + (afternoon ? 0.5 : 0);
  const hours = safeNumber(row.hours);
  if (hours > 0 && hours <= 1) return hours;
  return null;
}

function isClosedForRateApply(row: LaborRateApplyRow, legacyPaymentId: string | null): boolean {
  if (String(row.worker_payment_id ?? "").trim() || legacyPaymentId) return true;
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (!status) return false;
  return [
    "paid",
    "settled",
    "locked",
    "final",
    "finalized",
    "statement",
    "statemented",
    "invoiced",
    "void",
    "voided",
    "cancelled",
    "canceled",
    "deleted",
  ].includes(status);
}

function buildRateApplyNote(existing: string | null, dailyRate: number, effectiveFrom: string) {
  const note = `Rate snapshot updated to ${fmtRateForNote(dailyRate)}/day from ${effectiveFrom}.`;
  const current = String(existing ?? "").trim();
  if (!current) return note;
  if (current.includes(note)) return current;
  return `${current}\n${note}`;
}

function fmtRateForNote(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(safeNumber(rate));
}

function summarizeRateApplyCandidates(
  history: WorkerRateHistory,
  candidates: LaborRateApplyCandidate[],
  skippedCount = 0
): WorkerRateUnpaidApplySummary {
  const oldTotal = roundMoney(candidates.reduce((sum, row) => sum + row.oldAmount, 0));
  const newTotal = roundMoney(candidates.reduce((sum, row) => sum + row.newAmount, 0));
  return {
    rateHistoryId: history.id,
    dailyRate: history.dailyRate,
    effectiveFrom: history.effectiveFrom,
    effectiveTo: history.effectiveTo,
    affectedCount: candidates.length,
    skippedCount,
    oldTotal,
    newTotal,
    difference: roundMoney(newTotal - oldTotal),
  };
}

async function getRateHistoryRowForApply(
  c: SupabaseClient,
  workerId: string,
  rateHistoryId: string
): Promise<WorkerRateHistory> {
  const { data, error } = await c
    .from("worker_rate_history")
    .select(
      "id, worker_id, rate_type, daily_rate, effective_from, effective_to, notes, created_at, updated_at"
    )
    .eq("id", rateHistoryId)
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load worker daily rate history.");
  if (!data) throw new Error("Worker daily rate history not found.");
  return mapHistoryRow(data as Record<string, unknown>);
}

async function loadWorkerPaymentLinksForRateApply(
  c: SupabaseClient,
  workerId: string
): Promise<Map<string, string>> {
  const { data, error } = await c
    .from("worker_payments")
    .select("id, labor_entry_ids")
    .eq("worker_id", workerId);
  if (error) {
    if (/column|schema cache|labor_entry_ids/i.test(error.message ?? "")) return new Map();
    throw new Error(error.message ?? "Failed to load worker payment links.");
  }
  return laborEntryPaymentIdMapFromWorkerPayments(
    (data ?? []) as Array<{ id?: unknown; labor_entry_ids?: unknown }>
  );
}

async function loadRateApplyCandidatesWithClient(
  c: SupabaseClient,
  workerId: string,
  history: WorkerRateHistory
): Promise<LaborRateApplyCandidateResult> {
  let query = c
    .from("labor_entries")
    .select(
      "id, worker_id, work_date, hours, morning, afternoon, days_worked, daily_rate_snapshot, amount_snapshot, labor_cost_snapshot, cost_amount, status, worker_payment_id, rate_history_id, notes"
    )
    .eq("worker_id", workerId)
    .gte("work_date", history.effectiveFrom);
  if (history.effectiveTo) query = query.lte("work_date", history.effectiveTo);
  query = query.order("work_date", { ascending: true });

  const [{ data, error }, paymentLinks] = await Promise.all([
    query,
    loadWorkerPaymentLinksForRateApply(c, workerId),
  ]);
  if (error) throw new Error(error.message ?? "Failed to load unpaid labor entries.");

  const candidates: LaborRateApplyCandidate[] = [];
  let skippedCount = 0;
  for (const row of (data ?? []) as LaborRateApplyRow[]) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    if (isClosedForRateApply(row, paymentLinks.get(id) ?? null)) {
      skippedCount += 1;
      continue;
    }
    const daysWorked = daysWorkedForRateApply(row);
    if (daysWorked == null || daysWorked <= 0) continue;
    const oldAmount = roundMoney(amountSnapshotForRateApply(row));
    const newAmount = roundMoney(history.dailyRate * daysWorked);
    candidates.push({
      id,
      daysWorked,
      oldAmount,
      newAmount,
      notes: typeof row.notes === "string" ? row.notes : null,
    });
  }
  return { candidates, skippedCount };
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
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
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
    .order("id", { ascending: false })
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
  input: {
    dailyRate: unknown;
    effectiveFrom: string;
    notes?: string | null;
    replaceFutureRates?: boolean;
  }
): Promise<WorkerRateHistory> {
  const dailyRate = safeNumber(input.dailyRate);
  if (!Number.isFinite(dailyRate) || dailyRate < 0) {
    throw new Error("Daily rate must be a valid non-negative number.");
  }
  const effectiveFrom = normalizeDate(input.effectiveFrom);
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const replaceFutureRates = input.replaceFutureRates !== false;
  const closeTo = previousDate(effectiveFrom);

  const { data: worker, error: workerErr } = await c
    .from("workers")
    .select("id")
    .eq("id", workerId)
    .maybeSingle();
  if (workerErr) throw new Error(workerErr.message ?? "Failed to load worker.");
  if (!worker) throw new Error("Worker not found.");

  let effectiveTo: string | null = null;
  if (!replaceFutureRates) {
    const nextRes = await c
      .from("worker_rate_history")
      .select("effective_from")
      .eq("worker_id", workerId)
      .eq("rate_type", "daily")
      .gt("effective_from", effectiveFrom)
      .order("effective_from", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextRes.error && !isMissingRateHistorySchemaError(nextRes.error)) {
      throw new Error(nextRes.error.message ?? "Failed to load next rate history.");
    }
    const nextEffectiveFrom = (nextRes.data as { effective_from?: string | null } | null)
      ?.effective_from;
    effectiveTo = nextEffectiveFrom ? previousDate(String(nextEffectiveFrom)) : null;
  }

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

  if (replaceFutureRates) {
    const futureRates = await c
      .from("worker_rate_history")
      .delete()
      .eq("worker_id", workerId)
      .eq("rate_type", "daily")
      .gt("effective_from", effectiveFrom);
    if (futureRates.error && !isMissingRateHistorySchemaError(futureRates.error)) {
      throw new Error(futureRates.error.message ?? "Failed to replace future daily rates.");
    }
  }

  const { data: sameDate } = await c
    .from("worker_rate_history")
    .select("id")
    .eq("worker_id", workerId)
    .eq("rate_type", "daily")
    .eq("effective_from", effectiveFrom)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
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

export async function previewWorkerRateUnpaidLaborApplyWithClient(
  c: SupabaseClient,
  workerId: string,
  rateHistoryId: string
): Promise<WorkerRateUnpaidApplySummary> {
  const history = await getRateHistoryRowForApply(c, workerId, rateHistoryId);
  const { candidates, skippedCount } = await loadRateApplyCandidatesWithClient(
    c,
    workerId,
    history
  );
  return summarizeRateApplyCandidates(history, candidates, skippedCount);
}

export async function applyWorkerRateToUnpaidLaborEntriesWithClient(
  c: SupabaseClient,
  workerId: string,
  rateHistoryId: string
): Promise<WorkerRateUnpaidApplySummary> {
  const history = await getRateHistoryRowForApply(c, workerId, rateHistoryId);
  const { candidates, skippedCount } = await loadRateApplyCandidatesWithClient(
    c,
    workerId,
    history
  );
  const applied: LaborRateApplyCandidate[] = [];

  for (const candidate of candidates) {
    const { data, error } = await c
      .from("labor_entries")
      .update({
        daily_rate_snapshot: history.dailyRate,
        amount_snapshot: candidate.newAmount,
        labor_cost_snapshot: candidate.newAmount,
        cost_amount: candidate.newAmount,
        rate_history_id: history.id,
        notes: buildRateApplyNote(candidate.notes, history.dailyRate, history.effectiveFrom),
      })
      .eq("id", candidate.id)
      .eq("worker_id", workerId)
      .is("worker_payment_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to update unpaid labor entry snapshots.");
    if (data) applied.push(candidate);
  }

  return summarizeRateApplyCandidates(history, applied, skippedCount);
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
