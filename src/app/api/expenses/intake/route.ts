import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const rawAmount = new URL(request.url).searchParams.get("amount");
  const amount = rawAmount?.trim() ? Number(rawAmount) : NaN;
  if (!Number.isFinite(amount) || amount < 0)
    return NextResponse.json({ message: "Invalid amount." }, { status: 400, headers });
  const result = await guard.client
    .from("expenses")
    .select("id,vendor_name,expense_date,total", { count: "exact" })
    .eq("total", amount)
    .neq("status", "draft")
    .order("expense_date", { ascending: false })
    .limit(100);
  if (result.error)
    return NextResponse.json(
      { message: "Matching transactions unavailable." },
      { status: 503, headers }
    );
  return NextResponse.json({ expenses: result.data, total: result.count }, { headers });
}
export async function POST(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !uuid.test(String(body.receiptId)) ||
    (body.expenseId != null && !uuid.test(String(body.expenseId)))
  )
    return NextResponse.json({ message: "Invalid receipt identity." }, { status: 400, headers });
  const result = await guard.client.rpc("finalize_receipt_queue_operation", {
    p_receipt_id: body.receiptId,
    p_expense_id: body.expenseId ?? null,
  });
  if (result.error)
    return NextResponse.json({ message: result.error.message }, { status: 409, headers });
  return NextResponse.json(result.data, { headers });
}
