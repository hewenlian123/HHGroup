import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { CUSTOMERS_DB_COLUMNS } from "@/lib/customers-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  const { data, error } = await admin
    .from("customers")
    .select(CUSTOMERS_DB_COLUMNS)
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json(
      { message: error.message ?? "Failed to load customers." },
      { status: 500 }
    );
  }
  return NextResponse.json({ customers: data ?? [] });
}

export async function POST(request: Request) {
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
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ message: "Name is required." }, { status: 400 });
  }
  const payload = {
    name,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    address: body.address?.trim() || null,
    contact_person: body.contact_person?.trim() || null,
    notes: body.notes?.trim() || null,
    ...(body.status === "active" || body.status === "inactive" ? { status: body.status } : {}),
  };
  const { data, error } = await admin
    .from("customers")
    .insert(payload)
    .select(CUSTOMERS_DB_COLUMNS)
    .single();
  if (error) {
    return NextResponse.json(
      { message: error.message ?? "Failed to create customer." },
      { status: 500 }
    );
  }
  return NextResponse.json(data, { status: 201 });
}
