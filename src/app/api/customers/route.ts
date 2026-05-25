import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { CUSTOMERS_DB_COLUMNS } from "@/lib/customers-columns";
import { normalizePhoneForSave } from "@/lib/us-phone-format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: NO_CACHE_HEADERS });
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMERS_DB_COLUMNS)
    .order("name", { ascending: true });
  if (error) {
    console.error("[customers] load failed", error);
    return apiError(500, "Failed to load customers.");
  }
  return NextResponse.json({ customers: data ?? [] }, { headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  let body: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    contact_person?: string | null;
    company_name?: string | null;
    notes?: string | null;
    status?: "active" | "inactive" | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError(400, "Invalid customer payload.");
  }
  const name = body.name?.trim();
  if (!name) {
    return apiError(400, "Name is required.");
  }
  const payload = {
    name,
    email: body.email?.trim() || null,
    phone:
      body.phone != null && String(body.phone).trim()
        ? normalizePhoneForSave(String(body.phone))
        : null,
    address: body.address?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    zip: body.zip?.trim() || null,
    contact_person: body.contact_person?.trim() || null,
    company_name: body.company_name?.trim() || null,
    notes: body.notes?.trim() || null,
    ...(body.status === "active" || body.status === "inactive" ? { status: body.status } : {}),
  };
  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select(CUSTOMERS_DB_COLUMNS)
    .single();
  if (error) {
    console.error("[customers] create failed", error);
    return apiError(500, "Failed to create customer.");
  }
  return NextResponse.json(data, { status: 201, headers: NO_CACHE_HEADERS });
}
