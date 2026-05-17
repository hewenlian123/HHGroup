import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { normalizeAuthRedirect } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

function loginRedirect(requestUrl: URL, error: string): NextResponse {
  const target = new URL("/login", requestUrl.origin);
  target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError =
    requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const redirectTo = normalizeAuthRedirect(
    requestUrl.searchParams.get("redirect") ?? requestUrl.searchParams.get("next")
  );

  if (providerError) {
    return loginRedirect(requestUrl, providerError);
  }

  if (!code) {
    return loginRedirect(requestUrl, "Missing authentication code.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return loginRedirect(requestUrl, "Supabase Auth is not configured.");
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
    return loginRedirect(requestUrl, error.message || "Authentication callback failed.");
  }

  return response;
}
