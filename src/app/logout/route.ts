import { NextResponse, type NextRequest } from "next/server";

import { clearPinSession } from "@/lib/pin-auth";
import { clearDeviceUnlockCookie, clearTrustedDeviceCookie } from "@/lib/device-unlock";
import { createRouteSupabaseClient } from "@/lib/supabase-server";
import { recordSecurityAudit } from "@/lib/security-audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const target = new URL("/login", requestUrl.origin);
  target.searchParams.set("message", "signed_out");

  const response = NextResponse.redirect(target, {
    headers: { "Cache-Control": "no-store, max-age=0" },
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
