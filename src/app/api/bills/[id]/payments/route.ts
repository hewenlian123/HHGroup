import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { addApBillPayment, getApBillById } from "@/lib/ap-bills-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { safeErrorMessage } from "@/lib/system-response-safety";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function logBillsError(action: string, error: unknown) {
  console.error(
    `[api/bills/:id/payments] ${action} failed`,
    safeErrorMessage(error, "Bill payment request failed.")
  );
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = (error as { message?: string } | null)?.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /schema cache|relation.*does not exist|could not find.*(?:table|relation)/i.test(message)
  );
}

function safeFailureMessage(error: unknown, fallback: string): string {
  return isMissingTableError(error) ? "Bills/AP module is not configured." : fallback;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { id } = await ctx.params;
  if (!id?.trim()) return apiError(400, "Missing bill id.");

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid payment payload.");

  const amount = numberOrNull(body.amount);
  const paymentDate = stringOrNull(body.payment_date);
  if (amount == null || amount <= 0) return apiError(400, "Payment amount must be greater than 0.");
  if (!paymentDate) return apiError(400, "Payment date is required.");

  try {
    const bill = await getApBillById(id, supabase);
    if (!bill) return apiError(404, "Bill not found.");
    const payment = await addApBillPayment(
      id,
      {
        payment_date: paymentDate,
        amount,
        payment_method: stringOrNull(body.payment_method),
        reference_no: stringOrNull(body.reference_no),
        notes: stringOrNull(body.notes),
      },
      supabase
    );
    const updatedBill = await getApBillById(id, supabase);
    const billForRevalidation = updatedBill ?? bill;
    revalidatePath(`/bills/${id}`);
    revalidatePath("/bills");
    if (billForRevalidation.project_id) {
      revalidatePath(`/projects/${billForRevalidation.project_id}`);
      revalidatePath(`/projects/${billForRevalidation.project_id}/subcontracts`);
      if (billForRevalidation.subcontract_id) {
        revalidatePath(
          `/projects/${billForRevalidation.project_id}/subcontracts/${billForRevalidation.subcontract_id}`
        );
      }
    }
    if (billForRevalidation.subcontractor_id) {
      revalidatePath(`/subcontractors/${billForRevalidation.subcontractor_id}`);
      revalidatePath("/subcontractors");
    }
    return NextResponse.json(
      { ok: true, payment, bill: updatedBill ?? bill },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logBillsError("create", error);
    return apiError(500, safeFailureMessage(error, "Failed to add payment."));
  }
}
