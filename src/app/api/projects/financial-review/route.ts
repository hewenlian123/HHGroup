import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { getProjectFinancialReview } from "@/lib/financial/project-financial-review-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

export async function GET(request: Request) {
  const guard = await requireOrganizationRequestClient(request, {
    noStore: true,
    requireOwnerAdmin: true,
  });
  if (!guard.ok) return guard.response;

  try {
    const payload = await getProjectFinancialReview(
      guard.client,
      guard.context.memberships.map((m) => m.organization_id)
    );
    return withSessionCookies(
      NextResponse.json({ ok: true, ...payload }, { headers: NO_CACHE_HEADERS }),
      guard.sessionResponse
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load project financial review.";
    return withSessionCookies(jsonError(500, message), guard.sessionResponse);
  }
}
