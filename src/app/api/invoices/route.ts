import { NextResponse } from "next/server";
import { getInvoices } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices
 * Returns invoice list for health check and API consumers.
 */
export async function GET() {
  try {
    const invoices = await getInvoices();
    return NextResponse.json({ ok: true, invoices });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load invoices.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
