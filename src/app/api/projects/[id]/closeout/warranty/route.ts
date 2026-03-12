import { NextResponse } from "next/server";
import { upsertCloseoutWarranty } from "@/lib/data";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    await upsertCloseoutWarranty(id, {
      start_date: body.start_date ?? null,
      period_months: body.period_months ?? 12,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
