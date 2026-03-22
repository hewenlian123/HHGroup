import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { insertWorkerReceiptWithClient } from "@/lib/worker-receipts-db";

const BUCKET = "worker-receipts";

/**
 * GET: Report storage vs DB — list objects in worker-receipts bucket and receipt_urls in worker_receipts.
 * POST: Sync — for each storage object that has no matching worker_receipts.receipt_url, insert a placeholder row.
 */
export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("uploads", { limit: 1000 });
    if (listErr) {
      return NextResponse.json(
        { message: listErr.message ?? "Failed to list storage." },
        { status: 500 }
      );
    }
    const objects = (files ?? []).filter((f) => f.name && f.id);
    const { data: rows } = await supabase
      .from("worker_receipts")
      .select("id, receipt_url")
      .not("receipt_url", "is", null);
    const dbUrls = new Set(
      (rows ?? []).map((r: { receipt_url: string | null }) => r.receipt_url).filter(Boolean)
    );
    const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${BUCKET}`;
    const orphanPaths: string[] = [];
    for (const obj of objects) {
      const path = `uploads/${obj.name}`;
      const publicUrl = `${baseUrl}/${path}`;
      if (!dbUrls.has(publicUrl)) orphanPaths.push(path);
    }
    return NextResponse.json({
      storageCount: objects.length,
      dbReceiptUrlCount: dbUrls.size,
      orphanCount: orphanPaths.length,
      orphanPaths: orphanPaths.slice(0, 50),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync report failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("uploads", { limit: 500 });
    if (listErr) {
      return NextResponse.json(
        { message: listErr.message ?? "Failed to list storage." },
        { status: 500 }
      );
    }
    const objects = (files ?? []).filter((f) => f.name && f.id);
    const { data: rows } = await supabase
      .from("worker_receipts")
      .select("receipt_url")
      .not("receipt_url", "is", null);
    const dbUrls = new Set(
      (rows ?? []).map((r: { receipt_url: string | null }) => r.receipt_url).filter(Boolean)
    );
    const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${BUCKET}`;
    const inserted: string[] = [];
    for (const obj of objects) {
      const path = `uploads/${obj.name}`;
      const publicUrl = `${baseUrl}/${path}`;
      if (dbUrls.has(publicUrl)) continue;
      await insertWorkerReceiptWithClient(supabase, {
        workerName: "Unknown",
        projectId: null,
        expenseType: "Other",
        amount: 0,
        receiptUrl: publicUrl,
        status: "Pending",
      });
      inserted.push(publicUrl);
      dbUrls.add(publicUrl);
    }
    return NextResponse.json({
      ok: true,
      insertedCount: inserted.length,
      inserted: inserted.slice(0, 20),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
