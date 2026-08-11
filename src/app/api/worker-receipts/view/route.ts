import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { createSignedStorageUrl } from "@/lib/storage-signed-url";
import { parseWorkerReceiptStoragePath, WORKER_RECEIPT_BUCKET } from "@/lib/worker-receipt-storage";

export async function POST(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const client = getServerSupabaseAdmin();
  if (!client) {
    return NextResponse.json(
      { message: "Receipt review is temporarily unavailable." },
      { status: 503 }
    );
  }

  let body: { receiptUrl?: unknown };
  try {
    body = (await request.json()) as { receiptUrl?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid receipt review request." }, { status: 400 });
  }

  const path =
    typeof body.receiptUrl === "string" ? parseWorkerReceiptStoragePath(body.receiptUrl) : null;
  if (!path)
    return NextResponse.json({ message: "Receipt reference is invalid." }, { status: 400 });

  const signedUrl = await createSignedStorageUrl(client, WORKER_RECEIPT_BUCKET, path, 300);
  if (!signedUrl) return NextResponse.json({ message: "Receipt is unavailable." }, { status: 404 });
  return NextResponse.json({ signedUrl }, { headers: { "Cache-Control": "no-store" } });
}
