import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { createRouteSupabaseClient } from "@/lib/supabase-server";
import { recordSecurityAudit } from "@/lib/security-audit";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  return json(200, {
    ok: true,
    current: {
      email: guard.context.email,
      role: guard.context.role,
      signedInAt: guard.context.user.last_sign_in_at ?? null,
    },
    limitation:
      "Supabase does not expose a complete, reliable device inventory here. You can revoke all sessions except this one.",
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, message: originCheck.message });
  }

  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as { scope?: unknown } | null;
  if (body?.scope !== "others") {
    return json(400, { ok: false, message: "Unsupported session action." });
  }

  const response = json(200, {
    ok: true,
    message: "Other sessions were signed out.",
  });
  const supabase = createRouteSupabaseClient(request, response, {
    persistent: true,
  });
  if (!supabase) {
    return json(503, { ok: false, message: "Session service is unavailable." });
  }
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    return json(503, { ok: false, message: "Unable to revoke other sessions." });
  }

  await recordSecurityAudit({
    eventType: "sessions_revoked",
    userId: guard.context.user.id,
  });

  return response;
}
