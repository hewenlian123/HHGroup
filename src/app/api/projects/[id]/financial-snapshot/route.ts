import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import {
  getProjectFinancialSnapshot,
  getProjectFinancialSnapshotComparison,
} from "@/lib/financial/project-financial-snapshot-db";
import { attachServerTiming } from "@/lib/performance/server-timing";

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
  const handlerStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  const authDuration = performance.now() - authStartedAt;
  let serverDataDuration = 0;
  const finish = <T extends Response>(response: T) =>
    attachServerTiming(response, {
      hh_auth: authDuration,
      hh_server_data: serverDataDuration,
      hh_handler_total: performance.now() - handlerStartedAt,
    });
  if (!guard.ok) return finish(guard.response);

  const { id } = await ctx.params;
  const projectId = id?.trim();
  if (!projectId) return finish(jsonError(400, "Missing project id."));

  const serverDataStartedAt = performance.now();
  try {
    const debugFinancial = new URL(request.url).searchParams.get("debugFinancial") === "1";
    if (debugFinancial) {
      const comparison = await getProjectFinancialSnapshotComparison(projectId, guard.client);
      serverDataDuration = performance.now() - serverDataStartedAt;
      return finish(NextResponse.json({ ok: true, comparison }, { headers: NO_CACHE_HEADERS }));
    } else {
      const newSnapshot = await getProjectFinancialSnapshot(projectId, guard.client);
      serverDataDuration = performance.now() - serverDataStartedAt;
      return finish(
        NextResponse.json(
          {
            ok: true,
            comparison: {
              projectId,
              oldCanonicalProfit: null,
              oldProjectCostDashboard: null,
              newSnapshot,
              differences: [],
              warnings: newSnapshot.warnings,
              diagnostics: newSnapshot.diagnostics,
            },
          },
          { headers: NO_CACHE_HEADERS }
        )
      );
    }
  } catch (error) {
    serverDataDuration = performance.now() - serverDataStartedAt;
    const message =
      error instanceof Error ? error.message : "Failed to load project financial snapshot.";
    if (message === "Project not found.") {
      return finish(jsonError(404, message));
    }
    console.error("[project-financial-snapshot] required data load failed", error);
    return finish(jsonError(503, "Project financial data is temporarily unavailable."));
  }
}
