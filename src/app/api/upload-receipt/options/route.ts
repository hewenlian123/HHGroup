import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { requireCompanyRequestClient } from "@/lib/auth-boundary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Business dropdowns require an authenticated organization membership. */
export async function GET(request: Request) {
  const guard = await requireCompanyRequestClient(request);
  if (!guard.ok) return guard.response;
  const client = guard.client;
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

    const response = withSessionCookies(
      NextResponse.json({ workers, projects }),
      guard.sessionResponse
    );

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load options";
    return withSessionCookies(
      NextResponse.json({ message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
