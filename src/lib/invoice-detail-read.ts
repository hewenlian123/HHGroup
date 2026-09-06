import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectByIdWithClient, type Project } from "@/lib/projects-db";
import {
  getPaymentAttachmentPreviewUrl,
  getPaymentsReceivedByInvoiceId,
  type PaymentReceivedAttachment,
  type PaymentReceivedRow,
} from "@/lib/payments-received-db";
import { getDepositsByInvoiceId, type DepositRow } from "@/lib/deposits-db";
import type {
  InvoiceComputedStatus,
  InvoicePayment,
  InvoiceStatus,
  InvoiceWithDerived,
} from "@/lib/invoices-db";

type PaymentReceivedAttachmentWithPreview = PaymentReceivedAttachment & {
  previewUrl?: string | null;
};

export type InvoiceDetailPaymentReceived = Omit<PaymentReceivedRow, "attachments"> & {
  attachments: PaymentReceivedAttachmentWithPreview[];
};

export type InvoiceDetailData = {
  invoice: InvoiceWithDerived;
  payments: InvoicePayment[];
  paymentsReceived: InvoiceDetailPaymentReceived[];
  deposits: DepositRow[];
  project: Project | null;
};

export class InvoiceDetailLoadError extends Error {
  readonly detail: unknown;

  constructor(message: string, detail: unknown) {
    super(message);
    this.name = "InvoiceDetailLoadError";
    this.detail = detail;
  }
}

function toNum(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapInvoicePayment(row: Record<string, unknown>): InvoicePayment {
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
  supabase: SupabaseClient
): Promise<InvoiceDetailPaymentReceived[]> {
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
            console.error("[invoice-detail] failed to sign payment attachment preview", error);
            return { ...attachment, previewUrl: null };
          }
        })
      ),
    }))
  );
}

async function readInvoiceItems(supabase: SupabaseClient, invoiceId: string) {
  const result = await supabase
    .from("invoice_items")
    .select("id,invoice_id,description,quantity,qty,unit_price,amount")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (result.error) {
    throw new InvoiceDetailLoadError("Failed to load invoice items.", result.error);
  }
  if (result.data === null) {
    throw new InvoiceDetailLoadError(
      "Failed to load invoice items.",
      new Error("Invoice items read returned null data without an error.")
    );
  }
  return result.data as Array<Record<string, unknown>>;
}

async function readInvoicePayments(supabase: SupabaseClient, invoiceId: string) {
  const result = await supabase
    .from("invoice_payments")
    .select(
      "id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status, payment_received_id"
    )
    .eq("invoice_id", invoiceId);
  if (result.error) {
    throw new InvoiceDetailLoadError("Failed to load invoice payments.", result.error);
  }
  if (result.data === null) {
    throw new InvoiceDetailLoadError(
      "Failed to load invoice payments.",
      new Error("Invoice payments read returned null data without an error.")
    );
  }
  return result.data as Array<Record<string, unknown>>;
}

async function readInvoiceProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<Project | null> {
  if (!projectId) return null;
  try {
    return await getProjectByIdWithClient(supabase, projectId);
  } catch (error) {
    throw new InvoiceDetailLoadError("Failed to load invoice project.", error);
  }
}

async function readPaymentsReceived(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<PaymentReceivedRow[]> {
  try {
    const rows = await getPaymentsReceivedByInvoiceId(invoiceId, supabase);
    if (!Array.isArray(rows)) {
      throw new Error("Payments received read returned invalid data without an error.");
    }
    return rows;
  } catch (error) {
    throw new InvoiceDetailLoadError("Failed to load invoice payment records.", error);
  }
}

async function readDeposits(supabase: SupabaseClient, invoiceId: string): Promise<DepositRow[]> {
  try {
    const rows = await getDepositsByInvoiceId(invoiceId, supabase);
    if (!Array.isArray(rows)) {
      throw new Error("Invoice deposits read returned invalid data without an error.");
    }
    return rows;
  } catch (error) {
    throw new InvoiceDetailLoadError("Failed to load invoice deposits.", error);
  }
}

function settledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}

export async function loadInvoiceDetailWithClient(
  invoiceId: string,
  supabase: SupabaseClient
): Promise<InvoiceDetailData | null> {
  const invoiceResult = await supabase
    .from("invoices")
    .select(
      "id,project_id,customer_id,invoice_no,client_name,issue_date,due_date,status,total,notes,tax_pct,subtotal,tax_amount,created_at"
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceResult.error) {
    throw new InvoiceDetailLoadError("Failed to load invoice.", invoiceResult.error);
  }
  if (!invoiceResult.data) return null;

  const row = invoiceResult.data as Record<string, unknown>;
  const projectId = String(row.project_id ?? "");
  const [itemsResult, paymentsResult, projectResult, paymentsReceivedResult, depositsResult] =
    await Promise.allSettled([
      readInvoiceItems(supabase, invoiceId),
      readInvoicePayments(supabase, invoiceId),
      readInvoiceProject(supabase, projectId),
      readPaymentsReceived(supabase, invoiceId),
      readDeposits(supabase, invoiceId),
    ] as const);

  // Preserve the established source-priority error behavior while still starting every read together.
  const itemRows = settledValue(itemsResult);
  const paymentRows = settledValue(paymentsResult);
  const project = settledValue(projectResult);
  const paymentsReceivedRows = settledValue(paymentsReceivedResult);
  const deposits = settledValue(depositsResult);

  const statusRaw = String(row.status ?? "Draft");
  const status = (
    ["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(statusRaw) ? statusRaw : "Draft"
  ) as InvoiceStatus;
  const dueDate = String(row.due_date ?? "").slice(0, 10);
  const issueDate = String(row.issue_date ?? row.created_at ?? "").slice(0, 10);
  const lineItems = itemRows.map((item) => {
    const qty = toNum(item.quantity ?? item.qty);
    const unitPrice = toNum(item.unit_price);
    const computedAmount = qty * unitPrice;
    const storedAmount = toNum(item.amount);
    return {
      description: String(item.description ?? ""),
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

  const payments = paymentRows.map(mapInvoicePayment);
  const activePayments = paymentRows.filter((payment) => String(payment.status ?? "") !== "Voided");
  const paidTotal = activePayments.reduce((sum, payment) => sum + toNum(payment.amount), 0);
  const balanceDue = Math.max(0, total - paidTotal);
  const today = new Date().toISOString().slice(0, 10);
  const hasPayments = activePayments.length > 0;

  let computedStatus: InvoiceComputedStatus = "Unpaid";
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
    projectId,
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

  const paymentsReceived = await withPaymentAttachmentPreviewUrls(paymentsReceivedRows, supabase);

  return { invoice, payments, paymentsReceived, deposits, project };
}
