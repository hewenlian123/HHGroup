import { NextResponse } from "next/server";
import { getDocumentSignedUrl } from "@/lib/data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path?.trim()) {
    return NextResponse.json({ ok: false, message: "Missing path." }, { status: 400 });
  }
  try {
    const { url: signedUrl, error } = await getDocumentSignedUrl(path, 60);
    if (signedUrl) return NextResponse.redirect(signedUrl);
    const notFound = !error || /not found|object not found|404/i.test(error);
    return NextResponse.json(
      { ok: false, message: error ?? "Failed to get URL." },
      { status: notFound ? 404 : 500 }
    );
  } catch {
    return NextResponse.json({ ok: false, message: "Failed to get photo URL." }, { status: 500 });
  }
}
