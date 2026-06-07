import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  AP_BILL_STATUSES,
  AP_BILL_TYPES,
  createApBill,
  getApBills,
  getApBillsSummary,
  type ApBillsFilters,
  type ApBillStatus,
  type ApBillType,
} from "@/lib/ap-bills-db";
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

const AP_UNAVAILABLE_MESSAGE = "Bills/AP module is not configured in this environment.";

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function logBillsError(action: string, error: unknown) {
  console.error(`[api/bills] ${action} failed`, safeErrorMessage(error, "Bills request failed."));
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

async function apBillsAvailable(supabase: ReturnType<typeof getServerSupabaseInternalNoStore>) {
  if (!supabase) return false;
  const { error } = await supabase.from("ap_bills").select("id", { head: true }).limit(0);
  if (!error) return true;
  if (isMissingTableError(error)) return false;
  throw error;
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

function billStatus(value: string | null): ApBillStatus | undefined {
  return value && (AP_BILL_STATUSES as readonly string[]).includes(value)
    ? (value as ApBillStatus)
    : undefined;
}

function billType(value: string | null): ApBillType | undefined {
  return value && (AP_BILL_TYPES as readonly string[]).includes(value)
    ? (value as ApBillType)
    : undefined;
}

function filtersFromUrl(url: URL): ApBillsFilters {
  return {
    search: url.searchParams.get("search") ?? undefined,
    status: billStatus(url.searchParams.get("status")),
    bill_type: billType(url.searchParams.get("bill_type")),
    project_id: url.searchParams.get("project_id") ?? undefined,
    date_from: url.searchParams.get("date_from") ?? undefined,
    date_to: url.searchParams.get("date_to") ?? undefined,
    overdue_only:
      url.searchParams.get("overdue_only") === "1" ||
      url.searchParams.get("overdue_only") === "true",
    include_void:
      url.searchParams.get("show_void_bills") === "1" ||
      url.searchParams.get("show_void_bills") === "true",
  };
}

async function getProjectOptions(supabase: ReturnType<typeof getServerSupabaseInternalNoStore>) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("id,name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      name: typeof row.name === "string" ? row.name : "",
    }))
    .filter((row) => row.id && row.name);
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const url = new URL(request.url);
  const includeProjects = url.searchParams.get("includeProjects") === "1";

  try {
    const available = await apBillsAvailable(supabase);
    if (!available) {
      return NextResponse.json(
        {
          ok: true,
          available: false,
          message: AP_UNAVAILABLE_MESSAGE,
          bills: [],
          summary: {
            totalOutstanding: 0,
            overdueCount: 0,
            overdueAmount: 0,
            dueThisWeekCount: 0,
            dueThisWeekAmount: 0,
            paidThisMonthAmount: 0,
          },
          projects: [],
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    const [bills, summary, projects] = await Promise.all([
      getApBills(filtersFromUrl(url), supabase),
      getApBillsSummary(supabase),
      includeProjects ? getProjectOptions(supabase) : Promise.resolve([]),
    ]);

    return NextResponse.json(
      { ok: true, available: true, bills, summary, projects },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logBillsError("load", error);
    return apiError(500, "Failed to load bills.");
  }
}

export async function POST(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid bill payload.");

  const vendorName = stringOrNull(body.vendor_name);
  const amount = numberOrNull(body.amount);
  if (!vendorName) return apiError(400, "Vendor / payee name is required.");
  if (amount == null || amount <= 0) return apiError(400, "Amount must be greater than 0.");

  try {
    if (!(await apBillsAvailable(supabase))) return apiError(503, AP_UNAVAILABLE_MESSAGE);
    const bill = await createApBill(
      {
        bill_no: stringOrNull(body.bill_no),
        vendor_name: vendorName,
        bill_type: billType(stringOrNull(body.bill_type)) ?? "Vendor",
        project_id: stringOrNull(body.project_id),
        issue_date: stringOrNull(body.issue_date),
        due_date: stringOrNull(body.due_date),
        amount,
        category: stringOrNull(body.category),
        notes: stringOrNull(body.notes),
        subcontractor_id: stringOrNull(body.subcontractor_id),
        subcontract_id: stringOrNull(body.subcontract_id),
      },
      supabase
    );
    return NextResponse.json({ ok: true, bill }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    logBillsError("create", error);
    return apiError(500, "Failed to create bill.");
  }
}
