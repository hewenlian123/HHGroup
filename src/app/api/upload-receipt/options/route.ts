import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public dropdown data is constrained by the anon RLS policies to active id/name values.
 */
export async function GET() {
  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json(
      {
        message:
          "Supabase not configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)",
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
