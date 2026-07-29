import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveTrustedAuthAppOrigin } from "@/lib/auth-app-origin";
import { authorizeRecoverySession } from "@/lib/auth-recovery-verification";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";

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
  if (providerError) {
    return invalidLinkRedirect(appOrigin, kind);
  }
  if (!code) {
    if (kind === "recovery") {
      const target = new URL("/forgot-password", appOrigin);
      target.searchParams.set("mode", "verify");
      return NextResponse.redirect(target, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
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
    const authorized = await authorizeRecoverySession(response, {
      session: data.session,
      user: data.user,
    });
    if (!authorized) {
      return invalidLinkRedirect(appOrigin, kind);
    }
  }

  return response;
}
