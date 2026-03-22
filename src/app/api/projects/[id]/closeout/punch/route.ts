import { NextResponse } from "next/server";
import { upsertCloseoutPunch } from "@/lib/data";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    await upsertCloseoutPunch(id, {
      inspection_date: body.inspection_date ?? null,
      inspector: body.inspector ?? null,
      notes: body.notes ?? null,
      contractor_signature: body.contractor_signature ?? null,
      client_signature: body.client_signature ?? null,
      items: Array.isArray(body.items) ? body.items : [],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
