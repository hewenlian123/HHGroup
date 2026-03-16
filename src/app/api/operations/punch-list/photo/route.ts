import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "punch-photos";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path?.trim()) {
    return NextResponse.json({ ok: false, message: "Missing path." }, { status: 400 });
  }
  try {
    const supabase = getServerSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, message: "Storage not configured." }, { status: 500 });
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return NextResponse.json({ ok: false, message: "Failed to get URL." }, { status: 500 });
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ ok: false, message: "Failed to get photo URL." }, { status: 500 });
  }
}
