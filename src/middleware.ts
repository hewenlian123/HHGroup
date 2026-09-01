import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizedAppRole } from "@/lib/auth-role";
import {
  DEVICE_UNLOCK_COOKIE,
  readDeviceCookie,
  readSignedDeviceToken,
  sessionIdFromAccessToken,
  TRUSTED_DEVICE_COOKIE,
} from "@/lib/device-unlock-token";
import { workerReceiptInboxPath } from "@/lib/expense-operations-routing";
import { isCompatibilityAccessEnabled } from "@/lib/owner-access-mode";
import { isLocalAutoLoginEnabled, LOCAL_AUTO_LOGIN_PATH } from "@/lib/local-auto-login";

const INTERNAL_ADMIN_SECRET_HEADER = "x-internal-admin-secret";
const PRODUCTION_SAFETY_LOCK_HEADER = "x-hh-production-safety-lock";

const PUBLIC_APP_PATHS = new Set([
  "/",
  "/login",
  "/logout",
  "/auth/callback",
  "/auth/recovery/callback",
  "/forgot-password",
  "/reset-password",
  "/offline",
  "/upload-receipt",
]);

const PUBLIC_API_PATHS = new Set([
  LOCAL_AUTO_LOGIN_PATH,
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/recovery/verify",
  "/api/auth/reset-password",
  "/api/upload-receipt/options",
  "/api/upload-receipt/upload",
  "/api/upload-receipt/submit",
]);

const STRICT_AUTH_PREFIXES = [
  "/settings/security",
  "/api/settings/security",
  "/api/auth/unlock",
  "/api/auth/lock",
  "/api/financial/receipt-queue",
  "/api/ocr-receipt",
  "/api/upload-receipt/sync",
  "/api/worker-receipts",
];

const ADMIN_APP_PREFIXES = ["/admin"];

/**
 * Turbopack / other Next builds use different chunk names than webpack `next dev`.
 * A stale tab, embedded preview, or SW-cached HTML may still request those URLs → 404 spam.
 * Respond with Clear-Site-Data so the browser drops cached documents and reloads real HTML.
 */
function isStaleNonWebpackDevChunkPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const p = decoded.toLowerCase();
  return (
    p.includes("turbopack") ||
    p.includes("root-of-the-server") ||
    p.includes("react-server-dom-turbopack")
  );
}

function staleDevAssetResponse(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Clear-Site-Data": '"cache"',
    },
  });
}

function isProductionSafetyLocked(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    request.headers.get(PRODUCTION_SAFETY_LOCK_HEADER) === "1"
  );
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function isProductionRuntimeDisabledPath(pathname: string): boolean {
  return (
    pathname === "/api/test" ||
    pathname.startsWith("/api/test/") ||
    pathname === "/api/ensure-schema" ||
    pathname.startsWith("/api/ensure-schema/") ||
    pathname === "/system-tests" ||
    pathname.startsWith("/system-tests/")
  );
}

function hasInternalAdminSecret(request: NextRequest): boolean {
  const primary = process.env.HH_INTERNAL_ADMIN_SECRET?.trim() ?? "";
  const fallback = process.env.INTERNAL_ADMIN_SECRET?.trim() ?? "";
  const expected = primary.length > 0 ? primary : fallback;
  const actual = request.headers.get(INTERNAL_ADMIN_SECRET_HEADER)?.trim() ?? "";
  return expected.length > 0 && actual.length > 0 && expected === actual;
}

function isAdminAppPath(pathname: string): boolean {
  return ADMIN_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicAppPath(pathname: string): boolean {
  return PUBLIC_APP_PATHS.has(pathname);
}

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.has(pathname);
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function requiresStrictSupabaseAuth(pathname: string): boolean {
  if (pathname.startsWith("/api/financial/expenses/") && pathname.includes("/receipts")) {
    return true;
  }
  return STRICT_AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function forbiddenMaintenancePageResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      message:
        "This maintenance page is disabled in production. Use a non-production environment or an internal admin flow.",
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function productionRuntimeNotFoundResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, message: "Not found." },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function forbiddenAdminPageResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      message: "Admin access required.",
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function loginRedirectResponse(request: NextRequest): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = "/login";
  target.search = "";
  target.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search || ""}`);
  return NextResponse.redirect(target);
}

function localAutoLoginRedirectResponse(request: NextRequest): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = LOCAL_AUTO_LOGIN_PATH;
  target.search = "";
  target.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search || ""}`);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function unauthorizedApiResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, message: "Authentication required." },
    {
      status: 401,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

function forbiddenApiResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, message: "Owner or admin access required." },
    {
      status: 403,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

function lockedApiResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, message: "Device locked.", unlockPath: "/unlock" },
    {
      status: 423,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

function copyResponseCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

async function hasSupabaseSessionUser(
  request: NextRequest,
  response: NextResponse
): Promise<{
  authenticated: boolean;
  authorized: boolean;
  sessionId: string | null;
  supabase: SupabaseClient | null;
  userId: string | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return {
      authenticated: false,
      authorized: false,
      sessionId: null,
      supabase: null,
      userId: null,
    };
  }

  const supabase = createServerClient(url, anon, {
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

  const authorization =
    request.headers.get("authorization") ?? request.headers.get("Authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim() || null
    : null;
  const {
    data: { user },
  } = await supabase.auth.getUser(bearer ?? undefined).catch(() => ({ data: { user: null } }));
  const {
    data: { session },
  } =
    user && !bearer
      ? await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
      : { data: { session: null } };
  return {
    authenticated: Boolean(user),
    authorized: authorizedAppRole(user) !== null,
    sessionId: bearer
      ? sessionIdFromAccessToken(bearer)
      : session?.access_token
        ? sessionIdFromAccessToken(session.access_token)
        : null,
    supabase,
    userId: user?.id ?? null,
  };
}

async function requiresDeviceUnlock(
  request: NextRequest,
  auth: Awaited<ReturnType<typeof hasSupabaseSessionUser>>
): Promise<boolean> {
  if (!auth.supabase || !auth.userId || !auth.sessionId) return false;
  const trusted = await readSignedDeviceToken(readDeviceCookie(request, TRUSTED_DEVICE_COOKIE));
  if (!trusted || trusted.userId !== auth.userId || trusted.sessionId !== auth.sessionId) {
    return false;
  }

  const { data, error } = await auth.supabase.rpc("get_my_device_unlock_state");
  const state = Array.isArray(data)
    ? (data[0] as { enabled?: unknown; pin_version?: unknown } | undefined)
    : (data as { enabled?: unknown; pin_version?: unknown } | null);
  if (error || !state || state.enabled !== true) return false;

  const pinVersion = typeof state.pin_version === "number" ? state.pin_version : null;
  if (!pinVersion || trusted.pinVersion !== pinVersion) return true;

  const unlocked = await readSignedDeviceToken(readDeviceCookie(request, DEVICE_UNLOCK_COOKIE));
  return !(
    unlocked &&
    unlocked.userId === auth.userId &&
    unlocked.sessionId === auth.sessionId &&
    unlocked.pinVersion === pinVersion
  );
}

/** Default-deny Auth boundary for application pages and Route Handlers. */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/_next/static/chunks/")) {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.next();
    }
    if (isStaleNonWebpackDevChunkPath(pathname)) {
      return staleDevAssetResponse();
    }
    return NextResponse.next();
  }

  if (pathname.endsWith("/_buildManifest.js") && pathname.startsWith("/_next/static/")) {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.next();
    }
    const segment = pathname.slice("/_next/static/".length).split("/")[0];
    if (segment !== "development") {
      return staleDevAssetResponse();
    }
    return NextResponse.next();
  }

  if (isProductionRuntime() && isProductionRuntimeDisabledPath(pathname)) {
    return productionRuntimeNotFoundResponse();
  }

  const apiPath = isApiPath(pathname);
  const publicPath = apiPath ? isPublicApiPath(pathname) : isPublicAppPath(pathname);
  let authenticatedResponse: NextResponse | null = null;
  let localAutoLoginAuth: Awaited<ReturnType<typeof hasSupabaseSessionUser>> | null = null;

  // Browser navigations in explicitly enabled local development obtain a real
  // Supabase owner session through a Node Route Handler. APIs never auto-login,
  // so anonymous permission boundaries remain independently testable.
  const localAutoLoginNavigation =
    !apiPath && (pathname === "/" || pathname === "/login" || !publicPath);
  if (localAutoLoginNavigation && isLocalAutoLoginEnabled(request.url)) {
    const response = NextResponse.next();
    const auth = await hasSupabaseSessionUser(request, response);
    if (!auth.authenticated) return localAutoLoginRedirectResponse(request);
    if (!auth.authorized) return forbiddenAdminPageResponse();
    authenticatedResponse = response;
    localAutoLoginAuth = auth;
  }

  if (pathname === "/login") {
    const response = authenticatedResponse ?? NextResponse.next();
    const auth = localAutoLoginAuth ?? (await hasSupabaseSessionUser(request, response));
    if (auth.authenticated && auth.authorized) {
      const destination = (await requiresDeviceUnlock(request, auth)) ? "/unlock" : "/dashboard";
      return copyResponseCookies(
        response,
        NextResponse.redirect(new URL(destination, request.url))
      );
    }
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }

  if (!publicPath) {
    const strict = requiresStrictSupabaseAuth(pathname);
    if (!localAutoLoginAuth && !strict && isCompatibilityAccessEnabled()) {
      authenticatedResponse = NextResponse.next();
    } else {
      const response = authenticatedResponse ?? NextResponse.next();
      const auth = localAutoLoginAuth ?? (await hasSupabaseSessionUser(request, response));
      if (!auth.authenticated) {
        return apiPath ? unauthorizedApiResponse() : loginRedirectResponse(request);
      }
      if (!auth.authorized) {
        return apiPath ? forbiddenApiResponse() : forbiddenAdminPageResponse();
      }

      const unlockEndpoint =
        pathname === "/unlock" || pathname === "/api/auth/unlock" || pathname === "/api/auth/lock";
      if (!unlockEndpoint && (await requiresDeviceUnlock(request, auth))) {
        if (apiPath) return lockedApiResponse();
        const target = new URL("/unlock", request.url);
        target.searchParams.set(
          "redirect",
          `${request.nextUrl.pathname}${request.nextUrl.search || ""}`
        );
        return copyResponseCookies(response, NextResponse.redirect(target));
      }

      if (
        (pathname === "/system-tests" || pathname.startsWith("/system-tests/")) &&
        isProductionSafetyLocked(request) &&
        !hasInternalAdminSecret(request)
      ) {
        return forbiddenMaintenancePageResponse();
      }

      if (isAdminAppPath(pathname) && !auth.authorized) {
        return forbiddenAdminPageResponse();
      }

      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      authenticatedResponse = response;
    }
  }

  // This must run before the legacy Labor layout/App Router tree. The old path is a
  // saved-link compatibility boundary, not a separately rendered workspace.
  if (pathname === "/labor/receipts") {
    const target = request.nextUrl.clone();
    const destination = workerReceiptInboxPath(searchParams);
    const [destinationPathname, destinationSearch = ""] = destination.split("?");
    target.pathname = destinationPathname;
    target.search = destinationSearch;
    return copyResponseCookies(
      authenticatedResponse ?? NextResponse.next(),
      NextResponse.redirect(target)
    );
  }

  const mode = (searchParams.get("mode") ?? "").toLowerCase();
  const workerModeCookie = request.cookies.get("hh_worker_mode")?.value === "1";
  const isWorkerModePath = pathname === "/labor/daily" || pathname === "/labor/daily-entry";

  if (isWorkerModePath && mode === "exit") {
    const target = request.nextUrl.clone();
    target.searchParams.delete("mode");
    target.pathname = "/labor/daily";
    const response = NextResponse.redirect(target);
    response.cookies.delete("hh_worker_mode");
    return response;
  }

  if (isWorkerModePath && mode === "worker") {
    const response =
      pathname === "/labor/daily"
        ? NextResponse.redirect(new URL("/labor/daily-entry?mode=worker", request.url))
        : NextResponse.next();
    response.cookies.set("hh_worker_mode", "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
    return response;
  }

  if (workerModeCookie && isWorkerModePath) {
    const target = request.nextUrl.clone();
    target.pathname = "/labor/daily-entry";
    target.search = "?mode=worker";
    if (pathname !== "/labor/daily-entry" || mode !== "worker") {
      return NextResponse.redirect(target);
    }
  }

  return authenticatedResponse ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
    "/_next/static/chunks/:path*",
    "/_next/static/:build/_buildManifest.js",
  ],
};
