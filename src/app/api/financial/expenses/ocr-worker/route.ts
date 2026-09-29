import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { processInboxOcrBatch } from "@/lib/expense-inbox-ocr-job";
import { SUPABASE_MISSING_SERVER_ENV_MESSAGE } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_CACHE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  if (!guard.client) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503, headers: NO_CACHE }
    );
  }

  const depth = Number(request.headers.get("x-ocr-chain-depth") ?? "0");
  try {
    const result = await processInboxOcrBatch(guard.client, 1);
    if (result.remaining > 0 && result.processed > 0 && depth < 30) {
      const url = new URL("/api/financial/expenses/ocr-worker", request.url);
      void fetch(url, {
        method: "POST",
        headers: {
          cookie: request.headers.get("cookie") ?? "",
          "x-ocr-chain-depth": String(depth + 1),
          "content-type": "application/json",
        },
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, ...result }, { headers: NO_CACHE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR worker failed.";
    return NextResponse.json({ ok: false, message }, { status: 500, headers: NO_CACHE });
  }
}
