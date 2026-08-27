import { NextResponse } from "next/server";
import { upsertCloseoutWarranty } from "@/lib/data";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  getServerSupabaseAdminNoStore,
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
} from "@/lib/supabase-server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseAdminNoStore);
  if (!guard.ok) return guard.response;
  if (!guard.client) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    await upsertCloseoutWarranty(
      id,
      {
        start_date: body.start_date ?? null,
        period_months: body.period_months ?? 12,
        notes: body.notes ?? null,
      },
      guard.client
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
