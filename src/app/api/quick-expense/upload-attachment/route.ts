import { NextResponse } from "next/server";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "expense-attachments";

export async function POST(req: Request) {
  // Prefer service role so uploads do not depend on storage.objects policies for anon.
  const admin = getServerSupabaseAdmin();
  const supabase = admin ?? getServerSupabase();
  if (process.env.NODE_ENV === "production" && !admin) {
    console.warn(
      "[quick-expense/upload-attachment] SUPABASE_SERVICE_ROLE_KEY is unset; using anon. " +
        "Set it in production so receipt uploads succeed even with restrictive storage RLS."
    );
  }
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json({ ok: false, message: "No file provided." }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "receipt.jpg";
    const path = `quick-expense/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message:
            error.message ||
            "Upload failed. Ensure bucket 'expense-attachments' exists and policies are valid.",
        },
        { status: 500 }
      );
    }

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
    return NextResponse.json({
      ok: true as const,
      path,
      signed_url: signed?.signedUrl ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
