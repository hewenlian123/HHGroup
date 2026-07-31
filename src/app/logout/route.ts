import { NextResponse, type NextRequest } from "next/server";

import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { clearPinSession } from "@/lib/pin-auth";
import { clearDeviceUnlockCookie, clearTrustedDeviceCookie } from "@/lib/device-unlock";
import { createRouteSupabaseClient } from "@/lib/supabase-server";
import { recordSecurityAudit } from "@/lib/security-audit";

export const dynamic = "force-dynamic";

function noStoreHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store, max-age=0" };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.redirect(new URL("/settings/security", request.url), {
    headers: noStoreHeaders(),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { ok: false, message: originCheck.message },
      { status: originCheck.status, headers: noStoreHeaders() }
    );
  }

  const requestUrl = new URL(request.url);
  const target = new URL("/login", requestUrl.origin);
  target.searchParams.set("message", "signed_out");

  const response = NextResponse.redirect(target, {
    status: 303,
    headers: noStoreHeaders(),
  });
  clearPinSession(response);
  clearDeviceUnlockCookie(response);
  clearTrustedDeviceCookie(response);

  const supabase = createRouteSupabaseClient(request, response);
  if (!supabase) return response;
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  if (user) {
    await recordSecurityAudit({ eventType: "logout", userId: user.id });
  }
  return response;
}
