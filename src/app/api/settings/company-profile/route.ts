import { NextResponse } from "next/server";
import {
  getServerSupabaseAdmin,
  getSupabaseUserFromRequest,
  isCompanyLogoServerUploadWithoutSessionAllowed,
} from "@/lib/supabase-server";
import {
  parseCompanyProfileSaveBody,
  saveCompanyProfile,
  type CompanyProfile,
  type CompanyProfileInput,
} from "@/lib/company-profile";
import { validateCompanyProfileEmailField } from "@/lib/company-profile-form-validation";

export const dynamic = "force-dynamic";

/**
 * Save company profile with service role (bypasses RLS). Falls back to browser client when 503.
 * Auth: Bearer / cookies, or ALLOW_COMPANY_LOGO_SERVER_WITHOUT_SESSION (same as logo API).
 */
export async function POST(req: Request) {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, fallback: "client", message: "Server save unavailable (no service role)." },
      { status: 503 }
    );
  }

  const user = await getSupabaseUserFromRequest(req);
  if (!user && !isCompanyLogoServerUploadWithoutSessionAllowed()) {
    return NextResponse.json(
      {
        ok: false,
        fallback: "client",
        message: "You must be signed in (or use client save with anon RLS).",
      },
      { status: 401 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  let patch: Partial<CompanyProfileInput>;
  try {
    patch = parseCompanyProfileSaveBody(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body.";
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }

  if (patch.email !== undefined && patch.email !== null) {
    const emailErr = validateCompanyProfileEmailField(patch.email);
    if (emailErr) {
      return NextResponse.json({ ok: false, message: emailErr }, { status: 400 });
    }
  }

  try {
    const profile: CompanyProfile = await saveCompanyProfile(admin, patch);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
