import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { CUSTOMERS_DB_COLUMNS } from "@/lib/customers-columns";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  const { data, error } = await admin
    .from("customers")
    .select(CUSTOMERS_DB_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { message: error.message ?? "Failed to load customer." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 });
  }
  const { count } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  return NextResponse.json({
    ...data,
    projects_count: count ?? 0,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  const body = (await request.json()) as {
    name?: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    contact_person?: string | null;
    notes?: string | null;
    status?: "active" | "inactive" | null;
  };
  const payload: Record<string, string | null> = {};
  if (body.name !== undefined) payload.name = body.name.trim();
  if (body.email !== undefined) payload.email = body.email?.trim() || null;
  if (body.phone !== undefined) payload.phone = body.phone?.trim() || null;
  if (body.address !== undefined) {
    payload.address = body.address?.trim() || null;
  }
  if (body.contact_person !== undefined) {
    payload.contact_person = body.contact_person?.trim() || null;
  }
  if (body.notes !== undefined) payload.notes = body.notes?.trim() || null;
  if (body.status === "active" || body.status === "inactive") {
    payload.status = body.status;
  }

  const { data, error } = await admin
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select(CUSTOMERS_DB_COLUMNS)
    .single();
  if (error) {
    return NextResponse.json(
      { message: error.message ?? "Failed to update customer." },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }

  const { count } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        message:
          "This customer has linked projects and cannot be deleted. Reassign or delete those projects first.",
      },
      { status: 400 }
    );
  }

  const { error } = await admin.from("customers").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { message: error.message ?? "Failed to delete customer." },
      { status: 500 }
    );
  }
  return new NextResponse(null, { status: 204 });
}
