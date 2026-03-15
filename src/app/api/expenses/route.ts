import { NextResponse } from "next/server";
import { getExpenses } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/expenses
 * Returns expense list for health check and API consumers.
 */
export async function GET() {
  try {
    const expenses = await getExpenses();
    return NextResponse.json({ ok: true, expenses });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load expenses.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
