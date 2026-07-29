import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveTrustedAuthAppOrigin } from "@/lib/auth-app-origin";
import { createRecoverySessionToken, setRecoverySessionCookie } from "@/lib/auth-recovery-session";
import { authorizedAppRole } from "@/lib/auth-role";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { sessionIdFromAccessToken } from "@/lib/device-unlock-token";

type AuthCallbackKind = "login" | "recovery";

function invalidLinkRedirect(appOrigin: string, kind: AuthCallbackKind): NextResponse {
  const target = new URL(kind === "recovery" ? "/reset-password" : "/login", appOrigin);
  target.searchParams.set("error", "invalid_or_expired_link");
  return NextResponse.redirect(target, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function handleAuthCallback(
  request: NextRequest,
  kind: AuthCallbackKind
): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const trustedAppOrigin = resolveTrustedAuthAppOrigin(request);
  if (!trustedAppOrigin) {
    return NextResponse.json(
      { ok: false, message: "This authentication link cannot be validated." },
      {
        status: 400,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
  const appOrigin = trustedAppOrigin.origin;
  if (!trustedAppOrigin.requestMatches) {
    return invalidLinkRedirect(appOrigin, kind);
  }
  const code = requestUrl.searchParams.get("code");
  const providerError =
    requestUrl.searchParams.has("error_description") || requestUrl.searchParams.has("error");
  if (providerError || !code) {
    return invalidLinkRedirect(appOrigin, kind);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return invalidLinkRedirect(appOrigin, kind);
  }

  const requestedRedirect = normalizeAuthRedirect(
    requestUrl.searchParams.get("redirect") ?? requestUrl.searchParams.get("next")
  );
  const redirectTo =
    kind === "recovery"
      ? "/reset-password"
      : requestedRedirect === "/reset-password"
        ? "/dashboard"
        : requestedRedirect;
  const response = NextResponse.redirect(new URL(redirectTo, appOrigin), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return invalidLinkRedirect(appOrigin, kind);
  }

  if (kind === "recovery") {
    const user = data.user ?? data.session?.user ?? null;
    const sessionId = data.session?.access_token
      ? sessionIdFromAccessToken(data.session.access_token)
      : null;
    if (!user || !authorizedAppRole(user) || !sessionId) {
      return invalidLinkRedirect(appOrigin, kind);
    }
    const recoveryToken = await createRecoverySessionToken({
      sessionId,
      userId: user.id,
    });
    if (!recoveryToken) {
      return invalidLinkRedirect(appOrigin, kind);
    }
    setRecoverySessionCookie(response, recoveryToken);
  }

  return response;
}
