import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import {
  ExpenseReceiptManifestError,
  loadExpenseReceiptManifest,
} from "@/lib/expense-receipt-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** Accept Postgres uuid text (including fixed E2E seed ids that are not RFC variant-strict). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  noStore();
  const auth = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!auth.ok) return auth.response;

  const expenseId = (params.id ?? "").trim();
  if (!UUID_PATTERN.test(expenseId)) {
    return NextResponse.json(
      { ok: false, message: "Invalid expense." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const manifest = await loadExpenseReceiptManifest(expenseId, auth.client);
    return NextResponse.json(
      { ok: true, ...manifest },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status =
      error instanceof ExpenseReceiptManifestError && error.code === "not_configured" ? 503 : 404;
    return NextResponse.json(
      { ok: false, message: "Receipt preview is unavailable." },
      { status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
