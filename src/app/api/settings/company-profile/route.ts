import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  ensureCompanyProfile,
  parseCompanyProfileSaveBody,
  saveCompanyProfile,
  type CompanyProfile,
  type CompanyProfileInput,
} from "@/lib/company-profile";
import { validateCompanyProfileEmailField } from "@/lib/company-profile-form-validation";

export const dynamic = "force-dynamic";

/**
 * Load company profile with service role so reads match POST saves (same row, no anon RLS gaps).
 * Browser falls back to `ensureCompanyProfile(supabase)` when this returns 503.
 */
export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, fallback: "client", message: "Server load unavailable (no service role)." },
      { status: 503 }
    );
  }

  try {
    const profile = await ensureCompanyProfile(admin);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Load failed.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

/**
 * Save company profile only after a verified Supabase owner/admin session.
 */
export async function POST(req: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, fallback: "client", message: "Server save unavailable (no service role)." },
      { status: 503 }
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
