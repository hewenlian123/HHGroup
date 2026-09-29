import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { processInboxOcrBatch, retryInboxOcr } from "@/lib/expense-inbox-ocr-job";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdminWithClient(
    request,
    getServerSupabaseInternalNoStore
  );
  if (!guard.ok) return guard.response;
  if (!guard.client) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503 }
    );
  }
  const expenseId = params.id?.trim();
  if (!expenseId) {
    return NextResponse.json({ ok: false, message: "Expense id is required." }, { status: 400 });
  }
  try {
    await retryInboxOcr(guard.client, expenseId);
    const result = await processInboxOcrBatch(guard.client, 1);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not retry OCR.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
