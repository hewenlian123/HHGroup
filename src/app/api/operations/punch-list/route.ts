import { NextResponse } from "next/server";
import { getPunchListAll, getPunchListSummary, getProjects, getWorkers } from "@/lib/data";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

function normStatus(s: string): string {
  return s === "in_progress" ? "assigned" : s === "resolved" ? "completed" : s;
}

export async function GET(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  const { client: supabase, sessionResponse } = guard;
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id")?.trim() || null;
  const statusFilter = url.searchParams.get("status")?.trim()?.toLowerCase() || null;
  try {
    const [allItems, summary, projects, workers] = await Promise.all([
      getPunchListAll(supabase),
      getPunchListSummary(supabase),
      getProjects(supabase),
      getWorkers(supabase),
    ]);
    let items = allItems;
    if (projectId) items = items.filter((i) => i.project_id === projectId);
    if (statusFilter && ["open", "assigned", "completed"].includes(statusFilter)) {
      items = items.filter((i) => normStatus(i.status) === statusFilter);
    }
    return withSessionCookies(
      NextResponse.json(
        { ok: true as const, items, summary, projects, workers },
        { headers: NO_CACHE_HEADERS }
      ),
      sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load punch list.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
