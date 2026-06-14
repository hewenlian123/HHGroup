import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "material-images";

export async function GET(req: Request) {
  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false as const, message: "Supabase not configured." },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const path = url.searchParams.get("path")?.trim();
  if (!path) {
    return NextResponse.json({ ok: false as const, message: "Missing path." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false as const, message: error?.message ?? "Failed to get photo URL." },
        { status: 500 }
      );
    }
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json(
      { ok: false as const, message: "Failed to get photo URL." },
      { status: 500 }
    );
  }
}
