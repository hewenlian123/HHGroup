import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { guardDangerousMaintenanceRequest } from "@/lib/production-safety";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { insertWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { parseWorkerReceiptStoragePath } from "@/lib/worker-receipt-storage";

const BUCKET = "worker-receipts";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * GET: Report storage vs DB — list objects in worker-receipts bucket and receipt_urls in worker_receipts.
 * POST: Sync — for each storage object that has no matching worker_receipts.receipt_url, insert a placeholder row.
 */
export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const blocked = guardDangerousMaintenanceRequest(request);
  if (blocked) return blocked;

  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return jsonError("Receipt sync is temporarily unavailable.", 500);
  }
  try {
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("uploads", { limit: 1000 });
    if (listErr) {
      console.error("[upload-receipt/sync] storage list failed", { message: listErr.message });
      return jsonError("Receipt sync report failed.", 500);
    }
    const objects = (files ?? []).filter((f) => f.name && f.id);
    const { data: rows } = await supabase
      .from("worker_receipts")
      .select("id, receipt_url")
      .not("receipt_url", "is", null);
    const dbPaths = new Set(
      (rows ?? [])
        .map((r: { receipt_url: string | null }) =>
          parseWorkerReceiptStoragePath(r.receipt_url ?? "")
        )
        .filter((path): path is string => Boolean(path))
    );
    const orphanPaths: string[] = [];
    for (const obj of objects) {
      const path = `uploads/${obj.name}`;
      if (!dbPaths.has(path)) orphanPaths.push(path);
    }
    return NextResponse.json({
      storageCount: objects.length,
      dbReceiptUrlCount: dbPaths.size,
      orphanCount: orphanPaths.length,
      orphanPaths: orphanPaths.slice(0, 50),
    });
  } catch (e) {
    console.error("[upload-receipt/sync] report failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return jsonError("Receipt sync report failed.", 500);
  }
}

export async function POST(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const blocked = guardDangerousMaintenanceRequest(request);
  if (blocked) return blocked;

  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return jsonError("Receipt sync is temporarily unavailable.", 500);
  }
  try {
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("uploads", { limit: 500 });
    if (listErr) {
      console.error("[upload-receipt/sync] storage list failed", { message: listErr.message });
      return jsonError("Receipt sync failed.", 500);
    }
    const objects = (files ?? []).filter((f) => f.name && f.id);
    const { data: rows } = await supabase
      .from("worker_receipts")
      .select("receipt_url")
      .not("receipt_url", "is", null);
    const dbPaths = new Set(
      (rows ?? [])
        .map((r: { receipt_url: string | null }) =>
          parseWorkerReceiptStoragePath(r.receipt_url ?? "")
        )
        .filter((path): path is string => Boolean(path))
    );
    const inserted: string[] = [];
    for (const obj of objects) {
      const path = `uploads/${obj.name}`;
      if (dbPaths.has(path)) continue;
      await insertWorkerReceiptWithClient(supabase, {
        workerName: "Unknown",
        projectId: null,
        expenseType: "Other",
        amount: 0,
        receiptUrl: path,
        status: "Pending",
      });
      inserted.push(path);
      dbPaths.add(path);
    }
    return NextResponse.json({
      ok: true,
      insertedCount: inserted.length,
      inserted: inserted.slice(0, 20),
    });
  } catch (e) {
    console.error("[upload-receipt/sync] sync failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return jsonError("Receipt sync failed.", 500);
  }
}
