/**
 * Invoices + invoice_items + invoice_payments — Supabase only. No mock data.
 * Tables: invoices, invoice_items, invoice_payments.
 */

import { getSupabaseClient } from "@/lib/supabase";

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
};

type InvoiceRow = {
  id: string;
  invoice_no?: string;
  project_id: string | null;
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
};

function client() {
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
  return {
    description: r.description ?? "",
    qty: q,
    unitPrice: Number(r.unit_price) || 0,
    amount: Number(r.amount) || 0,
  };
}

function toInvoice(row: InvoiceRow, items: InvoiceItemRow[]): Invoice {
  const status = (
    ["Draft", "Sent", "Partially Paid", "Paid", "Void"].includes(row.status) ? row.status : "Draft"
  ) as InvoiceStatus;
  const dueDate =
    row.due_date?.slice?.(0, 10) ?? (typeof row.due_date === "string" ? row.due_date : "");
  const issueDate = row.issue_date?.slice?.(0, 10) ?? row.created_at?.slice?.(0, 10) ?? "";
  return {
    id: row.id,
    invoiceNo: row.invoice_no ?? row.id.slice(0, 8),
    projectId: row.project_id ?? "",
    clientName: row.client_name ?? "",
    issueDate,
    dueDate,
    status,
    lineItems: items.map(toLineItem),
    subtotal: Number(row.subtotal ?? row.total) || 0,
    taxPct: Number(row.tax_pct) || undefined,
    taxAmount: Number(row.tax_amount) || undefined,
    total: Number(row.total) || 0,
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
  };
}

async function getInvoiceItemsOrEmpty(invoiceId: string): Promise<InvoiceItemRow[]> {
  const c = client();
  const itemRes = await c.from("invoice_items").select("*").eq("invoice_id", invoiceId);
  if (itemRes.error) {
    if (isMissingTable(itemRes.error)) return [];
    throw new Error(itemRes.error.message ?? "Failed to load invoice items.");
  }
  return (itemRes.data ?? []) as InvoiceItemRow[];
}

/** Select columns; paid/balance are computed from invoice_payments, not stored. */
const INVOICE_COLS =
  "id,project_id,invoice_no,client_name,issue_date,due_date,status,total,notes,tax_pct,subtotal,tax_amount,created_at,updated_at";

export async function getInvoices(): Promise<Invoice[]> {
  const c = client();
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

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const c = client();
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
  const itemRows = await getInvoiceItemsOrEmpty(id);
  return toInvoice(row as InvoiceRow, itemRows);
}

export async function getInvoicePayments(): Promise<InvoicePayment[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("invoice_payments")
    .select("id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status")
    .order("payment_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new Error(`invoice_payments: table not found. ${HINT}`);
    throwInvoiceError(error, "Failed to load invoice_payments.");
  }
  return ((rows ?? []) as InvoicePaymentRow[]).map(toPayment);
}

export async function getPaymentsByInvoiceId(invoiceId: string): Promise<InvoicePayment[]> {
  const c = client();
  const { data: rows } = await c
    .from("invoice_payments")
    .select("id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });
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

export async function getInvoicesWithDerived(filters?: {
  status?: InvoiceStatus | InvoiceComputedStatus;
  projectId?: string;
  search?: string;
}): Promise<InvoiceWithDerived[]> {
  const list = await getInvoices();
  const payments = await getInvoicePayments();
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

export async function getInvoicesWithDerivedPaged(input?: {
  page?: number;
  pageSize?: number;
  status?: InvoiceStatus | InvoiceComputedStatus;
  projectId?: string;
  search?: string;
}): Promise<{ rows: InvoiceWithDerived[]; total: number }> {
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input?.pageSize ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const c = client();

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

export async function getInvoiceByIdWithDerived(id: string): Promise<InvoiceWithDerived | null> {
  const inv = await getInvoiceById(id);
  if (!inv) return null;
  const payments = await getPaymentsByInvoiceId(id);
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
  const { error } = await c.from("invoice_payments").delete().eq("id", paymentId);
  return !error;
}

export async function voidInvoice(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv) return false;
  const { error } = await c
    .from("invoices")
    .update({ status: "Void", total: 0, subtotal: 0, tax_amount: 0 })
    .eq("id", invoiceId);
  return !error;
}

/**
 * Revert a Void/Paid invoice back to draft (editable again).
 * IMPORTANT: Does not restore totals for Void invoices; it only changes status.
 */
export async function revertInvoiceToDraft(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceByIdWithDerived(invoiceId);
  if (!inv) return false;
  if (inv.computedStatus !== "Void" && inv.computedStatus !== "Paid") return false;
  const { error } = await c.from("invoices").update({ status: "Draft" }).eq("id", invoiceId);
  return !error;
}

/** Permanently delete an invoice. Only allowed when status is Draft or Void (not Sent / Partially Paid / Paid). */
export async function deleteInvoice(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv) return false;
  if (inv.status !== "Draft" && inv.status !== "Void") return false;
  const { error } = await c.from("invoices").delete().eq("id", invoiceId);
  return !error;
}

export async function createInvoice(payload: {
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  taxPct?: number;
  notes?: string;
}): Promise<Invoice> {
  const c = client();
  const subtotal = payload.lineItems.reduce((s, l) => s + l.amount, 0);
  const taxPct = payload.taxPct ?? 0;
  const taxAmount = Math.round(subtotal * (taxPct / 100));
  const total = subtotal + taxAmount;

  const isUniqueInvoiceNo = (err: unknown): boolean => {
    const code = (err as { code?: string } | null)?.code;
    const msg = (err as { message?: string } | null)?.message ?? "";
    return code === "23505" || /invoice_no|invoices_invoice_no_key/i.test(msg);
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { count } = await c.from("invoices").select("id", { count: "exact", head: true });
    const nextNum = (count ?? 0) + 1;
    const invoiceNo = `INV-${String(nextNum).padStart(4, "0")}`;

    const { data: invRow, error: invErr } = await c
      .from("invoices")
      .insert({
        invoice_no: invoiceNo,
        project_id: payload.projectId || null,
        client_name: payload.clientName ?? "",
        issue_date: payload.issueDate.slice(0, 10),
        due_date: payload.dueDate.slice(0, 10),
        status: "Draft",
        notes: payload.notes ?? null,
        tax_pct: taxPct,
        subtotal,
        tax_amount: taxAmount,
        total,
      })
      .select(
        "id, invoice_no, project_id, client_name, issue_date, due_date, status, notes, tax_pct, subtotal, tax_amount, total"
      )
      .single();

    if (!invErr && invRow) {
      const inv = invRow as InvoiceRow;
      for (const item of payload.lineItems) {
        const quantity = Number(item.qty) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        await c.from("invoice_items").insert({
          invoice_id: inv.id,
          description: item.description,
          quantity,
          unit_price: unitPrice,
          amount: quantity * unitPrice,
        });
      }
      const itemRows = await getInvoiceItemsOrEmpty(inv.id);
      return toInvoice(inv, itemRows);
    }

    lastErr = invErr;
    if (invErr && isUniqueInvoiceNo(invErr) && attempt === 0) continue;
    throw new Error(invErr?.message ?? "Failed to create invoice.");
  }
  throw new Error((lastErr as { message?: string } | null)?.message ?? "Failed to create invoice.");
}

export async function updateInvoice(
  invoiceId: string,
  payload: Partial<{
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    taxPct: number;
    notes: string;
  }>
): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv || inv.status !== "Draft") return false;
  const updates: Record<string, unknown> = {};
  if (payload.issueDate != null) updates.issue_date = payload.issueDate.slice(0, 10);
  if (payload.dueDate != null) updates.due_date = payload.dueDate.slice(0, 10);
  if (payload.notes !== undefined) updates.notes = payload.notes ?? null;
  if (payload.taxPct != null) updates.tax_pct = payload.taxPct;
  if (Object.keys(updates).length > 0) {
    await c.from("invoices").update(updates).eq("id", invoiceId);
  }
  if (payload.lineItems != null) {
    await c.from("invoice_items").delete().eq("invoice_id", invoiceId);
    for (const item of payload.lineItems) {
      const quantity = Number(item.qty) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      await c.from("invoice_items").insert({
        invoice_id: invoiceId,
        description: item.description,
        quantity,
        unit_price: unitPrice,
        amount: quantity * unitPrice,
      });
    }
  }
  return true;
}

export async function markInvoiceSent(invoiceId: string): Promise<boolean> {
  const c = client();
  const inv = await getInvoiceById(invoiceId);
  if (!inv || inv.status !== "Draft") return false;
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
  const voidExcluded = list.filter((i) => i.status !== "Void");
  let invoicedTotal = 0;
  let paidTotal = 0;
  let overdueBalance = 0;
  for (const inv of voidExcluded) {
    const withDerived = await getInvoiceByIdWithDerived(inv.id);
    if (!withDerived) continue;
    invoicedTotal += inv.total;
    paidTotal += withDerived.paidTotal;
    if (withDerived.computedStatus !== "Paid" && inv.dueDate < today)
      overdueBalance += withDerived.balanceDue;
  }
  return {
    invoicedTotal,
    paidTotal,
    balanceTotal: Math.max(0, invoicedTotal - paidTotal),
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
    .select("id, total")
    .eq("project_id", projectId)
    .neq("status", "Void");
  if (invErr || !invRows?.length) {
    return { revenue: 0, collected: 0 };
  }
  const revenue = (invRows as { total?: number }[]).reduce((s, r) => s + Number(r.total ?? 0), 0);
  const ids = invRows.map((r) => (r as { id: string }).id);
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
    .select("id, total")
    .neq("status", "Void");
  if (invErr) return { revenue: 0, collected: 0 };
  const revenue = (invRows ?? []).reduce(
    (s, r) => s + Number((r as { total?: number }).total ?? 0),
    0
  );
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
