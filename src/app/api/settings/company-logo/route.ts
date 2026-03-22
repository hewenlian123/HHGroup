import { NextResponse } from "next/server";
import {
  getServerSupabaseAdmin,
  getSupabaseUserFromRequest,
  isCompanyLogoServerUploadWithoutSessionAllowed,
} from "@/lib/supabase-server";
import { uploadCompanyLogo, removeCompanyLogo } from "@/lib/company-profile";
import { validateLogoFileForUpload } from "@/lib/company-profile-form-validation";

export const dynamic = "force-dynamic";

function normalizeFormDataFile(entry: FormDataEntryValue | null): File | null {
  if (!entry || typeof entry === "string") return null;
  if (!(entry instanceof Blob) || entry.size === 0) return null;
  if (entry instanceof File) return entry;
  // Runtimes may expose a plain Blob for file fields; DOM typings only list File | string.
  const blob = entry as Blob;
  const type = blob.type || "application/octet-stream";
  const ext =
    type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("svg") ? "svg" : "png";
  try {
    return new File([blob], `upload.${ext}`, { type });
  } catch {
    return null;
  }
}

/**
 * Upload/remove company logo with the service-role client (bypasses Storage RLS).
 * Auth: session cookie, or `Authorization: Bearer <access_token>`, or (optional)
 * `ALLOW_COMPANY_LOGO_SERVER_WITHOUT_SESSION=1` when service role is set (single-tenant only).
 * Returns 503 + `fallback: "client"` when `SUPABASE_SERVICE_ROLE_KEY` is not set.
 */
export async function POST(req: Request) {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, fallback: "client", message: "Server upload unavailable." }, { status: 503 });
  }

  const user = await getSupabaseUserFromRequest(req);
  if (!user && !isCompanyLogoServerUploadWithoutSessionAllowed()) {
    return NextResponse.json(
      { ok: false, fallback: "client", message: "You must be signed in (or use client upload with anon RLS)." },
      { status: 401 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid form data." }, { status: 400 });
  }

  const file = normalizeFormDataFile(form.get("file"));
  if (!file) {
    return NextResponse.json({ ok: false, message: "Missing file." }, { status: 400 });
  }

  const v = validateLogoFileForUpload(file);
  if (v) {
    return NextResponse.json({ ok: false, message: v }, { status: 400 });
  }

  try {
    const { profile } = await uploadCompanyLogo(admin, file);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, fallback: "client", message: "Server remove unavailable." }, { status: 503 });
  }

  const user = await getSupabaseUserFromRequest(req);
  if (!user && !isCompanyLogoServerUploadWithoutSessionAllowed()) {
    return NextResponse.json(
      { ok: false, fallback: "client", message: "You must be signed in (or use client remove with anon RLS)." },
      { status: 401 }
    );
  }

  try {
    const profile = await removeCompanyLogo(admin);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Remove failed.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
