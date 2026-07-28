import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { normalizeReceiptLocation } from "@/lib/expense-receipt-reference";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_SECONDS = 300;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireSupabaseOwnerOrAdmin(request);
  if (!auth.ok) return auth.response;
  const id = (params.id ?? "").trim();
  if (!UUID_PATTERN.test(id)) {
    return response({ ok: false, message: "Receipt preview is unavailable." }, 400);
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) return response({ ok: false, message: "Receipt preview is unavailable." }, 503);
  const { data: row, error } = await admin
    .from("receipt_queue")
    .select("id, storage_path, receipt_public_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return response({ ok: false, message: "Receipt preview is unavailable." }, 404);
  }
  const location = normalizeReceiptLocation(
    String(row.storage_path ?? row.receipt_public_url ?? "")
  );
  if (!location) {
    return response({ ok: false, message: "Receipt preview is unavailable." }, 404);
  }
  const { data, error: signError } = await admin.storage
    .from(location.bucket)
    .createSignedUrl(location.path, TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    return response({ ok: false, message: "Receipt preview is unavailable." }, 404);
  }
  return response({
    ok: true,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  });
}
