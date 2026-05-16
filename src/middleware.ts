import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const INTERNAL_ADMIN_SECRET_HEADER = "x-internal-admin-secret";
const PRODUCTION_SAFETY_LOCK_HEADER = "x-hh-production-safety-lock";
const TEST_AUTH_BYPASS_HEADER = "x-hh-test-auth-bypass";

const PUBLIC_APP_PATHS = new Set([
  "/",
  "/login",
  "/logout",
  "/auth/callback",
  "/offline",
  "/receipt",
]);

const PROTECTED_APP_PREFIXES = [
  "/dashboard",
  "/projects",
  "/customers",
  "/financial",
  "/finance",
  "/labor",
  "/workers",
  "/worker",
  "/invoices",
  "/estimates",
  "/change-orders",
  "/settings",
  "/system-health",
  "/system-logs",
  "/system-metrics",
  "/system/backups",
  "/admin",
  "/tasks",
  "/upload-receipt",
  "/materials",
  "/schedule",
  "/site-photos",
  "/punch-list",
  "/inspection-log",
  "/documents",
  "/vendors",
  "/subcontractors",
  "/bills",
  "/owner",
];

const ADMIN_APP_PREFIXES = ["/admin", "/system/backups", "/system-logs", "/system-metrics"];

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

function hasLocalTestAuthBypass(request: NextRequest): boolean {
  return !isProductionRuntime() && request.headers.get(TEST_AUTH_BYPASS_HEADER) === "1";
}

function hasInternalAdminSecret(request: NextRequest): boolean {
  const primary = process.env.HH_INTERNAL_ADMIN_SECRET?.trim() ?? "";
  const fallback = process.env.INTERNAL_ADMIN_SECRET?.trim() ?? "";
  const expected = primary.length > 0 ? primary : fallback;
  const actual = request.headers.get(INTERNAL_ADMIN_SECRET_HEADER)?.trim() ?? "";
  return expected.length > 0 && actual.length > 0 && expected === actual;
}

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.HH_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAdminAppPath(pathname: string): boolean {
  return ADMIN_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicAppPath(pathname: string): boolean {
  return PUBLIC_APP_PATHS.has(pathname);
}

function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_PREFIXES.some(
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

async function hasSupabaseSessionUser(
  request: NextRequest,
  response: NextResponse
): Promise<{ authenticated: boolean; admin: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { authenticated: false, admin: false };

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

  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const email = user?.email?.trim().toLowerCase() ?? "";
  const role = user?.app_metadata?.role;
  const adminEmails = parseAdminEmails();
  return {
    authenticated: Boolean(user),
    admin: Boolean(user && (role === "owner" || role === "admin" || adminEmails.has(email))),
  };
}

/** Production auth boundary: local/dev remains open; production core pages require a session. */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (
    (pathname === "/system-tests" || pathname.startsWith("/system-tests/")) &&
    isProductionSafetyLocked(request) &&
    !hasInternalAdminSecret(request)
  ) {
    return forbiddenMaintenancePageResponse();
  }

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

  if (
    isProductionSafetyLocked(request) &&
    isProtectedAppPath(pathname) &&
    !isPublicAppPath(pathname) &&
    !hasInternalAdminSecret(request) &&
    !hasLocalTestAuthBypass(request)
  ) {
    const response = NextResponse.next();
    const auth = await hasSupabaseSessionUser(request, response);
    if (!auth.authenticated) {
      return loginRedirectResponse(request);
    }
    if (isAdminAppPath(pathname) && !auth.admin) {
      return forbiddenAdminPageResponse();
    }
    return response;
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
    "/_next/static/chunks/:path*",
    "/_next/static/:build/_buildManifest.js",
  ],
};
