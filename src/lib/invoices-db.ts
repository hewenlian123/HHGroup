/**
 * Invoices + invoice_items + invoice_payments — Supabase only. No mock data.
 * Tables: invoices, invoice_items, invoice_payments.
 */

import { getSupabaseClient } from "@/lib/supabase";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Void";

/** Display status for invoice aging. */
export type InvoiceComputedStatus = "Draft" | "Void" | "Paid" | "Partial" | "Unpaid" | "Overdue";

export type InvoiceLineItem = {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

export type Invoice = {
  id: string;
  invoiceNo: string;
  projectId: string;
  customerId?: string | null;
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxPct?: number;
  taxAmount?: number;
  total: number;
  notes?: string;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  memo?: string;
  status?: "Posted" | "Voided";
  paymentReceivedId?: string | null;
};

export type InvoiceDeleteDependencyType =
  | "invoice_status"
  | "invoice_payment"
  | "payment_received"
  | "deposit"
  | "estimate_payment_schedule_item"
  | "project_ar";

export type InvoiceDeleteDependency = {
  id: string;
  type: InvoiceDeleteDependencyType;
  label: string;
  description?: string;
  amount?: number | null;
  date?: string | null;
  status?: string | null;
  href?: string | null;
  estimateId?: string | null;
  scheduleItemId?: string | null;
};

export type InvoiceDeleteSafeChildRecord = {
  type: "invoice_items";
  label: string;
  count: number;
};

export type InvoiceDeleteWarning = {
  type: string;
  label: string;
  description?: string;
};

export type InvoiceDeleteDependenciesResult = {
  invoiceId: string;
  invoiceNo?: string | null;
  status?: string | null;
  projectId?: string | null;
  canDelete: boolean;
  blockers: InvoiceDeleteDependency[];
  warnings: InvoiceDeleteWarning[];
  safeChildRecords: InvoiceDeleteSafeChildRecord[];
};

type InvoiceRow = {
  id: string;
  invoice_no?: string;
  project_id: string | null;
  customer_id?: string | null;
  client_name: string;
  issue_date?: string;
  created_at?: string;
  due_date: string;
  status: string;
  notes?: string | null;
  tax_pct?: number;
  subtotal?: number;
  tax_amount?: number;
  total: number;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity?: number;
  qty?: number;
  unit_price: number;
  amount: number;
};

type InvoicePaymentRow = {
  id: string;
  invoice_id: string;
  paid_at?: string;
  payment_date?: string;
  amount: number;
  method: string | null;
  memo?: string | null;
  reference?: string | null;
  status?: string;
  payment_received_id?: string | null;
};

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "no-store",
  });

function client(explicitClient?: SupabaseClient): SupabaseClient {
  if (explicitClient) return explicitClient;
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) throw new Error("Supabase is not configured.");
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: noStoreFetch },
    });
  }
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isNetworkError(err: { message?: string } | null): boolean {
  if (!err) return false;
  const m = (typeof err === "string" ? err : (err?.message ?? "")).toLowerCase();
  return /failed to fetch|network error|load failed|connection|timeout|unable to connect/i.test(m);
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|could not find the .* column|schema cache/i.test(m);
}

function normalizeReceivableStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function invoiceCountsTowardReceivable(status: string | null | undefined): boolean {
  const normalized = normalizeReceivableStatus(status);
  return (
    normalized !== "draft" &&
    normalized !== "void" &&
    normalized !== "voided" &&
    normalized !== "cancelled" &&
    normalized !== "canceled"
  );
}

async function deleteRowsByInvoiceIds(
  c: ReturnType<typeof client>,
  table: string,
  column: string,
  invoiceIds: string[]
): Promise<void> {
  if (invoiceIds.length === 0) return;
  const { error } = await c.from(table).delete().in(column, invoiceIds);
  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return;
    throw new Error(error.message ?? `Failed to delete ${table}.`);
  }
}

function isVoidInvoiceStatus(status: string | null | undefined): boolean {
  const normalized = normalizeReceivableStatus(status);
  return normalized === "void" || normalized === "voided";
}

function isoDateLike(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text ? text.slice(0, 10) : null;
}

/** Avoid appending migration HINT to connection/network errors. */
function throwInvoiceError(error: { message?: string } | null, fallbackHint: string): never {
  const msg = error?.message ?? "";
  if (isNetworkError(error))
    throw new Error(msg || "Network error. Check connection and Supabase URL.");
  throw new Error(msg ? `${msg} ${fallbackHint}` : fallbackHint);
}

const HINT = "Run supabase/migrations/202602280009_create_invoices.sql";

function toLineItem(r: InvoiceItemRow): InvoiceLineItem {
  const q = Number(r.quantity ?? r.qty) || 0;
  const unitPrice = Number(r.unit_price) || 0;
  const computedAmount = q * unitPrice;
  const storedAmount = Number(r.amount) || 0;
  return {
    description: r.description ?? "",
    qty: q,
    unitPrice,
    amount: Math.abs(storedAmount - computedAmount) > 0.005 ? computedAmount : storedAmount,
  };
}

function normalizeInvoiceStatus(raw: string | undefined | null): InvoiceStatus {
  const s = (raw ?? "").trim();
  if (["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(s)) return s as InvoiceStatus;
  const lower = s.toLowerCase();
  if (lower === "draft") return "Draft";
  if (lower === "sent") return "Sent";
  if (lower === "partially paid" || lower === "partial") return "Partially Paid";
  if (lower === "paid") return "Paid";
  if (lower === "void") return "Void";
  return "Draft";
}

function toInvoice(row: InvoiceRow, items: InvoiceItemRow[]): Invoice {
  const status = normalizeInvoiceStatus(row.status);
  const dueDate =
    row.due_date?.slice?.(0, 10) ?? (typeof row.due_date === "string" ? row.due_date : "");
  const issueDate = row.issue_date?.slice?.(0, 10) ?? row.created_at?.slice?.(0, 10) ?? "";
  const lineItems = items.map(toLineItem);
  const hasLineItems = lineItems.length > 0;
  const taxPct = Number(row.tax_pct) || 0;
  const subtotal = hasLineItems
    ? lineItems.reduce((sum, item) => sum + item.amount, 0)
    : Number(row.subtotal ?? row.total) || 0;
  const taxAmount = hasLineItems
    ? Math.round(subtotal * (taxPct / 100) * 100) / 100
    : Number(row.tax_amount) || 0;
  const total = hasLineItems ? subtotal + taxAmount : Number(row.total) || 0;
  return {
    id: row.id,
    invoiceNo: row.invoice_no ?? row.id.slice(0, 8),
    projectId: row.project_id ?? "",
    customerId: row.customer_id ?? null,
    clientName: row.client_name ?? "",
    issueDate,
    dueDate,
    status,
    lineItems,
    subtotal,
    taxPct: taxPct || undefined,
    taxAmount: taxAmount || undefined,
    total,
    notes: row.notes ?? undefined,
  };
}

function toPayment(r: InvoicePaymentRow): InvoicePayment {
  const date = r.paid_at ?? r.payment_date ?? "";
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    date: typeof date === "string" ? date.slice(0, 10) : "",
    amount: Number(r.amount) || 0,
    method: r.method ?? "",
    memo: r.memo ?? r.reference ?? undefined,
    status: r.status === "Voided" ? "Voided" : "Posted",
    paymentReceivedId: r.payment_received_id ?? null,
  };
}

async function getInvoiceItemsOrEmpty(
  invoiceId: string,
  explicitClient?: SupabaseClient
): Promise<InvoiceItemRow[]> {
  const c = client(explicitClient);
  const itemRes = await c
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (itemRes.error) {
    if (isMissingTable(itemRes.error)) return [];
    throw new Error(itemRes.error.message ?? "Failed to load invoice items.");
  }
  return (itemRes.data ?? []) as InvoiceItemRow[];
}

/** Select columns; paid/balance are computed from invoice_payments, not stored. */
const INVOICE_COLS =
  "id,project_id,customer_id,invoice_no,client_name,issue_date,due_date,status,total,notes,tax_pct,subtotal,tax_amount,created_at,updated_at";

export async function getInvoices(explicitClient?: SupabaseClient): Promise<Invoice[]> {
  const c = client(explicitClient);
  const { data: rows, error } = await c
    .from("invoices")
    .select(INVOICE_COLS)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new Error(`invoices: table not found. ${HINT}`);
    throwInvoiceError(error, HINT);
  }
  const list = (rows ?? []) as InvoiceRow[];
  const invoiceIds = list.map((r) => r.id).filter(Boolean);

  const itemsByInvoiceId = new Map<string, InvoiceItemRow[]>();
  if (invoiceIds.length) {
    const itemsRes = await c.from("invoice_items").select("*").in("invoice_id", invoiceIds);
    if (itemsRes.error) {
      if (!isMissingTable(itemsRes.error)) {
        throw new Error(itemsRes.error.message ?? "Failed to load invoice items.");
      }
    } else {
      for (const it of (itemsRes.data ?? []) as InvoiceItemRow[]) {
        const key = it.invoice_id;
        const arr = itemsByInvoiceId.get(key) ?? [];
        arr.push(it);
        itemsByInvoiceId.set(key, arr);
      }
    }
  }

  return list.map((r) => toInvoice(r as InvoiceRow, itemsByInvoiceId.get(r.id) ?? []));
}

export async function getInvoiceById(
  id: string,
  explicitClient?: SupabaseClient
): Promise<Invoice | null> {
  const c = client(explicitClient);
  const { data: row, error } = await c
    .from("invoices")
    .select(INVOICE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    if (error && isMissingTable(error)) throw new Error(`invoices: table not found. ${HINT}`);
    if (error && isNetworkError(error))
      throw new Error(error.message ?? "Network error. Check connection and Supabase URL.");
    return null;
  }
  const itemRows = await getInvoiceItemsOrEmpty(id, explicitClient);
  return toInvoice(row as InvoiceRow, itemRows);
}

export async function getInvoicePayments(
  explicitClient?: SupabaseClient
): Promise<InvoicePayment[]> {
  const c = client(explicitClient);
  const { data: rows, error } = await c
    .from("invoice_payments")
    .select(
      "id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status, payment_received_id"
    )
    .order("payment_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new Error(`invoice_payments: table not found. ${HINT}`);
    throwInvoiceError(error, "Failed to load invoice_payments.");
  }
  return ((rows ?? []) as InvoicePaymentRow[]).map(toPayment);
}

export async function getPaymentsByInvoiceId(
  invoiceId: string,
  explicitClient?: SupabaseClient
): Promise<InvoicePayment[]> {
  const c = client(explicitClient);
  const fullCols =
    "id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status, payment_received_id";
  let { data: rows, error } = await c
    .from("invoice_payments")
    .select(fullCols)
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });
  if (error && isMissingColumn(error)) {
    const fb = await c
      .from("invoice_payments")
      .select("id, invoice_id, amount, paid_at, method, memo, status")
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false });
    rows = fb.data as typeof rows;
    error = fb.error;
  }
  if (error && !isMissingColumn(error)) return [];
  return ((rows ?? []) as InvoicePaymentRow[]).map(toPayment);
}

function computeDerived(
  inv: Invoice,
  payments: InvoicePayment[]
): {
  paidTotal: number;
  balanceDue: number;
  computedStatus: InvoiceComputedStatus;
  daysOverdue: number;
} {
  const paidTotal = payments.filter((p) => p.status !== "Voided").reduce((s, p) => s + p.amount, 0);
  const balanceDue = Math.max(0, inv.total - paidTotal);
  const today = new Date().toISOString().slice(0, 10);
  const hasPayments = payments.filter((p) => p.status !== "Voided").length > 0;

  if (inv.status === "Void")
    return { paidTotal, balanceDue, computedStatus: "Void", daysOverdue: 0 };
  if (inv.status === "Draft") {
    // Payments may exist before status is flipped to Sent (or mark-sent failed); still show AR correctly.
    if (balanceDue === 0 && hasPayments)
      return { paidTotal, balanceDue, computedStatus: "Paid", daysOverdue: 0 };
    if (hasPayments && balanceDue > 0) {
      if (inv.dueDate < today) {
        const daysOverdue = Math.max(
          0,
          Math.floor(
            (new Date().getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000)
          )
        );
        return { paidTotal, balanceDue, computedStatus: "Overdue", daysOverdue };
      }
      return { paidTotal, balanceDue, computedStatus: "Partial", daysOverdue: 0 };
    }
    const daysOverdue =
      balanceDue > 0 && inv.dueDate < today
        ? Math.max(
            0,
            Math.floor(
              (new Date().getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000)
            )
          )
        : 0;
    return { paidTotal, balanceDue, computedStatus: "Draft", daysOverdue };
  }
  if (balanceDue === 0) return { paidTotal, balanceDue, computedStatus: "Paid", daysOverdue: 0 };
  if (inv.dueDate < today) {
    const daysOverdue = Math.max(
      0,
      Math.floor((new Date().getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000))
    );
    return { paidTotal, balanceDue, computedStatus: "Overdue", daysOverdue };
  }
  if (hasPayments) return { paidTotal, balanceDue, computedStatus: "Partial", daysOverdue: 0 };
  return { paidTotal, balanceDue, computedStatus: "Unpaid", daysOverdue: 0 };
}

export interface InvoiceWithDerived extends Invoice {
  paidTotal: number;
  balanceDue: number;
  computedStatus: InvoiceComputedStatus;
  daysOverdue: number;
}

export async function getInvoicesWithDerived(
  filters?: {
    status?: InvoiceStatus | InvoiceComputedStatus;
    projectId?: string;
    search?: string;
  },
  explicitClient?: SupabaseClient
): Promise<InvoiceWithDerived[]> {
  const list = await getInvoices(explicitClient);
  const payments = await getInvoicePayments(explicitClient);
  let withDerived: InvoiceWithDerived[] = list.map((inv) => {
    const invPayments = payments.filter((p) => p.invoiceId === inv.id);
    const { paidTotal, balanceDue, computedStatus, daysOverdue } = computeDerived(inv, invPayments);
    return { ...inv, paidTotal, balanceDue, computedStatus, daysOverdue };
  });
  if (filters?.status) withDerived = withDerived.filter((i) => i.computedStatus === filters.status);
  if (filters?.projectId)
    withDerived = withDerived.filter((i) => i.projectId === filters.projectId);
  if (filters?.search?.trim()) {
    const q = filters.search.toLowerCase();
    withDerived = withDerived.filter(
      (i) =>
        i.invoiceNo.toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        (i.projectId ?? "").toLowerCase().includes(q)
    );
  }
  withDerived.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return withDerived;
}

export async function getInvoicesWithDerivedPaged(
  input?: {
    page?: number;
    pageSize?: number;
    status?: InvoiceStatus | InvoiceComputedStatus;
    projectId?: string;
    search?: string;
  },
  explicitClient?: SupabaseClient
): Promise<{ rows: InvoiceWithDerived[]; total: number }> {
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input?.pageSize ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const c = client(explicitClient);

  // Query invoices page (server-side filters where possible)
  let invQ = c
    .from("invoices")
    .select(INVOICE_COLS, { count: "exact" })
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (input?.projectId) invQ = invQ.eq("project_id", input.projectId);
  if (input?.search?.trim()) {
    const q = input.search.trim();
    // PostgREST OR filter across a few columns; keep it simple.
    invQ = invQ.or(`invoice_no.ilike.%${q}%,client_name.ilike.%${q}%`);
  }
  if (
    input?.status &&
    ["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(input.status as string)
  ) {
    invQ = invQ.eq("status", input.status as InvoiceStatus);
  }

  const invRes = await invQ.range(from, to);
  if (invRes.error) {
    if (isMissingTable(invRes.error)) throw new Error(`invoices: table not found. ${HINT}`);
    throwInvoiceError(invRes.error, HINT);
  }

  const invoiceRows = ((invRes.data ?? []) as InvoiceRow[]).map((r) => toInvoice(r, []));
  const invoiceIds = invoiceRows.map((r) => r.id).filter(Boolean);

  // Pull payments for only these invoices (batched)
  const paymentsByInvoiceId = new Map<string, InvoicePayment[]>();
  if (invoiceIds.length) {
    const payRes = await c
      .from("invoice_payments")
      .select("id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status")
      .in("invoice_id", invoiceIds);
    if (!payRes.error && Array.isArray(payRes.data)) {
      for (const p of (payRes.data ?? []) as InvoicePaymentRow[]) {
        const payment = toPayment(p);
        const arr = paymentsByInvoiceId.get(payment.invoiceId) ?? [];
        arr.push(payment);
        paymentsByInvoiceId.set(payment.invoiceId, arr);
      }
    }
  }

  // Compute derived per invoice
  let rows: InvoiceWithDerived[] = invoiceRows.map((inv) => {
    const invPayments = paymentsByInvoiceId.get(inv.id) ?? [];
    const { paidTotal, balanceDue, computedStatus, daysOverdue } = computeDerived(inv, invPayments);
    return { ...inv, paidTotal, balanceDue, computedStatus, daysOverdue };
  });

  // computedStatus filters (Partial/Unpaid/Overdue) need client-side derivation
  if (
    input?.status &&
    !["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(input.status as string)
  ) {
    rows = rows.filter((r) => r.computedStatus === input.status);
  }

  // search might include projectId substring in old implementation; keep parity cheaply
  if (input?.search?.trim()) {
    const q = input.search.toLowerCase();
    rows = rows.filter(
      (i) =>
        i.invoiceNo.toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        (i.projectId ?? "").toLowerCase().includes(q)
    );
  }

  return { rows, total: invRes.count ?? rows.length };
}

export async function getInvoiceByIdWithDerived(
  id: string,
  explicitClient?: SupabaseClient
): Promise<InvoiceWithDerived | null> {
  const inv = await getInvoiceById(id, explicitClient);
  if (!inv) return null;
  const payments = await getPaymentsByInvoiceId(id, explicitClient);
  const { paidTotal, balanceDue, computedStatus, daysOverdue } = computeDerived(inv, payments);
  return { ...inv, paidTotal, balanceDue, computedStatus, daysOverdue };
}

export type OverdueInvoiceRow = {
  id: string;
  invoiceNo: string;
  projectId: string;
  projectName: string;
  clientName: string;
  balanceDue: number;
  daysOverdue: number;
};

/** Invoices with balance due and past due date. For dashboard Overdue Invoices widget. */
export async function getOverdueInvoices(): Promise<OverdueInvoiceRow[]> {
  const list = await getInvoicesWithDerived();
  const overdue = list.filter((i) => i.computedStatus === "Overdue" && i.balanceDue > 0);
  if (overdue.length === 0) return [];
  const projectIds = Array.from(
    new Set(overdue.map((i) => i.projectId).filter(Boolean))
  ) as string[];
  const c = client();
  const { data: projRows } = await c.from("projects").select("id, name").in("id", projectIds);
  const projectNameById = new Map(
    (projRows ?? []).map((r: { id: string; name?: string }) => [r.id, r.name ?? ""])
  );
  return overdue.map((i) => ({
    id: i.id,
    invoiceNo: i.invoiceNo,
    projectId: i.projectId,
    projectName: projectNameById.get(i.projectId) ?? i.projectId,
    clientName: i.clientName,
    balanceDue: i.balanceDue,
    daysOverdue: i.daysOverdue,
  }));
}

export async function recordInvoicePayment(
  invoiceId: string,
  payload: { date: string; amount: number; method: string; memo?: string }
): Promise<InvoicePayment | null> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv || inv.status === "Void") return null;
  const { data: row, error } = await c
    .from("invoice_payments")
    .insert({
      invoice_id: invoiceId,
      paid_at: payload.date.slice(0, 10),
      amount: payload.amount,
      method: payload.method,
      memo: payload.memo ?? null,
      status: "Posted",
    })
    .select("id, invoice_id, paid_at, amount, method, memo, status")
    .single();
  if (error || !row) return null;
  return toPayment(row as InvoicePaymentRow);
}

export async function deleteInvoicePayment(paymentId: string): Promise<boolean> {
  const c = client();
  const { data, error } = await c
    .from("invoice_payments")
    .delete()
    .eq("id", paymentId)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function voidInvoice(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv) return false;
  if (inv.status === "Void") return true;
  const { error } = await c
    .from("invoices")
    .update({
      status: "Void",
      total: 0,
      subtotal: 0,
      tax_amount: 0,
      paid_total: 0,
      balance_due: 0,
    })
    .eq("id", invoiceId);
  return !error;
}

/** Return an issued invoice with no posted payments back to draft for editing. */
export async function revertInvoiceToDraft(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceByIdWithDerived(invoiceId);
  if (!inv) return false;
  if (inv.status === "Draft") return true;
  if (inv.computedStatus === "Void" || inv.paidTotal > 0) return false;
  const { data, error } = await c
    .from("invoices")
    .update({ status: "Draft" })
    .eq("id", invoiceId)
    .select("id, status")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function getInvoiceDeleteDependencies(
  invoiceId: string
): Promise<InvoiceDeleteDependenciesResult> {
  const c = client();
  const invoiceRes = await c
    .from("invoices")
    .select("id, invoice_no, project_id, status, total, balance_due")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceRes.error) throw new Error(invoiceRes.error.message ?? "Failed to load invoice.");

  const invoice = invoiceRes.data as {
    id: string;
    invoice_no?: string | null;
    project_id?: string | null;
    status?: string | null;
    total?: number | string | null;
    balance_due?: number | string | null;
  } | null;

  if (!invoice) {
    return {
      invoiceId,
      canDelete: true,
      blockers: [],
      warnings: [{ type: "not_found", label: "Invoice was already removed." }],
      safeChildRecords: [],
    };
  }

  const blockers: InvoiceDeleteDependency[] = [];
  const warnings: InvoiceDeleteWarning[] = [];
  const safeChildRecords: InvoiceDeleteSafeChildRecord[] = [];
  const status = invoice.status ?? null;

  if (!isVoidInvoiceStatus(status)) {
    blockers.push({
      id: `${invoiceId}:status`,
      type: "invoice_status",
      label: "Invoice is not voided",
      description: "Only voided invoices can be permanently deleted.",
      status,
      href: `/financial/invoices/${invoiceId}`,
    });
  }

  const itemCountRes = await c
    .from("invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  if (itemCountRes.error) {
    if (!isMissingTable(itemCountRes.error) && !isMissingColumn(itemCountRes.error)) {
      throw new Error(itemCountRes.error.message ?? "Failed to check invoice line items.");
    }
  } else {
    safeChildRecords.push({
      type: "invoice_items",
      label: "Invoice line items",
      count: itemCountRes.count ?? 0,
    });
  }

  const payRes = await c
    .from("invoice_payments")
    .select("id, amount, payment_date, paid_at, method, memo, status, payment_received_id")
    .eq("invoice_id", invoiceId);
  if (payRes.error) {
    if (!isMissingTable(payRes.error) && !isMissingColumn(payRes.error)) {
      throw new Error(payRes.error.message ?? "Failed to check invoice payments.");
    }
  }
  const invoicePayments = (payRes.data ?? []) as Array<{
    id: string;
    amount?: number | string | null;
    payment_date?: string | null;
    paid_at?: string | null;
    method?: string | null;
    memo?: string | null;
    status?: string | null;
    payment_received_id?: string | null;
  }>;
  for (const payment of invoicePayments) {
    blockers.push({
      id: payment.id,
      type: "invoice_payment",
      label: "Payment record linked to this invoice",
      description: payment.memo ?? payment.method ?? undefined,
      amount: Number(payment.amount ?? 0) || 0,
      date: isoDateLike(payment.payment_date ?? payment.paid_at),
      status: payment.status ?? null,
      href: payment.payment_received_id
        ? `/financial/payments?paymentId=${payment.payment_received_id}&invoiceId=${invoiceId}`
        : `/financial/payments?invoiceId=${invoiceId}`,
    });
  }

  const paymentReceivedById = new Map<string, InvoiceDeleteDependency>();
  const addPaymentReceivedBlockers = (
    rows: Array<{
      id: string;
      amount?: number | string | null;
      payment_date?: string | null;
      payment_method?: string | null;
      status?: string | null;
    }>
  ) => {
    for (const payment of rows) {
      paymentReceivedById.set(payment.id, {
        id: payment.id,
        type: "payment_received",
        label: "Payment Received linked to this invoice",
        description: payment.payment_method ?? undefined,
        amount: Number(payment.amount ?? 0) || 0,
        date: isoDateLike(payment.payment_date),
        status: payment.status ?? null,
        href: `/financial/payments?paymentId=${payment.id}&invoiceId=${invoiceId}`,
      });
    }
  };

  const paymentReceivedDirectRes = await c
    .from("payments_received")
    .select("id, amount, payment_date, payment_method, status")
    .eq("invoice_id", invoiceId);
  if (paymentReceivedDirectRes.error) {
    if (
      !isMissingTable(paymentReceivedDirectRes.error) &&
      !isMissingColumn(paymentReceivedDirectRes.error)
    ) {
      throw new Error(
        paymentReceivedDirectRes.error.message ?? "Failed to check payments received."
      );
    }
  } else {
    addPaymentReceivedBlockers(
      (paymentReceivedDirectRes.data ?? []) as Parameters<typeof addPaymentReceivedBlockers>[0]
    );
  }

  const linkedPaymentReceivedIds = Array.from(
    new Set(invoicePayments.map((p) => p.payment_received_id).filter(Boolean) as string[])
  );
  if (linkedPaymentReceivedIds.length > 0) {
    const paymentReceivedLinkedRes = await c
      .from("payments_received")
      .select("id, amount, payment_date, payment_method, status")
      .in("id", linkedPaymentReceivedIds);
    if (paymentReceivedLinkedRes.error) {
      if (
        !isMissingTable(paymentReceivedLinkedRes.error) &&
        !isMissingColumn(paymentReceivedLinkedRes.error)
      ) {
        throw new Error(
          paymentReceivedLinkedRes.error.message ?? "Failed to check linked payments received."
        );
      }
    } else {
      addPaymentReceivedBlockers(
        (paymentReceivedLinkedRes.data ?? []) as Parameters<typeof addPaymentReceivedBlockers>[0]
      );
    }
  }
  blockers.push(...paymentReceivedById.values());

  const depositById = new Map<string, InvoiceDeleteDependency>();
  const addDepositBlockers = (
    rows: Array<{
      id: string;
      amount?: number | string | null;
      deposit_date?: string | null;
      payment_method?: string | null;
      status?: string | null;
      payment_id?: string | null;
    }>
  ) => {
    for (const deposit of rows) {
      depositById.set(deposit.id, {
        id: deposit.id,
        type: "deposit",
        label: "Deposit linked to this invoice/payment",
        description: deposit.payment_method ?? undefined,
        amount: Number(deposit.amount ?? 0) || 0,
        date: isoDateLike(deposit.deposit_date),
        status: deposit.status ?? null,
        href: `/financial/deposits?invoiceId=${invoiceId}`,
      });
    }
  };

  const depositsByInvoiceRes = await c
    .from("deposits")
    .select("id, amount, deposit_date, payment_method, status, payment_id")
    .eq("invoice_id", invoiceId);
  if (depositsByInvoiceRes.error) {
    if (
      !isMissingTable(depositsByInvoiceRes.error) &&
      !isMissingColumn(depositsByInvoiceRes.error)
    ) {
      throw new Error(depositsByInvoiceRes.error.message ?? "Failed to check deposits.");
    }
  } else {
    addDepositBlockers(
      (depositsByInvoiceRes.data ?? []) as Parameters<typeof addDepositBlockers>[0]
    );
  }

  const paymentReceivedIds = Array.from(paymentReceivedById.keys());
  if (paymentReceivedIds.length > 0) {
    const depositsByPaymentRes = await c
      .from("deposits")
      .select("id, amount, deposit_date, payment_method, status, payment_id")
      .in("payment_id", paymentReceivedIds);
    if (depositsByPaymentRes.error) {
      if (
        !isMissingTable(depositsByPaymentRes.error) &&
        !isMissingColumn(depositsByPaymentRes.error)
      ) {
        throw new Error(depositsByPaymentRes.error.message ?? "Failed to check payment deposits.");
      }
    } else {
      addDepositBlockers(
        (depositsByPaymentRes.data ?? []) as Parameters<typeof addDepositBlockers>[0]
      );
    }
  }
  blockers.push(...depositById.values());

  const scheduleRes = await c
    .from("estimate_payment_schedule_items")
    .select("id, estimate_id, title, amount, due_date, status")
    .eq("invoice_id", invoiceId);
  if (scheduleRes.error) {
    if (!isMissingTable(scheduleRes.error) && !isMissingColumn(scheduleRes.error)) {
      throw new Error(
        scheduleRes.error.message ?? "Failed to check estimate payment schedule links."
      );
    }
  } else {
    for (const item of (scheduleRes.data ?? []) as Array<{
      id: string;
      estimate_id?: string | null;
      title?: string | null;
      amount?: number | string | null;
      due_date?: string | null;
      status?: string | null;
    }>) {
      blockers.push({
        id: item.id,
        type: "estimate_payment_schedule_item",
        label: "Estimate payment schedule item linked to this invoice",
        description: item.title ?? undefined,
        amount: Number(item.amount ?? 0) || 0,
        date: isoDateLike(item.due_date),
        status: item.status ?? null,
        href: item.estimate_id ? `/estimates/${item.estimate_id}` : null,
        estimateId: item.estimate_id ?? null,
        scheduleItemId: item.id,
      });
    }
  }

  if (isVoidInvoiceStatus(status) && invoiceCountsTowardReceivable(status)) {
    blockers.push({
      id: `${invoiceId}:project-ar`,
      type: "project_ar",
      label: "Project AR still includes this voided invoice",
      description:
        "Void invoices must not remain in Project AR. Review invoice status before delete.",
      amount: Number(invoice.balance_due ?? invoice.total ?? 0) || 0,
      href: invoice.project_id
        ? `/projects/${invoice.project_id}`
        : `/financial/invoices/${invoiceId}`,
    });
  }

  return {
    invoiceId,
    invoiceNo: invoice.invoice_no ?? null,
    status,
    projectId: invoice.project_id ?? null,
    canDelete: blockers.length === 0,
    blockers,
    warnings,
    safeChildRecords,
  };
}

export async function unlinkInvoiceFromPaymentScheduleItem(
  invoiceId: string,
  scheduleItemId: string
): Promise<{ ok: boolean; estimateId?: string | null; error?: string }> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (!isVoidInvoiceStatus(inv.status)) {
    return { ok: false, error: "Only voided invoices can be unlinked from payment schedules." };
  }

  const itemRes = await c
    .from("estimate_payment_schedule_items")
    .select("id, estimate_id, invoice_id")
    .eq("id", scheduleItemId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (itemRes.error) {
    return { ok: false, error: itemRes.error.message ?? "Failed to load schedule item." };
  }
  const item = itemRes.data as {
    id: string;
    estimate_id?: string | null;
    invoice_id?: string | null;
  } | null;
  if (!item) return { ok: false, error: "Schedule item is not linked to this invoice." };

  const { error } = await c
    .from("estimate_payment_schedule_items")
    .update({ invoice_id: null, status: "draft" })
    .eq("id", scheduleItemId)
    .eq("invoice_id", invoiceId);
  if (error) return { ok: false, error: error.message ?? "Failed to unlink schedule item." };
  return { ok: true, estimateId: item.estimate_id ?? null };
}

/** Permanently delete an invoice. Only allowed when already voided and no financial dependencies remain. */
export async function deleteInvoice(invoiceId: string): Promise<boolean> {
  const c = client();
  const check = await getInvoiceDeleteDependencies(invoiceId);
  if (check.blockers.length > 0) return false;

  await deleteRowsByInvoiceIds(c, "invoice_items", "invoice_id", [invoiceId]);
  const { data, error } = await c
    .from("invoices")
    .delete()
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function createInvoice(
  payload: {
    idempotencyKey?: string;
    invoiceNo?: string;
    projectId: string;
    customerId?: string | null;
    clientName: string;
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    taxPct?: number;
    notes?: string;
  },
  explicitClient?: SupabaseClient
): Promise<Invoice> {
  return createInvoiceAtomicWithClient(payload, client(explicitClient));
}

export async function createInvoiceAtomicWithClient(
  payload: {
    idempotencyKey?: string;
    invoiceNo?: string;
    projectId: string;
    customerId?: string | null;
    clientName: string;
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    taxPct?: number;
    notes?: string;
  },
  explicitClient: SupabaseClient
): Promise<Invoice> {
  const idempotencyKey = payload.idempotencyKey?.trim() || globalThis.crypto.randomUUID();
  const { data, error } = await explicitClient.rpc("create_invoice_atomic", {
    p_idempotency_key: idempotencyKey,
    p_header: {
      invoice_no: payload.invoiceNo?.trim() || null,
      project_id: payload.projectId || null,
      customer_id: payload.customerId || null,
      client_name: payload.clientName ?? "",
      issue_date: payload.issueDate.slice(0, 10),
      due_date: payload.dueDate.slice(0, 10),
      status: "Draft",
      notes: payload.notes ?? null,
      tax_pct: payload.taxPct ?? 0,
    },
    p_items: payload.lineItems.map((item) => ({
      description: item.description,
      qty: item.qty,
      unit_price: item.unitPrice,
    })),
  });
  if (error) throw new Error(error.message ?? "Failed to create invoice.");
  const invoiceId = String((data as { invoice_id?: unknown } | null)?.invoice_id ?? "");
  if (!invoiceId) throw new Error("Atomic invoice create returned no invoice id.");
  const saved = await getInvoiceById(invoiceId, explicitClient);
  if (!saved)
    throw new Error("Atomic invoice create completed but the invoice could not be loaded.");
  return saved;
}

export async function updateInvoice(
  invoiceId: string,
  payload: Partial<{
    projectId: string;
    customerId: string | null;
    invoiceNo: string;
    clientName: string;
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    taxPct: number;
    notes: string;
  }>,
  explicitClient?: SupabaseClient
): Promise<boolean> {
  const c = client(explicitClient);
  const inv = await getInvoiceById(invoiceId, explicitClient);
  if (!inv || inv.status !== "Draft") return false;
  const { error } = await c.rpc("update_invoice_atomic", {
    p_invoice_id: invoiceId,
    p_header: {
      invoice_no: payload.invoiceNo?.trim() || inv.invoiceNo,
      project_id:
        payload.projectId !== undefined ? payload.projectId || null : inv.projectId || null,
      customer_id:
        payload.customerId !== undefined ? payload.customerId || null : inv.customerId || null,
      client_name: payload.clientName !== undefined ? payload.clientName.trim() : inv.clientName,
      issue_date: payload.issueDate != null ? payload.issueDate.slice(0, 10) : inv.issueDate,
      due_date: payload.dueDate != null ? payload.dueDate.slice(0, 10) : inv.dueDate,
      notes: payload.notes !== undefined ? (payload.notes ?? null) : (inv.notes ?? null),
      tax_pct: Math.max(0, payload.taxPct ?? inv.taxPct ?? 0),
    },
    p_items:
      payload.lineItems?.map((item) => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unitPrice,
      })) ?? null,
  });
  return !error;
}

export async function markInvoiceSent(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv || inv.status !== "Draft") return false;
  if (!inv.projectId || !inv.clientName.trim() || inv.lineItems.length === 0) return false;
  const { error } = await c.from("invoices").update({ status: "Sent" }).eq("id", invoiceId);
  return !error;
}

export async function getInvoicesByProject(projectId: string): Promise<Invoice[]> {
  const all = await getInvoices();
  return all.filter((i) => i.projectId === projectId);
}

export interface ProjectInvoiceARAggregate {
  invoicedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  overdueBalance: number;
}

export async function getInvoicesByProjectAggregate(
  projectId: string
): Promise<ProjectInvoiceARAggregate> {
  const today = new Date().toISOString().slice(0, 10);
  const list = await getInvoicesByProject(projectId);
  const receivableInvoices = list.filter((i) => invoiceCountsTowardReceivable(i.status));
  let invoicedTotal = 0;
  let paidTotal = 0;
  let balanceTotal = 0;
  let overdueBalance = 0;
  for (const inv of receivableInvoices) {
    const withDerived = await getInvoiceByIdWithDerived(inv.id);
    if (!withDerived) continue;
    if (!invoiceCountsTowardReceivable(withDerived.status)) continue;
    invoicedTotal += withDerived.total;
    paidTotal += withDerived.paidTotal;
    balanceTotal += withDerived.balanceDue;
    if (withDerived.computedStatus !== "Paid" && withDerived.balanceDue > 0 && inv.dueDate < today)
      overdueBalance += withDerived.balanceDue;
  }
  return {
    invoicedTotal,
    paidTotal,
    balanceTotal: Math.max(0, balanceTotal),
    overdueBalance,
  };
}

/** Revenue (sum invoices.total) and collected (sum invoice_payments.amount) for a project. No stored derived fields. */
export async function getProjectRevenueAndCollected(
  projectId: string
): Promise<{ revenue: number; collected: number }> {
  const c = client();
  const { data: invRows, error: invErr } = await c
    .from("invoices")
    .select("id, total, status")
    .eq("project_id", projectId)
    .neq("status", "Void");
  if (invErr || !invRows?.length) {
    return { revenue: 0, collected: 0 };
  }
  const receivableRows = (
    invRows as { id: string; total?: number; status?: string | null }[]
  ).filter((row) => invoiceCountsTowardReceivable(row.status));
  if (receivableRows.length === 0) return { revenue: 0, collected: 0 };
  const revenue = receivableRows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const ids = receivableRows.map((r) => r.id);
  const { data: payRows, error: payErr } = await c
    .from("invoice_payments")
    .select("amount, status")
    .in("invoice_id", ids);
  if (payErr) return { revenue, collected: 0 };
  const collected = (payRows ?? []).reduce((s, r) => {
    const row = r as { amount?: number; status?: string };
    if (row.status === "Voided") return s;
    return s + Number(row.amount ?? 0);
  }, 0);
  return { revenue, collected };
}

/** Company-wide revenue (sum invoices.total where not Void) and collected (sum invoice_payments.amount where not Voided). */
export async function getCompanyRevenueAndCollected(): Promise<{
  revenue: number;
  collected: number;
}> {
  const c = client();
  const { data: invRows, error: invErr } = await c
    .from("invoices")
    .select("id, total, status")
    .neq("status", "Void");
  if (invErr) return { revenue: 0, collected: 0 };
  const receivableRows = (invRows ?? [])
    .map((r) => r as { id: string; total?: number; status?: string | null })
    .filter((row) => invoiceCountsTowardReceivable(row.status));
  const revenue = receivableRows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const { data: payRows, error: payErr } = await c
    .from("invoice_payments")
    .select("amount, status");
  if (payErr) return { revenue, collected: 0 };
  const collected = (payRows ?? []).reduce((s, r) => {
    const row = r as { amount?: number; status?: string };
    if (row.status === "Voided") return s;
    return s + Number(row.amount ?? 0);
  }, 0);
  return { revenue, collected };
}

export type InvoiceRecentRow = {
  id: string;
  project_id: string | null;
  invoice_no: string;
  client_name: string;
  total: number;
  created_at: string;
  project_name: string | null;
};

/** Recent invoices for dashboard activity feed. Ordered by created_at desc, limit. */
export async function getInvoicesRecent(limit: number): Promise<InvoiceRecentRow[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("invoices")
    .select("id, project_id, invoice_no, client_name, total, created_at, projects(name)")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) {
    if (isMissingTable(error)) return [];
    throwInvoiceError(error, "Failed to load recent invoices.");
  }
  return (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const proj = row.projects as { name?: string } | null;
    return {
      id: (row.id as string) ?? "",
      project_id: (row.project_id as string | null) ?? null,
      invoice_no: (row.invoice_no as string) ?? "",
      client_name: (row.client_name as string) ?? "",
      total: Number(row.total) || 0,
      created_at: (row.created_at as string) ?? new Date().toISOString(),
      project_name: proj?.name ?? null,
    };
  });
}
