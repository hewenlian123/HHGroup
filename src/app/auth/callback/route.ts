import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { normalizeAuthRedirect } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

function loginRedirect(requestUrl: URL): NextResponse {
  const target = new URL("/login", requestUrl.origin);
  target.searchParams.set("error", "invalid_or_expired_link");
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError =
    requestUrl.searchParams.has("error_description") || requestUrl.searchParams.has("error");
  const redirectTo = normalizeAuthRedirect(
    requestUrl.searchParams.get("redirect") ?? requestUrl.searchParams.get("next")
  );

  if (providerError) {
    return loginRedirect(requestUrl);
  }

  if (!code) {
    return loginRedirect(requestUrl);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return loginRedirect(requestUrl);
  }

  const target = new URL(redirectTo, requestUrl.origin);
  const response = NextResponse.redirect(target);
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return loginRedirect(requestUrl);
  }

  return response;
}
