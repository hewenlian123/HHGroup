import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
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

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function logVendorError(action: string, error: unknown) {
  console.error(
    `[api/vendors/:id] ${action} failed`,
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

function buildVendorPatch(body: Record<string, unknown>) {
  const patch: Record<string, string | null> = {};
  if ("name" in body) {
    const name = stringOrNull(body.name);
    if (!name) return null;
    patch.name = name;
  }
  for (const key of ["contact_name", "phone", "email", "address", "notes"] as const) {
    if (key in body) patch[key] = stringOrNull(body[key]);
  }
  if ("status" in body) patch.status = vendorStatus(body.status);
  return patch;
}

function filterPatchForColumns(
  patch: Record<string, string | null>,
  columns: Set<string>
): Record<string, string | null> {
  return Object.fromEntries(Object.entries(patch).filter(([key]) => columns.has(key)));
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const id = params.id?.trim();
  if (!id) return apiError(400, "Vendor id is required.");

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid vendor payload.");

  const patch = buildVendorPatch(body);
  if (!patch) return apiError(400, "Vendor name is required.");
  if (Object.keys(patch).length === 0) return apiError(400, "No vendor changes provided.");

  try {
    const columns = await getVendorColumns(supabase);
    const writablePatch = filterPatchForColumns(patch, columns);
    const select = vendorSelect(columns);
    const { data: existingBeforeUpdate, error: beforeUpdateError } = await supabase
      .from("vendors")
      .select(select)
      .eq("id", id)
      .maybeSingle();
    if (beforeUpdateError) throw beforeUpdateError;
    if (!existingBeforeUpdate) return apiError(404, "Vendor not found.");
    const existingVendor = mapVendorRow(existingBeforeUpdate as unknown as VendorRow);

    if (Object.keys(writablePatch).length === 0) {
      return NextResponse.json({ ok: true, vendor: existingVendor }, { headers: NO_CACHE_HEADERS });
    }

    const { data, error } = await supabase
      .from("vendors")
      .update(writablePatch)
      .eq("id", id)
      .select(select)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError(404, "Vendor not found.");
    const updatedVendor = mapVendorRow(data as unknown as VendorRow);

    if (writablePatch.name && writablePatch.name !== existingVendor.name) {
      const { error: expenseUpdateError } = await supabase
        .from("expenses")
        .update({ vendor_name: writablePatch.name })
        .ilike("vendor_name", existingVendor.name);
      if (expenseUpdateError) throw expenseUpdateError;
    }

    return NextResponse.json({ ok: true, vendor: updatedVendor }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    logVendorError("update", error);
    return apiError(500, "Failed to save vendor.");
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const id = params.id?.trim();
  if (!id) return apiError(400, "Vendor id is required.");

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const { data, error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError(404, "Vendor not found.");

    return NextResponse.json({ ok: true, id: data.id }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    logVendorError("delete", error);
    return apiError(500, "Failed to delete vendor.");
  }
}
