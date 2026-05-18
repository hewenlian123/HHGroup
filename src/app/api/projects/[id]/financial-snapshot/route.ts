import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getProjectFinancialSnapshotComparison } from "@/lib/financial/project-financial-snapshot-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const projectId = id?.trim();
  if (!projectId) return jsonError(400, "Missing project id.");

  try {
    const comparison = await getProjectFinancialSnapshotComparison(projectId);
    return NextResponse.json({ ok: true, comparison }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load project financial snapshot.";
    if (message === "Project not found.") {
      return jsonError(200, message);
    }
    return jsonError(500, message);
  }
}
