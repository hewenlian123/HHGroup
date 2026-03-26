import { NextResponse, type NextRequest } from "next/server";

/** Auth disabled: all pages and API routes are accessible without login. */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
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

  if (workerModeCookie) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
