import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  mapWorkerAdvanceRowsForApi,
  type WorkerAdvanceSelectRow,
} from "@/lib/worker-advances-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const { data, error } = await admin
      .from("worker_advances")
      .select("id, worker_id, project_id, amount, advance_date, status, notes, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to load worker advance");
    if (!data) return NextResponse.json({ message: "Not found" }, { status: 404 });

    const [result] = await mapWorkerAdvanceRowsForApi(admin, [data as WorkerAdvanceSelectRow]);

    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker advance";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const patch: Record<string, unknown> = {};
    if (body.projectId !== undefined) patch.project_id = body.projectId || null;
    if (body.amount !== undefined) patch.amount = Number(body.amount);
    if (body.advanceDate !== undefined) {
      patch.advance_date = String(body.advanceDate).slice(0, 10);
    }
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).trim() : null;

    const { data, error } = await admin
      .from("worker_advances")
      .update(patch)
      .eq("id", id)
      .select("id, worker_id, project_id, amount, advance_date, status, notes, created_at")
      .maybeSingle();

    if (error) throw new Error(error.message ?? "Failed to update worker advance");
    if (!data) return NextResponse.json({ message: "Not found" }, { status: 404 });

    const [result] = await mapWorkerAdvanceRowsForApi(admin, [data as WorkerAdvanceSelectRow]);

    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update worker advance";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const { error } = await admin.from("worker_advances").delete().eq("id", id);
    if (error) throw new Error(error.message ?? "Failed to delete worker advance");
    return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete worker advance";
    return NextResponse.json({ message }, { status: 500 });
  }
}
