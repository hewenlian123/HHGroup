import { NextResponse, type NextRequest } from "next/server";

/** Auth disabled: all pages and API routes are accessible without login. */
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

