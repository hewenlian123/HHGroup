import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return /schema cache|could not find the table|relation .* does not exist/i.test(e.message ?? "");
}

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function normalizeDate(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return fallback;
}

export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(request, getServerSupabaseInternal);
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const today = workerRateLocalYmd();
  const startDate = searchParams.get("startDate")?.slice(0, 10) ?? today;
  const endDate = searchParams.get("endDate")?.slice(0, 10) ?? today;
  const projectId = searchParams.get("projectId")?.trim() ?? "";

  try {
    const entriesPromise = supabase
      .from("labor_entries")
      .select(
        "id,work_date,worker_id,labor_cost_snapshot,amount_snapshot,cost_amount,hours,project_id"
      )
      .eq("status", "confirmed")
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .limit(2000);
    const paymentsPromise = supabase
      .from("labor_payments")
      .select("id,worker_id,payment_date,amount,method,note,applied_start_date,applied_end_date")
      .or(
        `and(applied_start_date.eq.${startDate},applied_end_date.eq.${endDate}),and(payment_date.gte.${startDate},payment_date.lte.${endDate})`
      )
      .limit(2000);

    const [workersRes, entriesRes, paymentsRes, projectsRes, methodsRes] = await Promise.all([
      supabase
        .from("workers")
        .select("id,name,half_day_rate")
        .order("created_at", { ascending: false })
        .limit(500),
      entriesPromise,
      paymentsPromise,
      supabase
        .from("projects")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("expense_options")
        .select("name,active")
        .eq("type", "payment_method")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(100),
    ]);

    if (workersRes.error && !isMissingTableError(workersRes.error))
      throw new Error(workersRes.error.message);
    if (entriesRes.error && !isMissingTableError(entriesRes.error))
      throw new Error(entriesRes.error.message);
    if (paymentsRes.error && !isMissingTableError(paymentsRes.error))
      throw new Error(paymentsRes.error.message);
    if (projectsRes.error && !isMissingTableError(projectsRes.error))
      throw new Error(projectsRes.error.message);
    if (methodsRes.error && !isMissingTableError(methodsRes.error))
      throw new Error(methodsRes.error.message);

    const workers = (workersRes.data ?? []) as Array<{
      id: string;
      name: string;
      half_day_rate?: number | null;
    }>;
    const entries = (entriesRes.data ?? []) as Array<{
      entry_date?: string;
      work_date: string;
      worker_id: string;
      total?: number | null;
      cost_amount?: number | null;
      amount_snapshot?: number | null;
      labor_cost_snapshot?: number | null;
      am_worked?: boolean;
      am_project_id?: string | null;
      pm_worked?: boolean;
      pm_project_id?: string | null;
      ot_amount?: number | null;
      ot_project_id?: string | null;
      project_id?: string | null;
    }>;
    const payments = (paymentsRes.data ?? []) as Array<{
      id: string;
      worker_id: string;
      payment_date: string;
      amount: number | null;
      method: string | null;
      note: string | null;
      applied_start_date: string | null;
      applied_end_date: string | null;
    }>;

    const inRange = (d: string) => d >= startDate && d <= endDate;
    const rows = workers.map((worker) => {
      const workerEntries = entries.filter(
        (entry) => entry.worker_id === worker.id && inRange(entry.work_date.slice(0, 10))
      );
      const rate = safeNumber(worker.half_day_rate);
      let confirmedTotal: number;
      if (projectId) {
        confirmedTotal = workerEntries.reduce((sum, entry) => {
          const fallbackTotal =
            entry.project_id === projectId
              ? safeNumber(entry.labor_cost_snapshot ?? entry.amount_snapshot ?? entry.cost_amount)
              : 0;
          const am = entry.am_worked && entry.am_project_id === projectId ? rate : 0;
          const pm = entry.pm_worked && entry.pm_project_id === projectId ? rate : 0;
          const ot = entry.ot_project_id === projectId ? safeNumber(entry.ot_amount) : 0;
          if (!entry.am_project_id && !entry.pm_project_id && !entry.ot_project_id) {
            return sum + fallbackTotal;
          }
          return sum + am + pm + ot;
        }, 0);
      } else {
        confirmedTotal = workerEntries.reduce(
          (sum, entry) =>
            sum +
            safeNumber(
              entry.total ?? entry.labor_cost_snapshot ?? entry.amount_snapshot ?? entry.cost_amount
            ),
          0
        );
      }
      const workerPayments = payments.filter(
        (payment) =>
          payment.worker_id === worker.id &&
          (inRange(payment.payment_date) ||
            (payment.applied_start_date === startDate && payment.applied_end_date === endDate))
      );
      const paidTotal = workerPayments.reduce(
        (sum, payment) => sum + safeNumber(payment.amount),
        0
      );
      const balance = Math.max(0, confirmedTotal - paidTotal);

      return {
        workerId: worker.id,
        workerName: worker.name ?? worker.id,
        confirmedDailyTotal: confirmedTotal,
        confirmedInvoiceTotal: 0,
        confirmedTotal,
        paidTotal,
        balance,
        payments: workerPayments.map((payment) => ({
          id: payment.id,
          paymentDate: payment.payment_date,
          amount: safeNumber(payment.amount),
          method: payment.method ?? "—",
          memo: payment.note ?? undefined,
        })),
      };
    });

    const paymentMethods = (methodsRes.data ?? [])
      .map((method) => (method as { name?: string }).name ?? "")
      .filter(Boolean);

    return NextResponse.json(
      {
        ok: true,
        rows,
        projects: (projectsRes.data ?? []) as Array<{ id: string; name: string }>,
        paymentMethods: paymentMethods.length ? paymentMethods : ["ACH"],
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load labor payments.";
    return apiError(500, message);
  }
}

export async function POST(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(request, getServerSupabaseInternal);
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiError(400, "Invalid JSON body.");
    const workerId = typeof body.workerId === "string" ? body.workerId.trim() : "";
    const amount = safeNumber(body.amount);
    const method = typeof body.method === "string" ? body.method.trim() : "";
    const today = workerRateLocalYmd();
    const paymentDate = normalizeDate(body.paymentDate, today);
    const startDate = normalizeDate(body.startDate, paymentDate);
    const endDate = normalizeDate(body.endDate, paymentDate);
    if (!workerId) return apiError(400, "Worker is required.");
    if (!method) return apiError(400, "Payment method is required.");
    if (amount <= 0) return apiError(400, "Amount must be greater than 0.");

    const paymentPayload = {
      worker_id: workerId,
      payment_date: paymentDate,
      amount,
      method,
      note: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null,
      applied_start_date: startDate,
      applied_end_date: endDate,
    };
    const { error } = await supabase.from("labor_payments").insert(paymentPayload);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record labor payment.";
    return apiError(500, message);
  }
}

export async function DELETE(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(request, getServerSupabaseInternal);
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) return apiError(400, "Payment id is required.");

  try {
    const { error } = await supabase.from("labor_payments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete labor payment.";
    return apiError(500, message);
  }
}
