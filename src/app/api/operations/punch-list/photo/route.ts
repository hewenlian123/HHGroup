import { sessionJson } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";

export async function GET(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);
  const path = new URL(req.url).searchParams.get("path")?.trim();
  if (!path) return json({ ok: false, message: "Missing image path." }, { status: 400 });
  try {
    const { data, error } = await guard.client.storage
      .from(path.startsWith("organizations/") ? "attachments" : "punch-photos")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl)
      return json(
        { ok: false, message: "Photo is unavailable or access was denied." },
        { status: 404 }
      );
    const response = NextResponse.redirect(data.signedUrl);
    response.headers.set("Cache-Control", "private, no-store");
    for (const cookie of guard.sessionResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  } catch {
    return json({ ok: false, message: "Photo is unavailable." }, { status: 503 });
  }
}
