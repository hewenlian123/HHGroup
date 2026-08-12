import { NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import {
  generateWorkerPaymentReceiptPrintPdfBuffer,
  workerPaymentReceiptPrintPdfFilename,
} from "@/lib/worker-payment-receipt-print-pdf";
import { resolveServerAppOrigin } from "@/lib/server-app-origin";
import { getServerSupabaseAdminNoStore } from "@/lib/supabase-server";
import { getWorkerPaymentByIdWithClient } from "@/lib/worker-payments-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireSupabaseOwnerOrAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await ctx.params;
  const paymentId = rawId?.trim();
  if (!paymentId) {
    return NextResponse.json({ ok: false, message: "Missing payment id." }, { status: 400 });
  }

  const supabase = getServerSupabaseAdminNoStore();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const payment = await getWorkerPaymentByIdWithClient(supabase, paymentId);
  if (!payment) {
    return NextResponse.json({ ok: false, message: "Payment not found." }, { status: 404 });
  }

  try {
    const pdfBuffer = await generateWorkerPaymentReceiptPrintPdfBuffer({
      paymentId,
      origin: resolveServerAppOrigin(request),
      cookieHeader: request.headers.get("cookie"),
    });
    const receiptNo = await computeWorkerPaymentReceiptNo(
      payment.id,
      payment.paymentDate,
      supabase
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${workerPaymentReceiptPrintPdfFilename(
          receiptNo
        )}"`,
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PDF generation failed.";
    console.error("[worker-payment-receipt-pdf]", paymentId, error);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
