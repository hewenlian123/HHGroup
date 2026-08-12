import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
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

const VENDOR_FIELD_ORDER = [
  "id",
  "created_at",
  "updated_at",
  "name",
  "contact_name",
  "phone",
  "email",
  "address",
  "notes",
  "status",
] as const;

const FALLBACK_VENDOR_COLUMNS = new Set(["id", "created_at", "name", "phone", "email", "address"]);

type VendorStatus = "active" | "inactive";

type VendorRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: VendorStatus;
};

type VendorResponseRow = VendorRow & {
  used?: number;
  disabled?: boolean;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function logVendorError(action: string, error: unknown) {
  console.error(
    `[api/vendors] ${action} failed`,
    safeErrorMessage(error, "Vendor request failed.")
  );
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function vendorStatus(value: unknown): VendorStatus {
  return value === "inactive" ? "inactive" : "active";
}

function mapVendorRow(row: Partial<VendorRow> & { id: string; name: string }): VendorRow {
  return {
    id: row.id,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    name: row.name,
    contact_name: row.contact_name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
    status: vendorStatus(row.status),
  };
}

function vendorSelect(columns: Set<string>): string {
  return VENDOR_FIELD_ORDER.filter((field) => columns.has(field)).join(",");
}

async function getVendorColumns(supabase: ReturnType<typeof getServerSupabaseInternalNoStore>) {
  if (!supabase) return FALLBACK_VENDOR_COLUMNS;
  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "vendors");
  if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_VENDOR_COLUMNS;
  return new Set(
    data
      .map((row) =>
        typeof row.column_name === "string" && row.column_name.trim() ? row.column_name : null
      )
      .filter((column): column is string => Boolean(column))
  );
}

function filterPayloadForColumns(
  payload: Record<string, string | null>,
  columns: Set<string>
): Record<string, string | null> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)));
}

function buildVendorPayload(body: Record<string, unknown>) {
  const name = stringOrNull(body.name);
  if (!name) return null;
  return {
    name,
    contact_name: stringOrNull(body.contact_name),
    phone: stringOrNull(body.phone),
    email: stringOrNull(body.email),
    address: stringOrNull(body.address),
    notes: stringOrNull(body.notes),
    status: vendorStatus(body.status),
  };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const url = new URL(request.url);
  const includeDisabled = url.searchParams.get("includeDisabled") === "1";
  const withUsage = url.searchParams.get("withUsage") === "1";

  try {
    const columns = await getVendorColumns(supabase);
    let query = supabase.from("vendors").select(vendorSelect(columns));
    if (!includeDisabled && columns.has("status")) query = query.neq("status", "inactive");
    const { data, error } = await query.order(columns.has("created_at") ? "created_at" : "name", {
      ascending: false,
    });
    if (error) throw error;

    const rows = ((data ?? []) as unknown as VendorRow[]).map(mapVendorRow);
    let responseRows: VendorResponseRow[] = rows;

    if (withUsage && rows.length > 0) {
      const usageRows = await Promise.all(
        rows.map(async (row) => {
          const { count, error: countError } = await supabase
            .from("expenses")
            .select("id", { count: "exact", head: true })
            .ilike("vendor_name", row.name);
          if (countError) {
            logVendorError("usage-count", countError);
            return { ...row, used: 0, disabled: row.status === "inactive" };
          }
          return { ...row, used: count ?? 0, disabled: row.status === "inactive" };
        })
      );
      responseRows = usageRows;
    }

    return NextResponse.json({ ok: true, vendors: responseRows }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    logVendorError("load", error);
    return apiError(500, "Failed to load vendors.");
  }
}

export async function POST(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid vendor payload.");

  const payload = buildVendorPayload(body);
  if (!payload) return apiError(400, "Vendor name is required.");

  try {
    const columns = await getVendorColumns(supabase);
    const select = vendorSelect(columns);
    const writablePayload = filterPayloadForColumns(payload, columns);

    const { data: existingRows, error: existingError } = await supabase
      .from("vendors")
      .select(select)
      .ilike("name", payload.name)
      .limit(1);
    if (existingError) throw existingError;

    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing) {
      const row = mapVendorRow(existing as unknown as VendorRow);
      if (columns.has("status") && row.status === "inactive" && payload.status === "active") {
        const { data: activated, error: activateError } = await supabase
          .from("vendors")
          .update({ status: "active" })
          .eq("id", row.id)
          .select(select)
          .maybeSingle();
        if (activateError) throw activateError;
        if (!activated) return apiError(404, "Vendor not found.");
        return NextResponse.json(
          { ok: true, vendor: mapVendorRow(activated as unknown as VendorRow) },
          { headers: NO_CACHE_HEADERS }
        );
      }
      return NextResponse.json({ ok: true, vendor: row }, { headers: NO_CACHE_HEADERS });
    }

    const { data, error } = await supabase
      .from("vendors")
      .insert(writablePayload)
      .select(select)
      .single();
    if (error) throw error;
    if (!data) return apiError(500, "Failed to save vendor.");

    return NextResponse.json(
      { ok: true, vendor: mapVendorRow(data as unknown as VendorRow) },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logVendorError("create", error);
    return apiError(500, "Failed to save vendor.");
  }
}
