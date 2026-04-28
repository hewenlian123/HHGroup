import { NextResponse, type NextRequest } from "next/server";

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

/** Auth disabled: all pages and API routes are accessible without login. */
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
