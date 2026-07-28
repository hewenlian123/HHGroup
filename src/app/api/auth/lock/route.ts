import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { clearDeviceUnlockCookie } from "@/lib/device-unlock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { ok: false, message: originCheck.message },
      { status: originCheck.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const response = NextResponse.json(
    { ok: true, redirectTo: "/unlock" },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
  clearDeviceUnlockCookie(response);
  return response;
}
