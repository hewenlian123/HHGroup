import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { getWorkerReceipts } from "@/lib/worker-receipts-db";
import { SUPABASE_MISSING_SERVER_ENV_MESSAGE, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { createSignedStorageUrl } from "@/lib/storage-signed-url";
import { parseWorkerReceiptStoragePath, WORKER_RECEIPT_BUCKET } from "@/lib/worker-receipt-storage";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const client = getServerSupabaseAdmin();
  if (!client) {
    return NextResponse.json(
      { message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const list = await getWorkerReceipts(client);
    const receipts = await Promise.all(
      list.map(async (receipt) => {
        const path = receipt.receiptUrl ? parseWorkerReceiptStoragePath(receipt.receiptUrl) : null;
        const signedUrl = path
          ? await createSignedStorageUrl(client, WORKER_RECEIPT_BUCKET, path, 300)
          : null;
        return { ...receipt, receiptUrl: signedUrl };
      })
    );
    return NextResponse.json({ receipts }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
