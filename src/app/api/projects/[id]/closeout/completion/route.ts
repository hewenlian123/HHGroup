import { NextResponse } from "next/server";
import { upsertCloseoutCompletion } from "@/lib/data";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    await upsertCloseoutCompletion(id, {
      completion_date: body.completion_date ?? null,
      contractor_name: body.contractor_name ?? null,
      client_name: body.client_name ?? null,
      contractor_signature: body.contractor_signature ?? null,
      client_signature: body.client_signature ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
