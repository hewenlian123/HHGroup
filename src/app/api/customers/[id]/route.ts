import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
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

type RelatedProject = {
  id: string;
  name: string | null;
  status: string | null;
  client: string | null;
  customer_id: string | null;
};

type RelatedEstimate = {
  id: string;
  number: string | null;
  client: string | null;
  project: string | null;
  status: string | null;
};

type RelatedChangeOrder = {
  id: string;
  project_id: string;
  number: string | null;
  title?: string | null;
  status: string | null;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: NO_CACHE_HEADERS });
}

const isMissingColumn = (message: string | undefined | null): boolean =>
  /column.*does not exist|does not exist.*column|undefined column|could not find the.*column|schema cache.*column/i.test(
    message ?? ""
  );

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMERS_DB_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[customers/:id] load failed", error);
    return apiError(500, "Failed to load customer.");
  }
  if (!data) {
    return apiError(404, "Customer not found.");
  }
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);

  const customerName = String((data as { name?: string | null }).name ?? "").trim();
  const projectRows = new Map<string, RelatedProject>();
  const appendProjects = (rows: RelatedProject[] | null | undefined) => {
    for (const project of rows ?? []) {
      if (project.id) projectRows.set(project.id, project);
    }
  };
  const byCustomerId = await supabase
    .from("projects")
    .select("id,name,status,client,customer_id")
    .eq("customer_id", id);
  if (!byCustomerId.error) appendProjects(byCustomerId.data as RelatedProject[]);
  if (customerName) {
    const byClient = await supabase
      .from("projects")
      .select("id,name,status,client,customer_id")
      .eq("client", customerName);
    if (!byClient.error) appendProjects(byClient.data as RelatedProject[]);
  }

  let estimates: RelatedEstimate[] = [];
  if (customerName) {
    const estimatesRes = await supabase
      .from("estimates")
      .select("id,number,client,project,status")
      .eq("client", customerName)
      .order("updated_at", { ascending: false });
    if (!estimatesRes.error) estimates = (estimatesRes.data ?? []) as RelatedEstimate[];
  }

  let changeOrders: RelatedChangeOrder[] = [];
  const projectIds = Array.from(projectRows.keys());
  if (projectIds.length > 0) {
    const changeOrdersRes = await supabase
      .from("project_change_orders")
      .select("id,project_id,number,title,status")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });
    if (!changeOrdersRes.error) {
      changeOrders = (changeOrdersRes.data ?? []) as RelatedChangeOrder[];
    } else if (isMissingColumn(changeOrdersRes.error.message)) {
      const legacyChangeOrdersRes = await supabase
        .from("project_change_orders")
        .select("id,project_id,number,status")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false });
      if (!legacyChangeOrdersRes.error) {
        changeOrders = (legacyChangeOrdersRes.data ?? []) as RelatedChangeOrder[];
      }
    }
  }

  return NextResponse.json(
    {
      ...data,
      projects_count: count ?? 0,
      relatedWork: {
        projects: Array.from(projectRows.values()),
        estimates,
        changeOrders,
      },
    },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const raw = await request.text();
  if (!raw.trim()) {
    return apiError(400, "Request body is required.");
  }
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
    body = JSON.parse(raw) as typeof body;
  } catch {
    return apiError(400, "Invalid JSON body.");
  }
  const payload: Record<string, string | null> = {};
  if (body.name !== undefined) payload.name = body.name.trim();
  if (body.email !== undefined) payload.email = body.email?.trim() || null;
  if (body.phone !== undefined) {
    payload.phone =
      body.phone != null && String(body.phone).trim()
        ? normalizePhoneForSave(String(body.phone))
        : null;
  }
  if (body.address !== undefined) {
    payload.address = body.address?.trim() || null;
  }
  if (body.city !== undefined) payload.city = body.city?.trim() || null;
  if (body.state !== undefined) payload.state = body.state?.trim() || null;
  if (body.zip !== undefined) payload.zip = body.zip?.trim() || null;
  if (body.contact_person !== undefined) {
    payload.contact_person = body.contact_person?.trim() || null;
  }
  if (body.company_name !== undefined) {
    payload.company_name = body.company_name?.trim() || null;
  }
  if (body.notes !== undefined) payload.notes = body.notes?.trim() || null;
  if (body.status === "active" || body.status === "inactive") {
    payload.status = body.status;
  }

  const { data, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select(CUSTOMERS_DB_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[customers/:id] update failed", error);
    return apiError(500, "Failed to update customer.");
  }
  if (!data) return apiError(404, "Customer not found.");
  return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  if ((count ?? 0) > 0) {
    return apiError(
      400,
      "This customer has linked projects and cannot be deleted. Reassign or delete those projects first."
    );
  }

  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) {
    console.error("[customers/:id] delete failed", error);
    return apiError(500, "Failed to delete customer.");
  }
  if (!data || data.length === 0) return apiError(404, "Customer not found.");
  return new NextResponse(null, { status: 204 });
}
