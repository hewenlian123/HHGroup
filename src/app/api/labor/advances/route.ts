import { NextResponse } from "next/server";
import { getServerSupabaseInternal } from "@/lib/supabase-server";
import { mapWorkerAdvanceRowsForApi, type WorkerAdvanceSelectRow } from "@/lib/worker-advances-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(request: Request) {
  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("workerId") ?? undefined;
    const projectId = searchParams.get("projectId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    let q = admin
      .from("worker_advances")
      .select("id, worker_id, project_id, amount, advance_date, status, notes, created_at")
      .order("advance_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (workerId) q = q.eq("worker_id", workerId);
    if (projectId) q = q.eq("project_id", projectId);
    if (status === "active") {
      q = q.in("status", ["pending", "deducted"]);
    } else if (status) {
      q = q.eq("status", status);
    }

    const { data, error } = await q;
    if (error) {
      throw new Error(error.message ?? "Failed to load worker advances");
    }

    const advances = await mapWorkerAdvanceRowsForApi(
      admin,
      (data ?? []) as WorkerAdvanceSelectRow[]
    );

    return NextResponse.json({ advances }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker advances";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const workerId = String(body.workerId ?? "").trim();
    const projectId = body.projectId ? String(body.projectId) : null;
    const amount = Number(body.amount);
    const advanceDate = body.advanceDate
      ? String(body.advanceDate).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!workerId) {
      return NextResponse.json({ message: "Worker is required." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: "Amount must be greater than 0." }, { status: 400 });
    }

    const payload = {
      worker_id: workerId,
      project_id: projectId,
      amount,
      advance_date: advanceDate,
      notes,
    };

    const { data, error } = await admin
      .from("worker_advances")
      .insert(payload)
      .select("id, worker_id, project_id, amount, advance_date, status, notes, created_at")
      .single();

    if (error) {
      throw new Error(error.message ?? "Failed to create worker advance");
    }

    const [result] = await mapWorkerAdvanceRowsForApi(admin, [data as WorkerAdvanceSelectRow]);

    return NextResponse.json(result, { status: 201, headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create worker advance";
    return NextResponse.json({ message }, { status: 500 });
  }
}
