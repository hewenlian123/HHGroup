import { NextResponse } from "next/server";

export function withSessionCookies(response: NextResponse, sessionResponse: NextResponse) {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export function sessionJson(body: unknown, sessionResponse: NextResponse, status = 200) {
  return withSessionCookies(NextResponse.json(body, { status }), sessionResponse);
}
