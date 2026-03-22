import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  const { data, error } = await admin
    .from("customers")
    .select("id,name,email,phone,address,city,state,zip,notes,created_at")
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
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    notes?: string | null;
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
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    zip: body.zip?.trim() || null,
    notes: body.notes?.trim() || null,
  };
  const { data, error } = await admin
    .from("customers")
    .insert(payload)
    .select("id,name,email,phone,address,city,state,zip,notes,created_at")
    .single();
  if (error) {
    return NextResponse.json(
      { message: error.message ?? "Failed to create customer." },
      { status: 500 }
    );
  }
  return NextResponse.json(data, { status: 201 });
}
