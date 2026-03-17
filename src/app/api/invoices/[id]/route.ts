import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type InvoiceLineItem = {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

type InvoiceWithDerived = {
  id: string;
  invoiceNo: string;
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: "Draft" | "Sent" | "Partially Paid" | "Paid" | "Void";
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxPct?: number;
  taxAmount?: number;
  total: number;
  notes?: string;
  paidTotal: number;
  balanceDue: number;
  computedStatus: "Draft" | "Void" | "Paid" | "Partial" | "Unpaid" | "Overdue";
  daysOverdue: number;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing invoice id." }, { status: 400 });
  try {
    // Prefer admin client when available; otherwise use server client (anon/service role),
    // and only fall back to cookie-auth client if needed.
    const admin = getServerSupabaseAdmin();
    const server = getServerSupabase();
    const supabase = admin ?? server ?? (await createServerSupabaseClient());
    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
    // If we're using cookie-auth client (not admin, not server client), require login.
    if (!admin && !server) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return NextResponse.json({ ok: false, message: "You must be signed in." }, { status: 401 });
    }

    const invRes = await supabase
      .from("invoices")
      .select("id,project_id,invoice_no,client_name,issue_date,due_date,status,total,notes,tax_pct,subtotal,tax_amount,created_at")
      .eq("id", id)
      .maybeSingle();
    if (invRes.error) return NextResponse.json({ ok: false, message: invRes.error.message ?? "Failed to load invoice." }, { status: 500 });
    if (!invRes.data) return NextResponse.json({ ok: false, message: "Invoice not found." }, { status: 404 });

    const itemsRes = await supabase
      .from("invoice_items")
      .select("id,invoice_id,description,quantity,qty,unit_price,amount")
      .eq("invoice_id", id);
    if (itemsRes.error) return NextResponse.json({ ok: false, message: itemsRes.error.message ?? "Failed to load invoice items." }, { status: 500 });

    const paysRes = await supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status")
      .eq("invoice_id", id);
    if (paysRes.error) return NextResponse.json({ ok: false, message: paysRes.error.message ?? "Failed to load invoice payments." }, { status: 500 });

    const row = invRes.data as Record<string, unknown>;
    const statusRaw = String(row.status ?? "Draft");
    const status = (["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(statusRaw) ? statusRaw : "Draft") as InvoiceWithDerived["status"];
    const dueDate = String(row.due_date ?? "").slice(0, 10);
    const issueDate = String(row.issue_date ?? row.created_at ?? "").slice(0, 10);
    const total = toNum(row.total);
    const subtotal = toNum(row.subtotal ?? row.total);

    const lineItems: InvoiceLineItem[] = ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      description: String(r.description ?? ""),
      qty: toNum(r.quantity ?? r.qty),
      unitPrice: toNum(r.unit_price),
      amount: toNum(r.amount),
    }));

    const paidTotal = ((paysRes.data ?? []) as Array<Record<string, unknown>>)
      .filter((p) => String(p.status ?? "") !== "Voided")
      .reduce((s, p) => s + toNum(p.amount), 0);
    const balanceDue = Math.max(0, total - paidTotal);
    const today = new Date().toISOString().slice(0, 10);
    const hasPayments = ((paysRes.data ?? []) as Array<Record<string, unknown>>).filter((p) => String(p.status ?? "") !== "Voided").length > 0;

    let computedStatus: InvoiceWithDerived["computedStatus"] = "Unpaid";
    let daysOverdue = 0;
    if (status === "Void") {
      computedStatus = "Void";
    } else if (status === "Draft") {
      computedStatus = "Draft";
      if (balanceDue > 0 && dueDate && dueDate < today) {
        daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)));
      }
    } else if (balanceDue === 0) {
      computedStatus = "Paid";
    } else if (dueDate && dueDate < today) {
      computedStatus = "Overdue";
      daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)));
    } else if (hasPayments) {
      computedStatus = "Partial";
    } else {
      computedStatus = "Unpaid";
    }

    const invoice: InvoiceWithDerived = {
      id: String(row.id ?? ""),
      invoiceNo: String(row.invoice_no ?? String(row.id ?? "").slice(0, 8)),
      projectId: String(row.project_id ?? ""),
      clientName: String(row.client_name ?? ""),
      issueDate,
      dueDate,
      status,
      lineItems,
      subtotal,
      taxPct: toNum(row.tax_pct) || undefined,
      taxAmount: toNum(row.tax_amount) || undefined,
      total,
      notes: row.notes ? String(row.notes) : undefined,
      paidTotal,
      balanceDue,
      computedStatus,
      daysOverdue,
    };

    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load invoice.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

