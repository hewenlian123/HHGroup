import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import {
  AP_BILL_STATUSES,
  AP_BILL_TYPES,
  PAID_BILL_LOCKED_MESSAGE,
  deleteApBillDraft,
  getApBillById,
  getApBillPayments,
  getApBillsSummary,
  setApBillPending,
  updateApBill,
  voidApBill,
  type ApBillStatus,
  type ApBillType,
} from "@/lib/ap-bills-db";
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

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

function logBillsError(action: string, error: unknown) {
  console.error(
    `[api/bills/:id] ${action} failed`,
    safeErrorMessage(error, "Bill request failed.")
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

function isBillValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === PAID_BILL_LOCKED_MESSAGE ||
      /Only Draft bills|Cannot delete a bill with payments/i.test(error.message))
  );
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function billStatus(value: unknown): ApBillStatus | undefined {
  return typeof value === "string" && (AP_BILL_STATUSES as readonly string[]).includes(value)
    ? (value as ApBillStatus)
    : undefined;
}

function billType(value: unknown): ApBillType | undefined {
  return typeof value === "string" && (AP_BILL_TYPES as readonly string[]).includes(value)
    ? (value as ApBillType)
    : undefined;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const { client: supabase, sessionResponse } = guard;

  const { id } = await ctx.params;
  if (!id?.trim()) return apiError(400, "Missing bill id.");

  try {
    const [bill, payments] = await Promise.all([
      getApBillById(id, supabase),
      getApBillPayments(id, supabase),
    ]);
    if (!bill) return apiError(404, "Bill not found.");
    return withSessionCookies(
      NextResponse.json({ ok: true, bill, payments }, { headers: NO_CACHE_HEADERS }),
      sessionResponse
    );
  } catch (error) {
    logBillsError("load", error);
    return apiError(500, safeFailureMessage(error, "Failed to load bill."));
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const { client: supabase, sessionResponse } = guard;

  const { id } = await ctx.params;
  if (!id?.trim()) return apiError(400, "Missing bill id.");

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid bill payload.");

  try {
    if (body.action === "void") {
      const ok = await voidApBill(id, supabase);
      if (!ok) return apiError(404, "Bill not found.");
      return withSessionCookies(
        NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS }),
        sessionResponse
      );
    }
    if (body.action === "approve") {
      const ok = await setApBillPending(id, supabase);
      if (!ok) {
        const bill = await getApBillById(id, supabase);
        if (!bill) return apiError(404, "Bill not found.");
        return apiError(400, "Only Draft bills can be approved.");
      }
      return withSessionCookies(
        NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS }),
        sessionResponse
      );
    }

    const amount = numberOrUndefined(body.amount);
    let vendorName: string | undefined;
    if (body.vendor_name !== undefined) {
      const candidate = stringOrNull(body.vendor_name);
      if (!candidate) return apiError(400, "Vendor / payee name is required.");
      vendorName = candidate;
    }
    if (body.amount !== undefined && (amount === undefined || amount <= 0)) {
      return apiError(400, "Amount must be greater than 0.");
    }
    const updated = await updateApBill(
      id,
      {
        bill_no: body.bill_no === undefined ? undefined : stringOrNull(body.bill_no),
        vendor_name: vendorName,
        bill_type: billType(body.bill_type),
        project_id: body.project_id === undefined ? undefined : stringOrNull(body.project_id),
        issue_date: body.issue_date === undefined ? undefined : stringOrNull(body.issue_date),
        due_date: body.due_date === undefined ? undefined : stringOrNull(body.due_date),
        amount,
        category: body.category === undefined ? undefined : stringOrNull(body.category),
        notes: body.notes === undefined ? undefined : stringOrNull(body.notes),
        attachment_url:
          body.attachment_url === undefined ? undefined : stringOrNull(body.attachment_url),
        subcontractor_id:
          body.subcontractor_id === undefined ? undefined : stringOrNull(body.subcontractor_id),
        subcontract_id:
          body.subcontract_id === undefined ? undefined : stringOrNull(body.subcontract_id),
        status: billStatus(body.status),
      },
      supabase
    );
    if (!updated) return apiError(404, "Bill not found.");
    return withSessionCookies(
      NextResponse.json({ ok: true, bill: updated }, { headers: NO_CACHE_HEADERS }),
      sessionResponse
    );
  } catch (error) {
    const validationError = isBillValidationError(error);
    if (!validationError) logBillsError("update", error);
    const status = validationError ? 400 : 500;
    const message =
      error instanceof Error && validationError
        ? error.message
        : safeFailureMessage(error, "Failed to update bill.");
    return apiError(status, message);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const { client: supabase, sessionResponse } = guard;

  const { id } = await ctx.params;
  if (!id?.trim()) return apiError(400, "Missing bill id.");

  try {
    const ok = await deleteApBillDraft(id, supabase);
    if (!ok) return apiError(404, "Bill not found.");
    const summary = await getApBillsSummary(supabase);
    return withSessionCookies(
      NextResponse.json({ ok: true, summary }, { headers: NO_CACHE_HEADERS }),
      sessionResponse
    );
  } catch (error) {
    logBillsError("delete", error);
    const message =
      error instanceof Error &&
      /Only Draft bills|Cannot delete a bill with payments/i.test(error.message)
        ? error.message
        : safeFailureMessage(error, "Failed to delete bill.");
    return apiError(400, message);
  }
}
