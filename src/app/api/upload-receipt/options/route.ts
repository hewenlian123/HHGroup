import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Public-friendly dropdown data (no auth). Workers + projects for receipt upload form.
 * Uses the service-role admin client so RLS does not block the options list.
 */
export async function GET() {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }
  try {
    const [workersRes, projectsRes] = await Promise.all([
      admin.from("workers").select("id, name").order("name"),
      admin.from("projects").select("id, name").order("name"),
    ]);
    if (workersRes.error) throw new Error(workersRes.error.message ?? "Failed to load workers");
    if (projectsRes.error) throw new Error(projectsRes.error.message ?? "Failed to load projects");

    const workers = (workersRes.data ?? []).map((w: { id: string; name: string | null }) => ({
      id: w.id,
      name: w.name ?? "",
    }));
    const projects = (projectsRes.data ?? []).map((p: { id: string; name: string | null }) => ({
      id: p.id,
      name: p.name ?? "",
    }));

    return NextResponse.json({ workers, projects });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load options";
    return NextResponse.json({ message }, { status: 500 });
  }
}
