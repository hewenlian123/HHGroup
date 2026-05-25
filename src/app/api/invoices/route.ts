import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getInvoices } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices
 * Returns invoice list for health check and API consumers.
 */
export async function GET(req: Request) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  try {
    const invoices = await getInvoices();
    return NextResponse.json({ ok: true, invoices });
  } catch (e) {
    console.error("[api/invoices] failed to load invoices", e);
    return NextResponse.json({ ok: false, message: "Failed to load invoices." }, { status: 500 });
  }
}
