import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { reverseWorkerPayment } from "@/lib/worker-payment-reversal-db";

export const dynamic = "force-dynamic";

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

/**
 * DELETE: execute the database-owned, atomic and idempotent payment reversal.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;

  const { id: paymentId } = await params;
  if (!paymentId?.trim()) {
    return NextResponse.json({ message: "Payment id required." }, { status: 400 });
  }

  try {
    const requestedKey = req.headers.get("idempotency-key")?.trim();
    const idempotencyKey = requestedKey || `worker-payment-reversal:${paymentId}`;
    const result = await reverseWorkerPayment(paymentId, idempotencyKey, guard.client);
    return withSessionCookies(NextResponse.json({ ok: true, ...result }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete payment.";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
