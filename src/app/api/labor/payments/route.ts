import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";

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

function isMissingColumnError(error: unknown, columns: string[]): boolean {
  const message = ((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return (
    columns.some((column) => message.includes(column.toLowerCase())) ||
    message.includes("schema cache")
  );
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
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const startDate = searchParams.get("startDate")?.slice(0, 10) ?? today;
  const endDate = searchParams.get("endDate")?.slice(0, 10) ?? today;
  const projectId = searchParams.get("projectId")?.trim() ?? "";

  try {
    const entriesPromise = async () => {
      const initial = await supabase
        .from("labor_entries")
        .select(
          "id,entry_date,worker_id,total,am_worked,am_project_id,pm_worked,pm_project_id,ot_amount,ot_project_id"
        )
        .eq("status", "confirmed")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .limit(2000);
      if (
        initial.error &&
        /column .*entry_date|column .*total|schema cache/i.test(initial.error.message ?? "")
      ) {
        return supabase
          .from("labor_entries")
          .select("id,work_date,worker_id,cost_amount,hours,project_id")
          .gte("work_date", startDate)
          .lte("work_date", endDate)
          .limit(2000);
      }
      return initial;
    };
    const paymentsPromise = async () => {
      const initial = await supabase
        .from("labor_payments")
        .select("id,worker_id,payment_date,amount,method,memo,applied_start_date,applied_end_date")
        .or(
          `and(applied_start_date.eq.${startDate},applied_end_date.eq.${endDate}),and(payment_date.gte.${startDate},payment_date.lte.${endDate})`
        )
        .limit(2000);
      if (
        initial.error &&
        /column .*memo|column .*applied_start_date|column .*applied_end_date|schema cache/i.test(
          initial.error.message ?? ""
        )
      ) {
        return supabase
          .from("labor_payments")
          .select("id,worker_id,payment_date,amount,method")
          .gte("payment_date", startDate)
          .lte("payment_date", endDate)
          .limit(2000);
      }
      return initial;
    };

    const [workersRes, entriesRes, paymentsRes, projectsRes, methodsRes] = await Promise.all([
      supabase
        .from("workers")
        .select("id,name,half_day_rate")
        .order("created_at", { ascending: false })
        .limit(500),
      entriesPromise(),
      paymentsPromise(),
      supabase
        .from("projects")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("payment_methods")
        .select("name,status")
        .eq("status", "active")
        .order("name")
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
      work_date?: string;
      worker_id: string;
      total?: number | null;
      cost_amount?: number | null;
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
      memo: string | null;
      applied_start_date: string | null;
      applied_end_date: string | null;
    }>;

    const entryDate = (entry: { entry_date?: string; work_date?: string }) =>
      (entry.entry_date ?? entry.work_date ?? "").slice(0, 10);
    const inRange = (d: string) => d >= startDate && d <= endDate;
    const rows = workers.map((worker) => {
      const workerEntries = entries.filter(
        (entry) => entry.worker_id === worker.id && inRange(entryDate(entry))
      );
      const rate = safeNumber(worker.half_day_rate);
      let confirmedTotal: number;
      if (projectId) {
        confirmedTotal = workerEntries.reduce((sum, entry) => {
          const fallbackTotal = entry.project_id === projectId ? safeNumber(entry.cost_amount) : 0;
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
          (sum, entry) => sum + safeNumber(entry.total ?? entry.cost_amount),
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
          memo: payment.memo ?? undefined,
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
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiError(400, "Invalid JSON body.");
    const workerId = typeof body.workerId === "string" ? body.workerId.trim() : "";
    const amount = safeNumber(body.amount);
    const method = typeof body.method === "string" ? body.method.trim() : "";
    const today = new Date().toISOString().slice(0, 10);
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
      memo: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null,
      applied_start_date: startDate,
      applied_end_date: endDate,
    };
    let { error } = await supabase.from("labor_payments").insert(paymentPayload);
    if (error && isMissingColumnError(error, ["memo", "applied_start_date", "applied_end_date"])) {
      const fallbackPayload = {
        worker_id: workerId,
        payment_date: paymentDate,
        amount,
        method,
      };
      const fallback = await supabase.from("labor_payments").insert(fallbackPayload);
      error = fallback.error;
    }
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record labor payment.";
    return apiError(500, message);
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
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
