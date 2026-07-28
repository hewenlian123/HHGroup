import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    {
      ok: true,
      account: {
        email: guard.context.email,
        role: guard.context.role,
        status: "Active",
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
