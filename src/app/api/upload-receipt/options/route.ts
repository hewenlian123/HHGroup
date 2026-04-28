import { NextResponse } from "next/server";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Public-friendly dropdown data (no auth). Workers + projects for receipt upload form.
 * Prefers service role (RLS bypass); falls back to URL + anon so local dev works without
 * SUPABASE_SERVICE_ROLE_KEY (workers/projects allow anon select in this project's RLS).
 */
export async function GET() {
  const client = getServerSupabaseAdmin() ?? getServerSupabase();
  if (!client) {
    return NextResponse.json(
      {
        message:
          "Supabase not configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY; optional SUPABASE_SERVICE_ROLE_KEY for RLS bypass)",
      },
      { status: 503 }
    );
  }
  try {
    const [workersRes, projectsRes] = await Promise.all([
      client.from("workers").select("id, name").order("name"),
      client.from("projects").select("id, name").order("name"),
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
