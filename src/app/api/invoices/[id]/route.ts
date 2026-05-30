import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { getServerSupabase } from "@/lib/supabase-server";
import { getProjectByIdWithClient } from "@/lib/projects-db";
import {
  getPaymentAttachmentPreviewUrl,
  getPaymentsReceivedByInvoiceId,
  type PaymentReceivedRow,
} from "@/lib/payments-received-db";
import { getDepositsByInvoiceId } from "@/lib/deposits-db";

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
  customerId?: string | null;
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

type InvoicePaymentForClient = {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  memo?: string;
  status?: "Posted" | "Voided";
  paymentReceivedId?: string | null;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function logInvoiceApiError(context: string, error: unknown) {
  console.error(`[api/invoices] ${context}`, error);
}

function safeInvoiceApiResponse(message: string, status = 500) {
  return NextResponse.json({ ok: false, message }, { status });
}

function mapInvoicePayment(row: Record<string, unknown>): InvoicePaymentForClient {
  const date = row.paid_at ?? row.payment_date ?? "";
  return {
    id: String(row.id ?? ""),
    invoiceId: String(row.invoice_id ?? ""),
    date: typeof date === "string" ? date.slice(0, 10) : "",
    amount: toNum(row.amount),
    method: String(row.method ?? ""),
    memo: row.memo ? String(row.memo) : row.reference ? String(row.reference) : undefined,
    status: String(row.status ?? "") === "Voided" ? "Voided" : "Posted",
    paymentReceivedId: row.payment_received_id ? String(row.payment_received_id) : null,
  };
}

async function withPaymentAttachmentPreviewUrls(
  payments: PaymentReceivedRow[],
  supabase: NonNullable<ReturnType<typeof getServerSupabaseAdmin>>
): Promise<PaymentReceivedRow[]> {
  return Promise.all(
    payments.map(async (payment) => ({
      ...payment,
      attachments: await Promise.all(
        (payment.attachments ?? []).map(async (attachment) => {
          try {
            return {
              ...attachment,
              previewUrl: await getPaymentAttachmentPreviewUrl(attachment, supabase),
            };
          } catch (error) {
            logInvoiceApiError("failed to sign payment attachment preview", error);
            return { ...attachment, previewUrl: null };
          }
        })
      ),
    }))
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(_req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing invoice id." }, { status: 400 });
  try {
    const admin = getServerSupabaseAdmin();
    const server = getServerSupabase();
    const supabase = admin ?? server ?? (await createServerSupabaseClient());
    if (!supabase)
      return NextResponse.json(
        { ok: false, message: "Supabase is not configured." },
        { status: 500 }
      );
    const invRes = await supabase
      .from("invoices")
      .select(
        "id,project_id,customer_id,invoice_no,client_name,issue_date,due_date,status,total,notes,tax_pct,subtotal,tax_amount,created_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (invRes.error) {
      logInvoiceApiError("failed to load invoice", invRes.error);
      return safeInvoiceApiResponse("Failed to load invoice.");
    }
    if (!invRes.data)
      return NextResponse.json({ ok: false, message: "Invoice not found." }, { status: 404 });

    const itemsRes = await supabase
      .from("invoice_items")
      .select("id,invoice_id,description,quantity,qty,unit_price,amount")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });
    if (itemsRes.error) {
      logInvoiceApiError("failed to load invoice items", itemsRes.error);
      return safeInvoiceApiResponse("Failed to load invoice items.");
    }

    const paysRes = await supabase
      .from("invoice_payments")
      .select(
        "id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status, payment_received_id"
      )
      .eq("invoice_id", id);
    if (paysRes.error) {
      logInvoiceApiError("failed to load invoice payments", paysRes.error);
      return safeInvoiceApiResponse("Failed to load invoice payments.");
    }

    const row = invRes.data as Record<string, unknown>;
    const statusRaw = String(row.status ?? "Draft");
    const status = (
      ["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(statusRaw) ? statusRaw : "Draft"
    ) as InvoiceWithDerived["status"];
    const dueDate = String(row.due_date ?? "").slice(0, 10);
    const issueDate = String(row.issue_date ?? row.created_at ?? "").slice(0, 10);
    const lineItems: InvoiceLineItem[] = (
      (itemsRes.data ?? []) as Array<Record<string, unknown>>
    ).map((r) => {
      const qty = toNum(r.quantity ?? r.qty);
      const unitPrice = toNum(r.unit_price);
      const computedAmount = qty * unitPrice;
      const storedAmount = toNum(r.amount);
      return {
        description: String(r.description ?? ""),
        qty,
        unitPrice,
        amount: Math.abs(storedAmount - computedAmount) > 0.005 ? computedAmount : storedAmount,
      };
    });
    const hasLineItems = lineItems.length > 0;
    const taxPct = toNum(row.tax_pct);
    const subtotal = hasLineItems
      ? lineItems.reduce((sum, item) => sum + item.amount, 0)
      : toNum(row.subtotal ?? row.total);
    const taxAmount = hasLineItems
      ? Math.round(subtotal * (taxPct / 100) * 100) / 100
      : toNum(row.tax_amount);
    const total = hasLineItems ? subtotal + taxAmount : toNum(row.total);

    const paidTotal = ((paysRes.data ?? []) as Array<Record<string, unknown>>)
      .filter((p) => String(p.status ?? "") !== "Voided")
      .reduce((s, p) => s + toNum(p.amount), 0);
    const balanceDue = Math.max(0, total - paidTotal);
    const today = new Date().toISOString().slice(0, 10);
    const hasPayments =
      ((paysRes.data ?? []) as Array<Record<string, unknown>>).filter(
        (p) => String(p.status ?? "") !== "Voided"
      ).length > 0;

    let computedStatus: InvoiceWithDerived["computedStatus"] = "Unpaid";
    let daysOverdue = 0;
    if (status === "Void") {
      computedStatus = "Void";
    } else if (status === "Draft") {
      computedStatus = "Draft";
      if (balanceDue > 0 && dueDate && dueDate < today) {
        daysOverdue = Math.max(
          0,
          Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000))
        );
      }
    } else if (balanceDue === 0) {
      computedStatus = "Paid";
    } else if (dueDate && dueDate < today) {
      computedStatus = "Overdue";
      daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000))
      );
    } else if (hasPayments) {
      computedStatus = "Partial";
    } else {
      computedStatus = "Unpaid";
    }

    const invoice: InvoiceWithDerived = {
      id: String(row.id ?? ""),
      invoiceNo: String(row.invoice_no ?? String(row.id ?? "").slice(0, 8)),
      projectId: String(row.project_id ?? ""),
      customerId: row.customer_id ? String(row.customer_id) : null,
      clientName: String(row.client_name ?? ""),
      issueDate,
      dueDate,
      status,
      lineItems,
      subtotal,
      taxPct: taxPct || undefined,
      taxAmount: taxAmount || undefined,
      total,
      notes: row.notes ? String(row.notes) : undefined,
      paidTotal,
      balanceDue,
      computedStatus,
      daysOverdue,
    };

    const [projectResult, paymentsReceivedResult, depositsResult] = await Promise.allSettled([
      invoice.projectId ? getProjectByIdWithClient(supabase, invoice.projectId) : null,
      getPaymentsReceivedByInvoiceId(id, supabase),
      getDepositsByInvoiceId(id, supabase),
    ]);

    if (projectResult.status === "rejected") {
      logInvoiceApiError("failed to load invoice project", projectResult.reason);
      return safeInvoiceApiResponse("Failed to load invoice project.");
    }
    if (paymentsReceivedResult.status === "rejected") {
      logInvoiceApiError("failed to load payments received", paymentsReceivedResult.reason);
      return safeInvoiceApiResponse("Failed to load invoice payment records.");
    }
    if (depositsResult.status === "rejected") {
      logInvoiceApiError("failed to load invoice deposits", depositsResult.reason);
      return safeInvoiceApiResponse("Failed to load invoice deposits.");
    }

    const paymentsReceived = await withPaymentAttachmentPreviewUrls(
      paymentsReceivedResult.value,
      supabase
    );

    return NextResponse.json({
      ok: true,
      invoice,
      payments: ((paysRes.data ?? []) as Array<Record<string, unknown>>).map(mapInvoicePayment),
      paymentsReceived,
      deposits: depositsResult.value,
      project: projectResult.value,
    });
  } catch (e) {
    logInvoiceApiError("unexpected invoice load error", e);
    return safeInvoiceApiResponse("Failed to load invoice.");
  }
}

type PatchBody = { action?: string };

/**
 * Void invoice (server-side). Allows transition from any non-Void stored status
 * (Draft, Sent, Partially Paid, Paid — including rows whose computed UI status is Unpaid / Overdue / Partial).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing invoice id." }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  if (body.action !== "void") {
    return NextResponse.json({ ok: false, message: "Unsupported action." }, { status: 400 });
  }

  try {
    const admin = getServerSupabaseAdmin();
    const server = getServerSupabase();
    const supabase = admin ?? server ?? (await createServerSupabaseClient());
    if (!supabase) {
      return NextResponse.json(
        { ok: false, message: "Supabase is not configured." },
        { status: 500 }
      );
    }
    if (!admin && !server) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ ok: false, message: "You must be signed in." }, { status: 401 });
      }
    }

    const invRes = await supabase.from("invoices").select("id, status").eq("id", id).maybeSingle();
    if (invRes.error) {
      logInvoiceApiError("failed to load invoice before void", invRes.error);
      return safeInvoiceApiResponse("Failed to load invoice.");
    }
    if (!invRes.data) {
      return NextResponse.json({ ok: false, message: "Invoice not found." }, { status: 404 });
    }

    const status = String((invRes.data as { status?: string }).status ?? "");
    if (status === "Void") {
      return NextResponse.json({ ok: true, message: "Already void." });
    }

    const { data: updated, error: updErr } = await supabase
      .from("invoices")
      .update({
        status: "Void",
        total: 0,
        subtotal: 0,
        tax_amount: 0,
        paid_total: 0,
        balance_due: 0,
      })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (updErr) {
      logInvoiceApiError("failed to void invoice", updErr);
      return safeInvoiceApiResponse("Failed to void invoice.");
    }
    if (!updated) {
      return safeInvoiceApiResponse("Invoice was not updated. Refresh and try again.", 409);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    logInvoiceApiError("unexpected invoice void error", e);
    return safeInvoiceApiResponse("Failed to void invoice.");
  }
}
