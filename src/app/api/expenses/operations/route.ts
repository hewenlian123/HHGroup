import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { readCompleteRows } from "@/lib/read-complete-rows";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const [states, issues] = await Promise.all([
      readCompleteRows(
        () => guard.client.from("expense_operations").select("*", { count: "exact" }),
        "Expense review",
        "expense_id"
      ),
      readCompleteRows(
        () =>
          guard.client
            .from("expense_review_issues")
            .select("id,expense_id,kind", { count: "exact" })
            .is("resolved_at", null),
        "Open review issues"
      ),
    ]);
    return NextResponse.json({ states: states.data, issues: issues.data }, { headers });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Expense review unavailable." },
      { status: 503, headers }
    );
  }
}
