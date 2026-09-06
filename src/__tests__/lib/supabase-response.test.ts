import { expect, it } from "vitest";
import { NextResponse } from "next/server";
import { sessionJson } from "@/lib/supabase-response";

it("preserves rotated session cookies on success and failed operation responses", async () => {
  const source = NextResponse.next();
  source.cookies.set("refreshed-session", "rotated", { httpOnly: true });
  for (const status of [200, 403, 500]) {
    const response = sessionJson({ ok: status === 200 }, source, status);
    expect(response.status).toBe(status);
    expect(response.cookies.get("refreshed-session")?.value).toBe("rotated");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  }
});
