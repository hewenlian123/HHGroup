import { NextResponse } from "next/server";
import { getDocumentSignedUrl } from "@/lib/data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path?.trim()) {
    return NextResponse.json({ ok: false, message: "Missing path." }, { status: 400 });
  }
  try {
    const { url: signedUrl } = await getDocumentSignedUrl(path, 60);
    if (!signedUrl) return NextResponse.json({ ok: false, message: "Failed to get URL." }, { status: 500 });
    return NextResponse.redirect(signedUrl);
  } catch {
    return NextResponse.json({ ok: false, message: "Failed to get photo URL." }, { status: 500 });
  }
}
