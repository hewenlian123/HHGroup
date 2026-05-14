import { NextResponse } from "next/server";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|could not find the .* column|schema cache/i.test(m);
}

function computeReceiptNo(paymentId: string, paymentDate: string): string {
  const ymd = (paymentDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  return `PR-${ymd}-${paymentId.slice(0, 8).toUpperCase()}`;
}

async function loadProject(
  c: NonNullable<ReturnType<typeof getServerSupabaseInternalNoStore>>,
  projectId: string | null | undefined
): Promise<{
  id: string;
  name?: string | null;
  customer_id?: string | null;
  client?: string | null;
  client_name?: string | null;
} | null> {
  if (!projectId) return null;
  let res = await c
    .from("projects")
    .select("id, name, customer_id, client, client_name")
    .eq("id", projectId)
    .maybeSingle();
  if (res.error && isMissingColumn(res.error)) {
    res = await c.from("projects").select("id, name").eq("id", projectId).maybeSingle();
  }
  if (res.error) return null;
  return (res.data ?? null) as {
    id: string;
    name?: string | null;
    customer_id?: string | null;
    client?: string | null;
    client_name?: string | null;
  } | null;
}

async function resolveRecipientEmail(
  c: NonNullable<ReturnType<typeof getServerSupabaseInternalNoStore>>,
  input: { customerId?: string | null; customerName?: string | null }
): Promise<string | null> {
  const customerId = input.customerId?.trim();
  if (customerId) {
    const byId = await c.from("customers").select("email").eq("id", customerId).maybeSingle();
    const email = (byId.data as { email?: string | null } | null)?.email?.trim();
    if (email) return email;
  }

  const name = input.customerName?.trim();
  if (!name) return null;
  const byName = await c.from("customers").select("email").eq("name", name).limit(1).maybeSingle();
  return ((byName.data as { email?: string | null } | null)?.email ?? "").trim() || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Payment id required." }, { status: 400 });
  }

  try {
    const c = getServerSupabaseInternalNoStore();
    if (!c) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

    const paymentRes = await c
      .from("payments_received")
      .select(
        "id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, status"
      )
      .eq("id", id)
      .maybeSingle();
    if (paymentRes.error) throw new Error(paymentRes.error.message ?? "Failed to load payment.");
    const payment = paymentRes.data as {
      id: string;
      invoice_id: string;
      project_id?: string | null;
      customer_name?: string | null;
      payment_date?: string | null;
      amount?: number | null;
      payment_method?: string | null;
      deposit_account?: string | null;
      notes?: string | null;
      status?: string | null;
    } | null;
    if (!payment || String(payment.status ?? "") === "void") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const invoiceRes = await c
      .from("invoices")
      .select("id, invoice_no, project_id, client_name, total")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    if (invoiceRes.error) throw new Error(invoiceRes.error.message ?? "Failed to load invoice.");
    const invoice = invoiceRes.data as {
      id: string;
      invoice_no?: string | null;
      project_id?: string | null;
      client_name?: string | null;
      total?: number | null;
    } | null;

    const project = await loadProject(c, payment.project_id || invoice?.project_id);
    const payRows = invoice
      ? await c
          .from("invoice_payments")
          .select("amount, status")
          .eq("invoice_id", payment.invoice_id)
      : { data: [], error: null };
    if (payRows.error) throw new Error(payRows.error.message ?? "Failed to load invoice balance.");

    const invoiceTotal = Number(invoice?.total ?? payment.amount ?? 0) || 0;
    const paidTotal = (
      (payRows.data ?? []) as Array<{ amount?: number | null; status?: string | null }>
    )
      .filter((row) => String(row.status ?? "Posted") !== "Voided")
      .reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0);
    const customerName =
      payment.customer_name?.trim() ||
      invoice?.client_name?.trim() ||
      project?.client_name?.trim() ||
      project?.client?.trim() ||
      "Customer";

    const [company, recipientEmail] = await Promise.all([
      fetchDocumentCompanyProfile(),
      resolveRecipientEmail(c, { customerId: project?.customer_id, customerName }),
    ]);

    const paymentDate = String(payment.payment_date ?? new Date().toISOString().slice(0, 10)).slice(
      0,
      10
    );
    const body: PaymentReceiptPreviewDto = {
      company,
      receiptNo: computeReceiptNo(payment.id, paymentDate),
      recipientEmail,
      payment: {
        id: payment.id,
        paymentDate,
        amount: Number(payment.amount ?? 0) || 0,
        paymentMethod: payment.payment_method ?? null,
        depositAccount: payment.deposit_account ?? null,
        notes: payment.notes ?? null,
      },
      invoice: {
        id: invoice?.id ?? payment.invoice_id,
        invoiceNo: invoice?.invoice_no ?? null,
        total: invoiceTotal,
        balanceAfterPayment: invoice ? Math.max(0, invoiceTotal - paidTotal) : 0,
      },
      customerName,
      projectName: project?.name ?? null,
    };

    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load receipt preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
