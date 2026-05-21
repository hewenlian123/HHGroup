/**
 * Payments Received — AR payments linked to invoices.
 * Table: payments_received. Additive only; syncs to invoice_payments so existing invoice balance logic applies.
 * Creates a deposit record automatically for each payment (deposits table).
 */

import { getSupabaseClient } from "@/lib/supabase";
import { createDepositFromPayment } from "@/lib/deposits-db";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PAYMENT_METHODS = ["Check", "ACH", "Wire", "Cash", "Credit Card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentAttachmentFileType = "image" | "pdf";

export type PaymentReceivedAttachment = {
  id: string;
  payment_id: string;
  file_url: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  file_type: PaymentAttachmentFileType;
  created_at: string;
};

export type PaymentReceivedRow = {
  id: string;
  invoice_id: string;
  project_id: string | null;
  customer_name: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  deposit_account: string | null;
  notes: string | null;
  attachment_url: string | null;
  status?: string | null;
  created_at: string;
  attachments: PaymentReceivedAttachment[];
};

export type PaymentReceivedWithMeta = PaymentReceivedRow & {
  invoice_no: string | null;
  project_name: string | null;
};

export type PaymentReceivedLedgerLinkStatus = "linked" | "legacy_matched" | "missing" | "ambiguous";

export type PaymentReceivedDetail = PaymentReceivedWithMeta & {
  invoice_total: number;
  invoice_status: string | null;
  paid_total_excluding_payment: number;
  max_editable_amount: number;
  ledger_link_status: PaymentReceivedLedgerLinkStatus;
  can_edit_financial: boolean;
};

export type CreatePaymentReceivedPayload = {
  invoice_id: string;
  project_id?: string | null;
  customer_name: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  deposit_account?: string | null;
  notes?: string | null;
  /** Legacy single URL field. New UI writes `attachments` instead. */
  attachment_url?: string | null;
  attachments?: CreatePaymentReceivedAttachmentPayload[];
};

export type UpdatePaymentReceivedAttachmentPayload = CreatePaymentReceivedAttachmentPayload & {
  id?: string | null;
};

export type UpdatePaymentReceivedPayload = {
  id: string;
  payment_date?: string;
  amount?: number;
  payment_method?: string | null;
  deposit_account?: string | null;
  notes?: string | null;
  attachments?: UpdatePaymentReceivedAttachmentPayload[];
};

export type CreatePaymentReceivedAttachmentPayload = {
  file_url: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  file_type: PaymentAttachmentFileType;
};

function client(explicitClient?: SupabaseClient) {
  const c = explicitClient ?? getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

type PaymentReceivedDbRow = Omit<PaymentReceivedRow, "attachments">;

const PAYMENT_ATTACHMENT_SELECT =
  "id, payment_id, file_url, file_name, mime_type, size_bytes, file_type, created_at";
const PAYMENT_RECEIVED_SELECT_WITH_STATUS =
  "id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, attachment_url, status, created_at";
const PAYMENT_RECEIVED_SELECT_WITHOUT_STATUS =
  "id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, attachment_url, created_at";
const INVOICE_PAYMENT_SELECT_WITH_LINK =
  "id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status, payment_received_id";
const INVOICE_PAYMENT_SELECT_WITH_LINK_NO_DATE =
  "id, invoice_id, amount, paid_at, method, reference, memo, status, payment_received_id";
const INVOICE_PAYMENT_SELECT_WITHOUT_LINK =
  "id, invoice_id, amount, payment_date, paid_at, method, reference, memo, status";
const INVOICE_PAYMENT_SELECT_MINIMAL = "id, invoice_id, amount, paid_at, method, memo, status";
const MONEY_EPSILON = 0.0000001;

type InvoicePaymentSyncRow = {
  id: string;
  invoice_id: string;
  amount: number | null;
  payment_date?: string | null;
  paid_at?: string | null;
  method?: string | null;
  reference?: string | null;
  memo?: string | null;
  status?: string | null;
  payment_received_id?: string | null;
};

type PaymentLedgerLinkResolution = {
  status: PaymentReceivedLedgerLinkStatus;
  row: InvoicePaymentSyncRow | null;
  invoicePayments: InvoicePaymentSyncRow[];
};

type PaymentOptionalSchema = {
  paymentsReceivedStatus: boolean;
  paymentAttachments: boolean;
  invoicePaymentLink: boolean;
  invoicePaymentDate: boolean;
};

const OPTIMISTIC_PAYMENT_SCHEMA: PaymentOptionalSchema = {
  paymentsReceivedStatus: true,
  paymentAttachments: true,
  invoicePaymentLink: true,
  invoicePaymentDate: true,
};

let paymentOptionalSchemaPromise: Promise<PaymentOptionalSchema> | null = null;

async function getPaymentOptionalSchema(): Promise<PaymentOptionalSchema> {
  if (typeof window === "undefined") return OPTIMISTIC_PAYMENT_SCHEMA;
  if (!paymentOptionalSchemaPromise) {
    paymentOptionalSchemaPromise = fetch("/api/schema-check", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return OPTIMISTIC_PAYMENT_SCHEMA;
        const json = (await res.json().catch(() => null)) as { missing?: unknown } | null;
        const missing = Array.isArray(json?.missing) ? json.missing.map(String) : [];
        return {
          paymentsReceivedStatus: !missing.includes("payments_received.status"),
          paymentAttachments: !missing.includes("payment_received_attachments"),
          invoicePaymentLink: !missing.includes("invoice_payments.payment_received_id"),
          invoicePaymentDate: !missing.includes("invoice_payments.payment_date"),
        };
      })
      .catch(() => OPTIMISTIC_PAYMENT_SCHEMA);
  }
  return paymentOptionalSchemaPromise;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /relation.*does not exist|table.*does not exist|could not find/i.test(m);
}

function isDirectAttachmentUrl(url: string): boolean {
  return /^(https?:|blob:|data:)/i.test(url.trim());
}

function inferAttachmentFileType(fileName: string, fileUrl: string): PaymentAttachmentFileType {
  const n = (fileName ?? "").toLowerCase();
  const u = (fileUrl ?? "").toLowerCase();
  return n.endsWith(".pdf") || /\.pdf(\?|#|$)/i.test(u) ? "pdf" : "image";
}

function normalizeDate(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.slice(0, 10) : "";
}

function normalizeMemo(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

function memoForPayment(row: Pick<PaymentReceivedDbRow, "notes" | "deposit_account">): string {
  return normalizeMemo(row.notes) || normalizeMemo(row.deposit_account);
}

function amountsEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  return Math.abs((Number(a ?? 0) || 0) - (Number(b ?? 0) || 0)) < MONEY_EPSILON;
}

function fileNameFromUrl(rawUrl: string): string {
  const clean = rawUrl.split(/[?#]/)[0] ?? rawUrl;
  const last = clean.split("/").filter(Boolean).pop();
  try {
    return decodeURIComponent(last || "Payment attachment");
  } catch {
    return last || "Payment attachment";
  }
}

function toPaymentAttachment(row: unknown): PaymentReceivedAttachment {
  const r = row as Partial<PaymentReceivedAttachment> & { size_bytes?: unknown };
  const fileName = String(r.file_name ?? "Payment attachment");
  const fileUrl = String(r.file_url ?? "");
  return {
    id: String(r.id ?? crypto.randomUUID()),
    payment_id: String(r.payment_id ?? ""),
    file_url: fileUrl,
    file_name: fileName,
    mime_type: typeof r.mime_type === "string" ? r.mime_type : null,
    size_bytes: r.size_bytes == null ? null : Number(r.size_bytes),
    file_type: r.file_type === "pdf" ? "pdf" : inferAttachmentFileType(fileName, fileUrl),
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

function legacyAttachmentFromPayment(row: PaymentReceivedDbRow): PaymentReceivedAttachment | null {
  const url = (row.attachment_url ?? "").trim();
  if (!url) return null;
  const fileName = fileNameFromUrl(url);
  return {
    id: `legacy-${row.id}`,
    payment_id: row.id,
    file_url: url,
    file_name: fileName,
    mime_type: null,
    size_bytes: null,
    file_type: inferAttachmentFileType(fileName, url),
    created_at: row.created_at,
  };
}

async function fetchPaymentAttachmentsByPaymentIds(
  c: ReturnType<typeof client>,
  paymentIds: string[]
): Promise<Map<string, PaymentReceivedAttachment[]>> {
  const byPaymentId = new Map<string, PaymentReceivedAttachment[]>();
  if (paymentIds.length === 0) return byPaymentId;
  const schema = await getPaymentOptionalSchema();
  if (!schema.paymentAttachments) return byPaymentId;

  const { data, error } = await c
    .from("payment_received_attachments")
    .select(PAYMENT_ATTACHMENT_SELECT)
    .in("payment_id", paymentIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return byPaymentId;
    throw new Error(error.message ?? "Failed to load payment attachments.");
  }

  for (const raw of data ?? []) {
    const att = toPaymentAttachment(raw);
    const list = byPaymentId.get(att.payment_id) ?? [];
    list.push(att);
    byPaymentId.set(att.payment_id, list);
  }
  return byPaymentId;
}

async function attachPaymentAttachments(
  c: ReturnType<typeof client>,
  rows: PaymentReceivedDbRow[]
): Promise<PaymentReceivedRow[]> {
  const attachmentsByPaymentId = await fetchPaymentAttachmentsByPaymentIds(
    c,
    rows.map((r) => r.id)
  );

  return rows.map((row) => {
    const explicit = attachmentsByPaymentId.get(row.id) ?? [];
    const legacy = explicit.length === 0 ? legacyAttachmentFromPayment(row) : null;
    return { ...row, attachments: legacy ? [legacy] : explicit };
  });
}

async function insertPaymentAttachments(
  c: ReturnType<typeof client>,
  paymentId: string,
  attachments: CreatePaymentReceivedAttachmentPayload[] | undefined
): Promise<PaymentReceivedAttachment[]> {
  const valid = (attachments ?? []).filter((att) => att.file_url.trim() && att.file_name.trim());
  if (valid.length === 0) return [];

  const { data, error } = await c
    .from("payment_received_attachments")
    .insert(
      valid.map((att) => ({
        payment_id: paymentId,
        file_url: att.file_url.trim(),
        file_name: att.file_name.trim(),
        mime_type: att.mime_type ?? null,
        size_bytes: att.size_bytes ?? null,
        file_type: att.file_type,
      }))
    )
    .select(PAYMENT_ATTACHMENT_SELECT);

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) {
      throw new Error(
        "payment_received_attachments table is missing. Apply migration 20260513170000_payment_received_attachments.sql."
      );
    }
    throw new Error(error.message ?? "Failed to save payment attachments.");
  }

  return (data ?? []).map((row) => toPaymentAttachment(row));
}

async function fetchPaymentReceivedDbRow(
  c: ReturnType<typeof client>,
  paymentId: string
): Promise<PaymentReceivedDbRow | null> {
  const schema = await getPaymentOptionalSchema();
  let data: unknown | null = null;
  let error: { message?: string } | null = null;

  if (schema.paymentsReceivedStatus) {
    const res = await c
      .from("payments_received")
      .select(PAYMENT_RECEIVED_SELECT_WITH_STATUS)
      .eq("id", paymentId)
      .maybeSingle();
    data = res.data as unknown | null;
    error = res.error as { message?: string } | null;
  }

  if (!schema.paymentsReceivedStatus || (error && isMissingColumn(error))) {
    const fallback = await c
      .from("payments_received")
      .select(PAYMENT_RECEIVED_SELECT_WITHOUT_STATUS)
      .eq("id", paymentId)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load payment.");
  }
  return data ? (data as PaymentReceivedDbRow) : null;
}

async function fetchInvoicePaymentRowsForInvoice(
  c: ReturnType<typeof client>,
  invoiceId: string
): Promise<InvoicePaymentSyncRow[]> {
  const schema = await getPaymentOptionalSchema();
  let data: unknown[] | null = null;
  let error: { message?: string } | null = null;

  if (schema.invoicePaymentLink && schema.invoicePaymentDate) {
    const res = await c
      .from("invoice_payments")
      .select(INVOICE_PAYMENT_SELECT_WITH_LINK)
      .eq("invoice_id", invoiceId);
    data = res.data as unknown[] | null;
    error = res.error as { message?: string } | null;
  } else if (schema.invoicePaymentLink) {
    const res = await c
      .from("invoice_payments")
      .select(INVOICE_PAYMENT_SELECT_WITH_LINK_NO_DATE)
      .eq("invoice_id", invoiceId);
    data = res.data as unknown[] | null;
    error = res.error as { message?: string } | null;
  } else if (schema.invoicePaymentDate) {
    const res = await c
      .from("invoice_payments")
      .select(INVOICE_PAYMENT_SELECT_WITHOUT_LINK)
      .eq("invoice_id", invoiceId);
    data = res.data as unknown[] | null;
    error = res.error as { message?: string } | null;
  } else {
    const res = await c
      .from("invoice_payments")
      .select(INVOICE_PAYMENT_SELECT_MINIMAL)
      .eq("invoice_id", invoiceId);
    data = res.data as unknown[] | null;
    error = res.error as { message?: string } | null;
  }

  if (error && isMissingColumn(error)) {
    const fallback = await c
      .from("invoice_payments")
      .select(INVOICE_PAYMENT_SELECT_MINIMAL)
      .eq("invoice_id", invoiceId);
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load invoice payments.");
  }
  return (data ?? []) as InvoicePaymentSyncRow[];
}

function invoicePaymentDate(row: InvoicePaymentSyncRow): string {
  return normalizeDate(row.paid_at ?? row.payment_date ?? null);
}

function isActiveInvoicePayment(row: InvoicePaymentSyncRow): boolean {
  return String(row.status ?? "Posted") !== "Voided";
}

async function resolvePaymentLedgerLink(
  c: ReturnType<typeof client>,
  payment: PaymentReceivedDbRow
): Promise<PaymentLedgerLinkResolution> {
  const invoicePayments = await fetchInvoicePaymentRowsForInvoice(c, payment.invoice_id);
  const active = invoicePayments.filter(isActiveInvoicePayment);
  const direct = active.find((row) => row.payment_received_id === payment.id);
  if (direct) return { status: "linked", row: direct, invoicePayments };

  const expectedMemo = memoForPayment(payment);
  const legacyMatches = active.filter(
    (row) =>
      amountsEqual(row.amount, payment.amount) &&
      invoicePaymentDate(row) === normalizeDate(payment.payment_date) &&
      normalizeMemo(row.memo ?? row.reference) === expectedMemo
  );

  if (legacyMatches.length === 1) {
    return { status: "legacy_matched", row: legacyMatches[0], invoicePayments };
  }
  return {
    status: legacyMatches.length > 1 ? "ambiguous" : "missing",
    row: null,
    invoicePayments,
  };
}

function activeInvoicePaymentsTotal(
  rows: InvoicePaymentSyncRow[],
  excludeId?: string | null
): number {
  return rows
    .filter((row) => isActiveInvoicePayment(row) && row.id !== excludeId)
    .reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0);
}

function invoiceStatusForPaidTotal(
  previousStatus: string | null | undefined,
  invoiceTotal: number,
  paidTotal: number
): string | null {
  const raw = String(previousStatus ?? "")
    .trim()
    .toLowerCase();
  if (raw === "void") return null;
  if (paidTotal + MONEY_EPSILON >= invoiceTotal) return "Paid";
  if (paidTotal > MONEY_EPSILON) return "Partially Paid";
  if (raw && raw !== "draft") return "Sent";
  return "Draft";
}

async function syncInvoicePaymentRow(
  c: ReturnType<typeof client>,
  invoicePaymentId: string,
  paymentId: string,
  payload: {
    amount: number;
    payment_date: string;
    payment_method: string | null;
    memo: string | null;
  }
): Promise<void> {
  const full = {
    amount: payload.amount,
    paid_at: payload.payment_date,
    payment_date: payload.payment_date,
    method: payload.payment_method,
    memo: payload.memo,
    status: "Posted",
    payment_received_id: paymentId,
  };
  let res = await c.from("invoice_payments").update(full).eq("id", invoicePaymentId);
  if (res.error && isInvoicePaymentDateWriteUnsupported(res.error)) {
    const withoutPaymentDate: Partial<typeof full> = { ...full };
    delete withoutPaymentDate.payment_date;
    res = await c.from("invoice_payments").update(withoutPaymentDate).eq("id", invoicePaymentId);
  }
  if (res.error && isMissingColumn(res.error)) {
    const withoutLink: Partial<typeof full> = { ...full };
    delete withoutLink.payment_received_id;
    res = await c.from("invoice_payments").update(withoutLink).eq("id", invoicePaymentId);
  }
  if (
    res.error &&
    (isMissingColumn(res.error) || isInvoicePaymentDateWriteUnsupported(res.error))
  ) {
    const withoutPaymentDate: Partial<typeof full> = { ...full };
    delete withoutPaymentDate.payment_date;
    delete withoutPaymentDate.payment_received_id;
    res = await c.from("invoice_payments").update(withoutPaymentDate).eq("id", invoicePaymentId);
  }
  if (res.error) throw new Error(res.error.message ?? "Failed to update invoice ledger.");
}

async function updatePaymentAttachments(
  c: ReturnType<typeof client>,
  payment: PaymentReceivedDbRow,
  attachments: UpdatePaymentReceivedAttachmentPayload[] | undefined
): Promise<void> {
  if (attachments === undefined) return;

  const current = await fetchPaymentAttachmentsByPaymentIds(c, [payment.id]);
  const explicit = current.get(payment.id) ?? [];
  const keepIds = new Set(
    attachments.map((att) => (att.id ?? "").trim()).filter((id) => id && !id.startsWith("legacy-"))
  );
  const remove = explicit.filter((att) => !keepIds.has(att.id));
  if (remove.length > 0) {
    const { error } = await c
      .from("payment_received_attachments")
      .delete()
      .in(
        "id",
        remove.map((att) => att.id)
      );
    if (error && !isMissingTable(error) && !isMissingColumn(error)) {
      throw new Error(error.message ?? "Failed to remove attachments.");
    }
    const storagePaths = remove
      .map((att) => att.file_url.trim())
      .filter((url) => url && !isDirectAttachmentUrl(url));
    if (storagePaths.length > 0) {
      try {
        await c.storage.from("payment-attachments").remove(storagePaths);
      } catch {
        /* best effort storage cleanup */
      }
    }
  }

  const keepLegacy = attachments.some((att) => att.id === `legacy-${payment.id}`);
  if (!keepLegacy && payment.attachment_url?.trim()) {
    await c.from("payments_received").update({ attachment_url: null }).eq("id", payment.id);
  }

  const next = attachments.filter((att) => !(att.id ?? "").trim());
  await insertPaymentAttachments(c, payment.id, next);
}

export async function getPaymentAttachmentPreviewUrl(
  attachment: Pick<PaymentReceivedAttachment, "file_url">
): Promise<string> {
  const url = attachment.file_url.trim();
  if (!url) throw new Error("Attachment URL is missing.");
  if (isDirectAttachmentUrl(url)) return url;

  const c = client();
  const { data, error } = await c.storage
    .from("payment-attachments")
    .createSignedUrl(url, 60 * 60 * 6);
  if (error) throw new Error(error.message ?? "Unable to open attachment.");
  return data?.signedUrl ?? url;
}

/** List all payments received with invoice_no and project name. */
export async function getPaymentsReceived(): Promise<PaymentReceivedWithMeta[]> {
  const c = client();
  const schema = await getPaymentOptionalSchema();
  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  if (schema.paymentsReceivedStatus) {
    const r = await c
      .from("payments_received")
      .select(PAYMENT_RECEIVED_SELECT_WITH_STATUS)
      .neq("status", "void")
      .order("payment_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (!schema.paymentsReceivedStatus || (error && isMissingColumn(error))) {
    const r = await c
      .from("payments_received")
      .select(PAYMENT_RECEIVED_SELECT_WITHOUT_STATUS)
      .order("payment_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payments received.");
  }
  const list = (rows ?? []) as PaymentReceivedDbRow[];
  if (list.length === 0) return [];
  const invoiceIds = Array.from(new Set(list.map((r) => r.invoice_id)));
  const projectIds = Array.from(new Set(list.map((r) => r.project_id).filter(Boolean))) as string[];
  const [invRes, projRes, withAttachments] = await Promise.all([
    c.from("invoices").select("id, invoice_no").in("id", invoiceIds),
    projectIds.length
      ? c.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    attachPaymentAttachments(c, list),
  ]);
  const invoiceNoById = new Map(
    (invRes.data ?? []).map((r: { id: string; invoice_no?: string }) => [
      r.id,
      r.invoice_no ?? null,
    ])
  );
  const projectNameById = new Map(
    (projRes.data ?? []).map((r: { id: string; name?: string }) => [r.id, r.name ?? null])
  );
  return withAttachments.map((r) => ({
    ...r,
    invoice_no: invoiceNoById.get(r.invoice_id) ?? null,
    project_name: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
  }));
}

export async function getPaymentReceivedById(
  paymentId: string
): Promise<PaymentReceivedDetail | null> {
  const c = client();
  const row = await fetchPaymentReceivedDbRow(c, paymentId);
  if (!row || String(row.status ?? "") === "void") return null;

  const [withAttachments, invoiceRes, link] = await Promise.all([
    attachPaymentAttachments(c, [row]),
    c
      .from("invoices")
      .select("id, invoice_no, project_id, client_name, total, status")
      .eq("id", row.invoice_id)
      .maybeSingle(),
    resolvePaymentLedgerLink(c, row),
  ]);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message ?? "Failed to load invoice.");
  const invoice = invoiceRes.data as {
    id: string;
    invoice_no?: string | null;
    project_id?: string | null;
    client_name?: string | null;
    total?: number | null;
    status?: string | null;
  } | null;

  const projectId = row.project_id || invoice?.project_id || null;
  const projectRes = projectId
    ? await c.from("projects").select("id, name").eq("id", projectId).maybeSingle()
    : { data: null, error: null };
  if (projectRes.error && !isMissingTable(projectRes.error)) {
    throw new Error(projectRes.error.message ?? "Failed to load project.");
  }

  const invoiceTotal = Number(invoice?.total ?? row.amount ?? 0) || 0;
  const paidExcluding = invoice
    ? activeInvoicePaymentsTotal(link.invoicePayments, link.row?.id ?? null)
    : 0;
  const maxEditable = invoice ? Math.max(0, invoiceTotal - paidExcluding) : Number(row.amount ?? 0);
  const payment = withAttachments[0];

  return {
    ...payment,
    invoice_no: invoice?.invoice_no ?? null,
    project_name: ((projectRes.data as { name?: string | null } | null)?.name ?? null) || null,
    invoice_total: invoiceTotal,
    invoice_status: invoice?.status ?? null,
    paid_total_excluding_payment: paidExcluding,
    max_editable_amount: maxEditable,
    ledger_link_status: link.status,
    can_edit_financial: Boolean(invoice && link.row),
  };
}

/** Get payments for a single invoice. */
export async function getPaymentsReceivedByInvoiceId(
  invoiceId: string
): Promise<PaymentReceivedRow[]> {
  const c = client();
  const schema = await getPaymentOptionalSchema();
  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  if (schema.paymentsReceivedStatus) {
    const r = await c
      .from("payments_received")
      .select(PAYMENT_RECEIVED_SELECT_WITH_STATUS)
      .eq("invoice_id", invoiceId)
      .neq("status", "void")
      .order("payment_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (!schema.paymentsReceivedStatus || (error && isMissingColumn(error))) {
    const r = await c
      .from("payments_received")
      .select(PAYMENT_RECEIVED_SELECT_WITHOUT_STATUS)
      .eq("invoice_id", invoiceId)
      .order("payment_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payments.");
  }
  return attachPaymentAttachments(c, (rows ?? []) as PaymentReceivedDbRow[]);
}

/** Sum of payments_received.amount for an invoice. */
export async function getSumPaymentsReceivedByInvoiceId(invoiceId: string): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from("payments_received")
    .select("amount")
    .eq("invoice_id", invoiceId);
  if (error || !rows) return 0;
  return (rows as { amount: number }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/**
 * Create a payment received. Inserts into payments_received and into invoice_payments
 * so the existing invoice trigger updates paid_total, balance_due, and status.
 */
function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|could not find the .* column|schema cache/i.test(m);
}

function isInvoicePaymentDateWriteUnsupported(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /payment_date/i.test(m) && /non-DEFAULT|generated|cannot insert|cannot update/i.test(m);
}

export async function createPaymentReceived(
  payload: CreatePaymentReceivedPayload,
  explicitClient?: SupabaseClient
): Promise<PaymentReceivedRow> {
  const c = client(explicitClient);
  const paymentDate = payload.payment_date.slice(0, 10);

  // Financial safety checks:
  // - Prevent paying a fully-paid invoice
  // - Prevent overpayment beyond remaining balance
  const invRes = await c
    .from("invoices")
    .select("id, total, status")
    .eq("id", payload.invoice_id)
    .maybeSingle();
  if (invRes.error) throw new Error(invRes.error.message ?? "Failed to load invoice.");
  if (!invRes.data) throw new Error("Invoice not found.");
  const total = Number((invRes.data as { total?: number | null }).total ?? 0) || 0;
  const invStatusRaw = String((invRes.data as { status?: string | null }).status ?? "");

  const payRes = await c
    .from("invoice_payments")
    .select("amount, status")
    .eq("invoice_id", payload.invoice_id);
  if (payRes.error) throw new Error(payRes.error.message ?? "Failed to load invoice payments.");
  const paidTotal = (
    (payRes.data ?? []) as Array<{ amount?: number | null; status?: string | null }>
  )
    .filter((p) => String(p.status ?? "") !== "Voided")
    .reduce((s, p) => s + (Number(p.amount ?? 0) || 0), 0);
  const remaining = Math.max(0, total - paidTotal);
  if (remaining <= 0.0000001) throw new Error("Invoice already fully paid");
  if ((Number(payload.amount) || 0) - remaining > 0.0000001) {
    throw new Error("Payment exceeds remaining balance");
  }

  // Full insert with all optional columns. If schema cache lags, retry stripping unknown columns.
  const insertAttempts: Record<string, unknown>[] = [
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      customer_name: payload.customer_name ?? "",
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
      deposit_account: payload.deposit_account ?? null,
      notes: payload.notes ?? null,
      attachment_url: payload.attachment_url ?? null,
    },
    // Without attachment_url
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      customer_name: payload.customer_name ?? "",
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
      deposit_account: payload.deposit_account ?? null,
      notes: payload.notes ?? null,
    },
    // Without deposit_account + attachment_url
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      customer_name: payload.customer_name ?? "",
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
      notes: payload.notes ?? null,
    },
    // Without customer_name (old schema)
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
    },
    // Minimal
    {
      invoice_id: payload.invoice_id,
      payment_date: paymentDate,
      amount: payload.amount,
    },
  ];

  // Select columns: try full then fallback to minimal
  const selectAttempts = [
    "id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, attachment_url, status, created_at",
    "id, invoice_id, project_id, payment_date, amount, payment_method, created_at",
    "id, invoice_id, payment_date, amount, created_at",
  ];

  let row: PaymentReceivedDbRow | null = null;
  let lastError: { message?: string } | null = null;

  for (const insertRow of insertAttempts) {
    for (const selectCols of selectAttempts) {
      const { data, error } = await c
        .from("payments_received")
        .insert(insertRow)
        .select(selectCols)
        .single();
      if (!error) {
        row = data as unknown as PaymentReceivedDbRow;
        break;
      }
      lastError = error as { message?: string };
      if (!isMissingColumn(lastError)) break;
    }
    if (row) break;
    if (lastError && !isMissingColumn(lastError)) break;
  }

  if (!row) throw new Error(lastError?.message ?? "Failed to create payment.");
  const payment = row;

  // Auto-create deposit record (payment_id, invoice_id, project_id, customer_name, deposit_account, amount, payment_method, deposit_date)
  await createDepositFromPayment(
    {
      id: payment.id,
      invoice_id: payment.invoice_id,
      project_id: payment.project_id,
      amount: payment.amount,
      payment_date: payment.payment_date,
      deposit_account: payment.deposit_account,
      customer_name: payment.customer_name,
      payment_method: payment.payment_method ?? null,
    },
    c
  );

  // Sync to invoice_payments so balance / AR derivation sees the payment.
  const syncFull = {
    invoice_id: payload.invoice_id,
    paid_at: paymentDate,
    payment_date: paymentDate,
    amount: payload.amount,
    method: payload.payment_method || null,
    memo: payload.notes ?? payload.deposit_account ?? null,
    status: "Posted" as const,
    payment_received_id: payment.id,
  };
  let syncRes = await c.from("invoice_payments").insert(syncFull);
  if (syncRes.error && isInvoicePaymentDateWriteUnsupported(syncRes.error)) {
    const withoutPaymentDate: Partial<typeof syncFull> = { ...syncFull };
    delete withoutPaymentDate.payment_date;
    syncRes = await c.from("invoice_payments").insert(withoutPaymentDate);
  }
  if (syncRes.error && isMissingColumn(syncRes.error)) {
    const withoutLink: Partial<typeof syncFull> = { ...syncFull };
    delete withoutLink.payment_received_id;
    syncRes = await c.from("invoice_payments").insert(withoutLink);
  }
  if (
    syncRes.error &&
    (isMissingColumn(syncRes.error) || isInvoicePaymentDateWriteUnsupported(syncRes.error))
  ) {
    syncRes = await c.from("invoice_payments").insert({
      invoice_id: payload.invoice_id,
      paid_at: paymentDate,
      amount: payload.amount,
      status: "Posted",
    });
  }
  if (syncRes.error) {
    throw new Error(
      syncRes.error.message ?? "Payment saved but failed to sync to invoice_payments."
    );
  }

  // Auto-calculate invoice status (stored) based on paid vs total.
  // Map requested statuses: paid/partial/sent → Paid/Partially Paid/Sent (existing UI expects title-case).
  const newPaid = paidTotal + (Number(payload.amount) || 0);
  if (invStatusRaw.trim().toLowerCase() !== "void") {
    let nextStatus: string | null = null;
    if (newPaid + 0.0000001 >= total) nextStatus = "Paid";
    else if (newPaid > 0.0000001) nextStatus = "Partially Paid";
    else if (invStatusRaw.trim().toLowerCase() !== "draft") nextStatus = "Sent";
    if (nextStatus) {
      await c.from("invoices").update({ status: nextStatus }).eq("id", payload.invoice_id);
    }
  }

  const attachments = await insertPaymentAttachments(c, payment.id, payload.attachments);

  return { ...payment, attachments };
}

export async function updatePaymentReceived(
  payload: UpdatePaymentReceivedPayload
): Promise<PaymentReceivedDetail> {
  const c = client();
  const paymentId = payload.id.trim();
  if (!paymentId) throw new Error("Payment id is required.");

  const existing = await fetchPaymentReceivedDbRow(c, paymentId);
  if (!existing || String(existing.status ?? "") === "void") {
    throw new Error("Payment not found.");
  }

  const nextPaymentDate = normalizeDate(payload.payment_date ?? existing.payment_date);
  const nextAmount = payload.amount == null ? Number(existing.amount) || 0 : Number(payload.amount);
  const nextMethod =
    payload.payment_method === undefined
      ? (existing.payment_method ?? null)
      : payload.payment_method;
  const nextDepositAccount =
    payload.deposit_account === undefined
      ? (existing.deposit_account ?? null)
      : payload.deposit_account;
  const nextNotes = payload.notes === undefined ? (existing.notes ?? null) : payload.notes;

  if (!nextPaymentDate) throw new Error("Payment date is required.");
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new Error("Enter a valid amount.");
  }

  const amountChanged = !amountsEqual(nextAmount, existing.amount);
  const dateChanged = nextPaymentDate !== normalizeDate(existing.payment_date);
  const methodChanged = normalizeMemo(nextMethod) !== normalizeMemo(existing.payment_method);
  const accountChanged =
    normalizeMemo(nextDepositAccount) !== normalizeMemo(existing.deposit_account);
  const ledgerAffectingChange = amountChanged || dateChanged || methodChanged || accountChanged;

  const [invoiceRes, link] = await Promise.all([
    c.from("invoices").select("id, total, status").eq("id", existing.invoice_id).maybeSingle(),
    resolvePaymentLedgerLink(c, existing),
  ]);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message ?? "Failed to load invoice.");
  const invoice = invoiceRes.data as {
    id: string;
    total?: number | null;
    status?: string | null;
  } | null;

  if (ledgerAffectingChange && !link.row) {
    throw new Error(
      link.status === "ambiguous"
        ? "This legacy payment has multiple possible invoice ledger matches. Edit notes or attachments only."
        : "This legacy payment is not linked to an invoice ledger row. Edit notes or attachments only."
    );
  }
  if (ledgerAffectingChange && !invoice) {
    throw new Error("This payment's invoice is missing. Edit notes or attachments only.");
  }

  const invoiceTotal = Number(invoice?.total ?? existing.amount ?? 0) || 0;
  const paidExcluding = invoice
    ? activeInvoicePaymentsTotal(link.invoicePayments, link.row?.id ?? null)
    : 0;
  const maxEditable = invoice ? Math.max(0, invoiceTotal - paidExcluding) : Number(existing.amount);
  if (ledgerAffectingChange && nextAmount - maxEditable > MONEY_EPSILON) {
    throw new Error("Payment exceeds the invoice balance available for this edit.");
  }

  const updateRow: Record<string, unknown> = {
    payment_date: nextPaymentDate,
    amount: nextAmount,
    payment_method: normalizeMemo(nextMethod) || null,
    deposit_account: normalizeMemo(nextDepositAccount) || null,
    notes: normalizeMemo(nextNotes) || null,
  };
  if (!ledgerAffectingChange) {
    delete updateRow.payment_date;
    delete updateRow.amount;
    delete updateRow.payment_method;
    delete updateRow.deposit_account;
  }

  if (Object.keys(updateRow).length > 0) {
    const { error } = await c.from("payments_received").update(updateRow).eq("id", paymentId);
    if (error) throw new Error(error.message ?? "Failed to update payment.");
  }

  if (ledgerAffectingChange && link.row) {
    const memo = normalizeMemo(nextNotes) || normalizeMemo(nextDepositAccount) || null;
    await syncInvoicePaymentRow(c, link.row.id, paymentId, {
      amount: nextAmount,
      payment_date: nextPaymentDate,
      payment_method: normalizeMemo(nextMethod) || null,
      memo,
    });

    const depositRow: Record<string, unknown> = {
      amount: nextAmount,
      deposit_date: nextPaymentDate,
      deposit_account: normalizeMemo(nextDepositAccount) || null,
      payment_method: normalizeMemo(nextMethod) || null,
      customer_name: existing.customer_name,
      project_id: existing.project_id ?? null,
      invoice_id: existing.invoice_id,
      status: "recorded",
    };
    const depositRes = await c.from("deposits").update(depositRow).eq("payment_id", paymentId);
    if (
      depositRes.error &&
      !isMissingTable(depositRes.error) &&
      !isMissingColumn(depositRes.error)
    ) {
      throw new Error(depositRes.error.message ?? "Failed to update linked deposit.");
    }

    const newPaidTotal = paidExcluding + nextAmount;
    const nextStatus = invoiceStatusForPaidTotal(invoice?.status, invoiceTotal, newPaidTotal);
    if (nextStatus) {
      await c.from("invoices").update({ status: nextStatus }).eq("id", existing.invoice_id);
    }
  } else if (link.row && normalizeMemo(nextNotes) !== normalizeMemo(existing.notes)) {
    const memo = normalizeMemo(nextNotes) || normalizeMemo(existing.deposit_account) || null;
    await syncInvoicePaymentRow(c, link.row.id, paymentId, {
      amount: Number(existing.amount) || 0,
      payment_date: normalizeDate(existing.payment_date),
      payment_method: existing.payment_method ?? null,
      memo,
    });
  }

  await updatePaymentAttachments(c, existing, payload.attachments);

  const updated = await getPaymentReceivedById(paymentId);
  if (!updated) throw new Error("Payment updated, but could not be reloaded.");
  return updated;
}
