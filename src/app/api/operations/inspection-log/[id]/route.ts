import { NextResponse } from "next/server";
import { getInspectionLogById, updateInspectionLog } from "@/lib/data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await getInspectionLogById(id);
    if (!entry) {
      return NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true as const, entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load inspection.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const status = body.status !== undefined ? body.status : undefined;
    if (status !== undefined && !["passed", "failed", "pending"].includes(status)) {
      return NextResponse.json({ ok: false as const, message: "status must be passed, failed, or pending." }, { status: 400 });
    }
    const updated = await updateInspectionLog(id, {
      inspection_type: body.inspection_type !== undefined ? body.inspection_type.trim() : undefined,
      inspector: body.inspector !== undefined ? (body.inspector?.trim() ?? null) : undefined,
      inspection_date: body.inspection_date !== undefined ? body.inspection_date?.slice(0, 10) ?? null : undefined,
      status: status as "passed" | "failed" | "pending" | undefined,
      notes: body.notes !== undefined ? (body.notes?.trim() ?? null) : undefined,
    });
    if (!updated) {
      return NextResponse.json({ ok: false as const, message: "Not found or no changes." }, { status: 404 });
    }
    return NextResponse.json({ ok: true as const, entry: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update inspection.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
