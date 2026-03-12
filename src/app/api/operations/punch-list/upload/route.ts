import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const BUCKET = "attachments";
const PREFIX = "punch-list";

export async function POST(req: Request) {
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json({ ok: false, message: "No file provided." }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${PREFIX}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true as const, path });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
