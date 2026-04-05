/**
 * Expenses + expense_lines — Supabase only. No mock data.
 * Tables: expenses, expense_lines, attachments (entity_type = 'expense').
 */

import { getSupabaseClient } from "@/lib/supabase";

export type ExpenseAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
};

export type ExpenseLine = {
  id: string;
  projectId: string | null;
  category: string;
  costCode?: string | null;
  memo?: string | null;
  amount: number;
};

export type Expense = {
  id: string;
  date: string;
  vendorName: string;
  paymentMethod: string;
  referenceNo?: string;
  notes?: string;
  attachments: ExpenseAttachment[];
  lines: ExpenseLine[];
  linkedBankTxId?: string | null;
  /** Receipt file URL (storage bucket receipts). */
  receiptUrl?: string | null;
  /** Workflow status (DB may include additional legacy values). */
  status?:
    | "pending"
    | "needs_review"
    | "reviewed"
    | "approved"
    | "reimbursed"
    | "reimbursable"
    | "paid"
    | "draft";
  workerId?: string | null;
  /** Card name when payment method is Credit Card or Debit Card. */
  cardName?: string | null;
  /** Payment source account (from Accounts module). */
  accountId?: string | null;
  /** Payment account (Cash / card / bank). */
  paymentAccountId?: string | null;
  paymentAccountName?: string | null;
  /** Optional header-level project (expense_lines may also carry project per line). */
  headerProjectId?: string | null;
  /** company | reimbursement | receipt_upload */
  sourceType?: "company" | "reimbursement" | "receipt_upload";
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  vendor?: string;
  vendor_name?: string;
  payment_method?: string;
  reference_no?: string | null;
  notes: string | null;
  total?: number;
  line_count?: number;
  receipt_url?: string | null;
  status?: string | null;
  worker_id?: string | null;
  card_name?: string | null;
  account_id?: string | null;
  payment_account_id?: string | null;
  project_id?: string | null;
  source?: string | null;
  source_id?: string | null;
  source_type?: string | null;
};

type ExpenseLineRow = {
  id: string;
  expense_id: string;
  project_id?: string | null;
  category?: string;
  cost_code?: string | null;
  memo?: string | null;
  amount?: number;
  total?: number;
};

const WORKER_REIMBURSEMENT_SOURCE = "worker_reimbursement";

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /could not find the function|schema cache/i.test(m);
}

const HINT = "Run supabase/migrations/202602280008_create_expenses.sql";

async function getLinkedBankTxId(expenseId: string): Promise<string | null> {
  const c = client();
  const { data } = await c
    .from("bank_transactions")
    .select("id")
    .eq("linked_expense_id", expenseId)
    .maybeSingle();
  return data?.id ?? null;
}

async function getLegacyAttachmentsFromTable(expenseId: string): Promise<ExpenseAttachment[]> {
  const c = client();
  const { data: rows } = await c
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, file_path, created_at")
    .eq("entity_type", "expense")
    .eq("entity_id", expenseId);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name ?? "",
    mimeType: r.mime_type ?? "",
    size: Number(r.size_bytes) || 0,
    url: r.file_path ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
  }));
}

/** Rows from public.expense_attachments (file_url holds storage path in expense-attachments bucket). */
async function getExpenseAttachmentRows(expenseId: string): Promise<ExpenseAttachment[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("expense_attachments")
    .select("id, file_url, file_type, created_at")
    .eq("expense_id", expenseId);
  if (error || !rows || !Array.isArray(rows)) return [];
  return rows.map((r) => {
    const ft = (r as { file_type?: string }).file_type === "pdf" ? "pdf" : "image";
    return {
      id: (r as { id: string }).id,
      fileName: ft === "pdf" ? "attachment.pdf" : "attachment.jpg",
      mimeType: ft === "pdf" ? "application/pdf" : "image/jpeg",
      size: 0,
      url: (r as { file_url?: string }).file_url ?? "",
      createdAt: (r as { created_at?: string }).created_at ?? new Date().toISOString(),
    };
  });
}

async function getAttachments(expenseId: string): Promise<ExpenseAttachment[]> {
  const [legacy, dedicated] = await Promise.all([
    getLegacyAttachmentsFromTable(expenseId),
    getExpenseAttachmentRows(expenseId),
  ]);
  const merged = [...legacy, ...dedicated];
  merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return merged;
}

function toExpenseLine(r: ExpenseLineRow): ExpenseLine {
  const raw = r as ExpenseLineRow & { projectId?: string | null };
  const pid =
    r.project_id != null && r.project_id !== ""
      ? r.project_id
      : raw.projectId != null && raw.projectId !== ""
        ? raw.projectId
        : null;
  return {
    id: r.id,
    projectId: pid,
    category: r.category ?? "Other",
    costCode: r.cost_code ?? undefined,
    memo: r.memo ?? undefined,
    amount: Number(r.amount ?? r.total) || 0,
  };
}

function deriveSourceType(row: ExpenseRow): Expense["sourceType"] {
  const st = (row.source_type ?? "").trim().toLowerCase();
  if (st === "reimbursement" || st === "receipt_upload" || st === "company")
    return st as Expense["sourceType"];
  if ((row.source ?? "").trim() === WORKER_REIMBURSEMENT_SOURCE) return "reimbursement";
  return "company";
}

function normalizeExpenseStatus(s: string | null | undefined): NonNullable<Expense["status"]> {
  const v = (s ?? "pending").toLowerCase();
  if (
    v === "needs_review" ||
    v === "reviewed" ||
    v === "approved" ||
    v === "reimbursed" ||
    v === "paid" ||
    v === "reimbursable" ||
    v === "draft"
  ) {
    return v as NonNullable<Expense["status"]>;
  }
  return "pending";
}

async function fetchPaymentAccountNameMap(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  const c = client();
  const m = new Map<string, string>();
  const { data, error } = await c.from("payment_accounts").select("id,name").in("id", unique);
  if (error && isMissingTable(error)) return m;
  if (!error && data) {
    for (const r of data as { id: string; name: string }[]) {
      m.set(r.id, r.name);
    }
  }
  const missing = unique.filter((id) => !m.has(id));
  if (missing.length === 0) return m;
  await Promise.all(
    missing.map(async (id) => {
      const { data: row, error: rowErr } = await c
        .from("payment_accounts")
        .select("name")
        .eq("id", id)
        .maybeSingle();
      if (rowErr || !row) return;
      const name = (row as { name?: string }).name;
      if (typeof name === "string" && name.length > 0) m.set(id, name);
    })
  );
  return m;
}

type ExpenseRowWithPaymentEmbed = ExpenseRow & {
  payment_accounts?: { name?: string } | null;
};

async function toExpense(
  row: ExpenseRow,
  lines: ExpenseLineRow[],
  attachments: ExpenseAttachment[],
  linkedBankTxId: string | null,
  paymentAccountNames?: Map<string, string>
): Promise<Expense> {
  const status = normalizeExpenseStatus(row.status);
  const paId = row.payment_account_id ?? null;
  const embedded = (row as ExpenseRowWithPaymentEmbed).payment_accounts?.name;
  const fromEmbed = typeof embedded === "string" && embedded.length > 0 ? embedded : null;
  const paymentAccountName = fromEmbed ?? (paId ? (paymentAccountNames?.get(paId) ?? null) : null);
  return {
    id: row.id,
    date: row.expense_date?.slice(0, 10) ?? "",
    vendorName: row.vendor ?? row.vendor_name ?? "",
    paymentMethod: row.payment_method ?? "Card",
    referenceNo: row.reference_no ?? undefined,
    notes: row.notes ?? undefined,
    attachments,
    lines: lines.map(toExpenseLine),
    linkedBankTxId: linkedBankTxId ?? undefined,
    receiptUrl: row.receipt_url ?? undefined,
    status,
    workerId: row.worker_id ?? undefined,
    cardName: row.card_name ?? undefined,
    accountId: row.account_id ?? undefined,
    paymentAccountId: paId ?? undefined,
    paymentAccountName,
    headerProjectId:
      row.project_id != null && String(row.project_id).trim() !== ""
        ? String(row.project_id)
        : undefined,
    sourceType: deriveSourceType(row),
  };
}

/** Select columns: base + optional receipt_url, status, worker_id. */
const EXPENSE_COLS_CORE =
  "id,expense_date,vendor,vendor_name,notes,payment_method,reference_no,total,line_count,receipt_url,status,worker_id,card_name,account_id,payment_account_id,project_id";
const EXPENSE_COLS_FULL = `${EXPENSE_COLS_CORE},source,source_id,source_type`;
/** Same as pre-migration list (no source columns). */
const EXPENSE_COLS_FULL_LEGACY_META = EXPENSE_COLS_CORE;
/** Fallback when payment_method column does not exist (e.g. account_id-only schema). */
const EXPENSE_COLS_FULL_NO_PAYMENT_METHOD =
  "id,expense_date,vendor,vendor_name,notes,reference_no,total,line_count,receipt_url,status,worker_id,card_name,account_id,payment_account_id,project_id";
/** Legacy: table may have only vendor (no vendor_name). No payment_method so works when column is missing. */
const EXPENSE_COLS_LEGACY =
  "id,expense_date,vendor,notes,reference_no,total,line_count,payment_account_id";
/** Minimal: no reference_no, no payment_method (for schemas that only have core columns). */
const EXPENSE_COLS_MINIMAL =
  "id,expense_date,vendor,vendor_name,notes,total,line_count,payment_account_id";
const EXPENSE_COLS_MINIMAL_LEGACY =
  "id,expense_date,vendor,notes,total,line_count,payment_account_id";
/** Fallback when total/line_count do not exist: total is derived from expense_lines in app. */
const EXPENSE_COLS_NO_TOTAL = "id,expense_date,vendor,vendor_name,notes,payment_account_id";
const EXPENSE_COLS_NO_TOTAL_LEGACY = "id,expense_date,vendor,notes,payment_account_id";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|schema cache/i.test(m);
}

function isPaymentEmbedUnsupported(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return isMissingColumn(err) || /relationship|Could not find a relationship|PGRST200/i.test(m);
}

export async function getExpenses(): Promise<Expense[]> {
  const c = client();
  let rows: unknown[] = [];
  const resEmbed = await c
    .from("expenses")
    .select(`${EXPENSE_COLS_FULL}, payment_accounts ( name )`)
    .order("expense_date", { ascending: false });

  const resFlat =
    resEmbed.error && isPaymentEmbedUnsupported(resEmbed.error)
      ? await c
          .from("expenses")
          .select(EXPENSE_COLS_FULL)
          .order("expense_date", { ascending: false })
      : null;

  const res = resFlat ?? resEmbed;

  if (!res.error) {
    rows = res.data ?? [];
  } else if (!isMissingColumn(res.error)) {
    if (isMissingTable(res.error)) throw new Error(`Expenses table not found. ${HINT}`);
    throw new Error(res.error.message ? `${res.error.message} ${HINT}` : HINT);
  } else {
    const core = await c
      .from("expenses")
      .select(EXPENSE_COLS_FULL_LEGACY_META)
      .order("expense_date", { ascending: false });
    if (!core.error) {
      rows = core.data ?? [];
    } else if (!isMissingColumn(core.error)) {
      if (isMissingTable(core.error)) throw new Error(`Expenses table not found. ${HINT}`);
      throw new Error(core.error.message ? `${core.error.message} ${HINT}` : HINT);
    } else {
      const fallback = await c
        .from("expenses")
        .select(EXPENSE_COLS_FULL_NO_PAYMENT_METHOD)
        .order("expense_date", { ascending: false });
      if (fallback.error && isMissingColumn(fallback.error)) {
        const legacy = await c
          .from("expenses")
          .select(EXPENSE_COLS_LEGACY)
          .order("expense_date", { ascending: false });
        if (legacy.error && isMissingColumn(legacy.error)) {
          const minimal = await c
            .from("expenses")
            .select(EXPENSE_COLS_MINIMAL)
            .order("expense_date", { ascending: false });
          if (minimal.error && isMissingColumn(minimal.error)) {
            const minimalLegacy = await c
              .from("expenses")
              .select(EXPENSE_COLS_MINIMAL_LEGACY)
              .order("expense_date", { ascending: false });
            if (minimalLegacy.error && isMissingColumn(minimalLegacy.error)) {
              const noTotal = await c
                .from("expenses")
                .select(EXPENSE_COLS_NO_TOTAL)
                .order("expense_date", { ascending: false });
              if (noTotal.error && isMissingColumn(noTotal.error)) {
                const noTotalLegacy = await c
                  .from("expenses")
                  .select(EXPENSE_COLS_NO_TOTAL_LEGACY)
                  .order("expense_date", { ascending: false });
                if (noTotalLegacy.error) throw new Error(noTotalLegacy.error.message ?? HINT);
                rows = noTotalLegacy.data ?? [];
              } else if (noTotal.error) {
                throw new Error(noTotal.error.message ?? HINT);
              } else {
                rows = noTotal.data ?? [];
              }
            } else if (minimalLegacy.error) {
              throw new Error(minimalLegacy.error.message ?? HINT);
            } else {
              rows = minimalLegacy.data ?? [];
            }
          } else if (minimal.error) {
            throw new Error(minimal.error.message ?? HINT);
          } else {
            rows = minimal.data ?? [];
          }
        } else if (legacy.error) {
          throw new Error(legacy.error.message ?? HINT);
        } else {
          rows = legacy.data ?? [];
        }
      } else if (fallback.error) {
        throw new Error(fallback.error.message ?? HINT);
      } else {
        rows = fallback.data ?? [];
      }
    }
  }
  const paymentNameMap = await fetchPaymentAccountNameMap(
    (rows as ExpenseRow[]).map((r) => r.payment_account_id)
  );
  const result: Expense[] = [];
  for (const row of rows) {
    const r = row as ExpenseRow;
    const { data: lineRows } = await c.from("expense_lines").select("*").eq("expense_id", r.id);
    const lines = (lineRows ?? []) as ExpenseLineRow[];
    const attachments = await getAttachments(r.id);
    const linkedBankTxId = await getLinkedBankTxId(r.id);
    result.push(await toExpense(r, lines, attachments, linkedBankTxId, paymentNameMap));
  }
  return result;
}

export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  const c = client();
  const res = await c.from("expenses").select(EXPENSE_COLS_FULL).eq("id", expenseId).maybeSingle();
  let row: ExpenseRow | null = null;
  if (res.error) {
    if (!isMissingColumn(res.error)) {
      if (isMissingTable(res.error)) throw new Error(`Expenses table not found. ${HINT}`);
      return null;
    }
    const coreTry = await c
      .from("expenses")
      .select(EXPENSE_COLS_FULL_LEGACY_META)
      .eq("id", expenseId)
      .maybeSingle();
    if (!coreTry.error && coreTry.data) {
      row = coreTry.data as ExpenseRow;
    } else if (coreTry.error && !isMissingColumn(coreTry.error)) {
      return null;
    } else {
      const fallback = await c
        .from("expenses")
        .select(EXPENSE_COLS_FULL_NO_PAYMENT_METHOD)
        .eq("id", expenseId)
        .maybeSingle();
      if (fallback.error && isMissingColumn(fallback.error)) {
        const legacy = await c
          .from("expenses")
          .select(EXPENSE_COLS_LEGACY)
          .eq("id", expenseId)
          .maybeSingle();
        if (legacy.error && isMissingColumn(legacy.error)) {
          const minimal = await c
            .from("expenses")
            .select(EXPENSE_COLS_MINIMAL)
            .eq("id", expenseId)
            .maybeSingle();
          if (minimal.error && isMissingColumn(minimal.error)) {
            const minimalLegacy = await c
              .from("expenses")
              .select(EXPENSE_COLS_MINIMAL_LEGACY)
              .eq("id", expenseId)
              .maybeSingle();
            if (minimalLegacy.error && isMissingColumn(minimalLegacy.error)) {
              const noTotal = await c
                .from("expenses")
                .select(EXPENSE_COLS_NO_TOTAL)
                .eq("id", expenseId)
                .maybeSingle();
              if (!noTotal.error && noTotal.data) row = noTotal.data as ExpenseRow;
              else if (noTotal.error && isMissingColumn(noTotal.error)) {
                const noTotalLegacy = await c
                  .from("expenses")
                  .select(EXPENSE_COLS_NO_TOTAL_LEGACY)
                  .eq("id", expenseId)
                  .maybeSingle();
                if (!noTotalLegacy.error && noTotalLegacy.data)
                  row = noTotalLegacy.data as ExpenseRow;
              }
            } else if (!minimalLegacy.error && minimalLegacy.data) {
              row = minimalLegacy.data as ExpenseRow;
            }
          } else if (!minimal.error && minimal.data) {
            row = minimal.data as ExpenseRow;
          }
        } else if (!legacy.error && legacy.data) {
          row = legacy.data as ExpenseRow;
        }
      } else if (!fallback.error && fallback.data) {
        row = fallback.data as ExpenseRow;
      }
    }
  } else {
    row = res.data as ExpenseRow | null;
  }
  if (!row) return null;
  const paymentNameMap = await fetchPaymentAccountNameMap([(row as ExpenseRow).payment_account_id]);
  const { data: lineRows } = await c.from("expense_lines").select("*").eq("expense_id", expenseId);
  const lines = (lineRows ?? []) as ExpenseLineRow[];
  const attachments = await getAttachments(expenseId);
  const linkedBankTxId = await getLinkedBankTxId(expenseId);
  return toExpense(row, lines, attachments, linkedBankTxId, paymentNameMap);
}

/** Distinct card names used for a given payment method (e.g. "Credit Card", "Debit Card"). For creatable select options. */
export async function getExpenseCardNames(paymentMethod: string): Promise<string[]> {
  const c = client();
  const trimmed = (paymentMethod ?? "").trim();
  if (!trimmed) return [];
  const { data: rows, error } = await c
    .from("expenses")
    .select("card_name")
    .eq("payment_method", trimmed)
    .not("card_name", "is", null);
  if (error) return [];
  const names = (rows ?? [])
    .map((r: { card_name?: string | null }) => (r.card_name ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(names)).sort();
}

export async function createExpense(payload: {
  date: string;
  vendorName: string;
  paymentMethod: string;
  referenceNo?: string;
  notes?: string;
  cardName?: string | null;
  accountId?: string | null;
  paymentAccountId?: string | null;
  lines: Array<{
    projectId: string | null;
    category: string;
    costCode?: string | null;
    memo?: string | null;
    amount: number;
  }>;
  linkedBankTxId?: string | null;
}): Promise<Expense> {
  const c = client();
  const date = payload.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const vendor = (payload.vendorName ?? "").trim();
  if (!vendor) throw new Error("Vendor name is required");
  const notes = payload.notes ?? null;

  const lines = payload.lines?.length ? payload.lines : [];
  const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  if (!(totalAmount > 0)) throw new Error("Amount must be greater than 0");

  const byProject = new Map<string | null, typeof lines>();
  for (const l of lines) {
    const key = l.projectId ?? null;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(l);
  }

  let firstId: string | null = null;
  const createdIds: string[] = [];
  for (const [projectId, group] of Array.from(byProject)) {
    const pLines = group.map((l) => ({
      description: l.memo ?? "",
      qty: 1,
      unit_cost: l.amount ?? 0,
      cost_code: l.costCode ?? null,
      memo: l.memo ?? null,
      amount: Number(l.amount) || 0,
    }));
    const category = group[0]?.category ?? "Other";

    const { data: expenseId, error } = await c.rpc("create_expense_with_lines", {
      p_project_id: projectId,
      p_vendor: vendor,
      p_category: category,
      p_expense_date: date,
      p_notes: notes,
      p_lines: pLines,
    });

    let id: string | null = null;
    if (error) {
      const msg = error.message ?? "";
      const rpcSchemaMismatch =
        /project_id.*expenses|column.*project_id.*relation.*expenses|expenses.*project_id/i.test(
          msg
        );
      if (!isMissingFunction(error) && !rpcSchemaMismatch)
        throw new Error(error.message ?? "Failed to create expense.");
      // Fallback: insert expense header then expense_lines directly.
      const totalGroupAmount = group.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      // Header row: canonical schema has no project_id / amount on expenses (lines carry project_id).
      const insertPayload: Record<string, unknown> = {
        expense_date: date,
        vendor_name: vendor,
        notes: notes,
        reference_no: payload.referenceNo?.trim() || null,
        total: totalGroupAmount,
        line_count: group.length,
        card_name: payload.cardName?.trim() || null,
        account_id: payload.accountId ?? null,
        payment_account_id: payload.paymentAccountId ?? null,
      };
      let expInsErr: { message?: string } | null = null;
      let expRow: { id: string } | null = null;
      let ins = await c
        .from("expenses")
        .insert({ ...insertPayload, payment_method: payload.paymentMethod ?? "Card" })
        .select("id")
        .single();
      if (ins.error && isMissingColumn(ins.error)) {
        ins = await c.from("expenses").insert(insertPayload).select("id").single();
      }
      if (ins.error && isMissingColumn(ins.error)) {
        ins = await c
          .from("expenses")
          .insert({
            expense_date: date,
            vendor: vendor,
            notes: notes,
            reference_no: payload.referenceNo?.trim() || null,
            total: totalGroupAmount,
            line_count: group.length,
            payment_method: payload.paymentMethod ?? "Card",
          })
          .select("id")
          .single();
      }
      expInsErr = ins.error as { message?: string } | null;
      expRow = ins.data as { id: string } | null;
      if (expInsErr) throw new Error(expInsErr.message ?? "Failed to create expense.");
      id = (expRow as { id: string } | null)?.id ?? null;
      if (id) {
        const lineInserts = group.map((l) => ({
          expense_id: id,
          project_id: l.projectId ?? null,
          category: l.category ?? "Other",
          cost_code: l.costCode ?? null,
          memo: l.memo ?? null,
          amount: Number(l.amount) || 0,
        }));
        // Strip unknown columns one at a time until insert succeeds (schema cache may lag)
        const stripLineKeys = (
          rows: typeof lineInserts,
          keys: ("cost_code" | "memo" | "category" | "project_id")[]
        ) =>
          rows.map((row) => {
            const copy = { ...row };
            for (const k of keys) delete copy[k];
            return copy;
          });
        const lineAttempts: Record<string, unknown>[][] = [
          lineInserts,
          stripLineKeys(lineInserts, ["cost_code", "memo"]),
          stripLineKeys(lineInserts, ["cost_code", "memo", "category"]),
          stripLineKeys(lineInserts, ["cost_code", "memo", "category", "project_id"]),
        ];
        let lineInsErr: { message?: string } | null = null;
        for (const attempt of lineAttempts) {
          const { error: err } = await c.from("expense_lines").insert(attempt);
          lineInsErr = err as { message?: string } | null;
          if (!lineInsErr) break;
          if (!isMissingColumn(lineInsErr)) break;
        }
        if (lineInsErr) throw new Error(lineInsErr.message ?? "Failed to create expense lines.");
      }
    } else {
      const rawId = expenseId;
      id = (Array.isArray(rawId) ? rawId[0] : rawId) as string | null;
    }
    if (id) {
      createdIds.push(id);
      if (!firstId) firstId = id;
    }
  }

  if (!firstId) throw new Error("Failed to create expense: no id returned.");

  const paymentMethodValue = payload.paymentMethod ?? "Card";
  const cardNameValue = payload.cardName?.trim() || null;
  const updatePayload: Record<string, unknown> = {
    card_name: cardNameValue,
    account_id: payload.accountId ?? null,
    payment_account_id: payload.paymentAccountId ?? null,
  };
  let updateErr: { message?: string } | null = null;
  const withPaymentMethod = { ...updatePayload, payment_method: paymentMethodValue };
  let upd = await c.from("expenses").update(withPaymentMethod).in("id", createdIds);
  if (upd.error && isMissingColumn(upd.error)) {
    upd = await c.from("expenses").update(updatePayload).in("id", createdIds);
  }
  updateErr = upd.error as { message?: string } | null;
  if (updateErr && !isMissingColumn(updateErr)) {
    throw new Error(updateErr.message ?? "Failed to update expense.");
  }

  const stUpd = await c.from("expenses").update({ source_type: "company" }).in("id", createdIds);
  if (stUpd.error && !isMissingColumn(stUpd.error)) {
    console.warn("[createExpense] source_type update:", stUpd.error.message);
  }

  const exp = await getExpenseById(firstId);
  if (!exp) throw new Error("Failed to load created expense.");
  const linkedBankTxId = payload.linkedBankTxId ?? (await getLinkedBankTxId(firstId));
  return { ...exp, linkedBankTxId: linkedBankTxId ?? undefined };
}

function isStatusConstraintError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /check constraint|status|invalid input value for enum|violates check/i.test(m);
}

/** Create a single expense from Quick Expense flow: one line; receipt optional.
 * Persists to real Supabase: expenses and expense_lines tables. No mock. */
export async function createQuickExpense(payload: {
  date: string;
  vendorName: string;
  totalAmount: number;
  /** Omit or empty when saving without a receipt file. */
  receiptUrl?: string | null;
  category?: string;
  notes?: string;
  projectId?: string | null;
  paymentAccountId?: string | null;
  /** Defaults: receipt_upload when receiptUrl set, else company. */
  sourceType?: "company" | "receipt_upload" | "reimbursement";
  /** When set, overrides default status (receipt → needs_review, else pending). */
  initialStatus?: NonNullable<Expense["status"]>;
}): Promise<Expense> {
  const c = client();
  const date = payload.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const vendor = (payload.vendorName ?? "").trim() || "Unknown";
  const total = Number(payload.totalAmount) || 0;
  const receiptUrl = (payload.receiptUrl ?? "").trim();
  const category = (payload.category ?? "Other").trim() || "Other";
  const notes = (payload.notes ?? "").trim();
  const rawPid = payload.projectId;
  const projectId = rawPid != null && String(rawPid).trim() !== "" ? String(rawPid).trim() : null;
  const sourceType: Expense["sourceType"] =
    payload.sourceType ?? (receiptUrl ? "receipt_upload" : "company");
  const resolvedStatus = payload.initialStatus ?? (receiptUrl ? "needs_review" : "pending");

  const insertRow: Record<string, unknown> = {
    expense_date: date,
    vendor_name: vendor,
    notes: notes || null,
    reference_no: null,
    total,
    /** Some schemas use NOT NULL `amount` on expenses (legacy); mirror `total` for quick create. */
    amount: total,
    line_count: 1,
    receipt_url: receiptUrl || null,
    status: resolvedStatus,
    source_type: sourceType,
  };
  if (payload.paymentAccountId !== undefined) {
    insertRow.payment_account_id = payload.paymentAccountId?.trim() || null;
  }
  let result = await c
    .from("expenses")
    .insert({ ...insertRow, payment_method: "Other" })
    .select("id")
    .single();
  if (result.error && isMissingColumn(result.error)) {
    const noSt = { ...insertRow };
    delete noSt.source_type;
    result = await c
      .from("expenses")
      .insert({ ...noSt, payment_method: "Other" })
      .select("id")
      .single();
  }
  if (result.error && isMissingColumn(result.error)) {
    const noAmt = { ...insertRow };
    delete noAmt.source_type;
    delete noAmt.amount;
    result = await c
      .from("expenses")
      .insert({ ...noAmt, payment_method: "Other" })
      .select("id")
      .single();
  }
  if (result.error && isStatusConstraintError(result.error)) {
    result = await c
      .from("expenses")
      .insert({
        ...insertRow,
        status: "pending",
        payment_method: "Other",
      })
      .select("id")
      .single();
  }
  if (result.error && isMissingColumn(result.error)) {
    result = await c.from("expenses").insert(insertRow).select("id").single();
  }
  if (
    result.error &&
    isStatusConstraintError(result.error) &&
    insertRow.status === "needs_review"
  ) {
    result = await c
      .from("expenses")
      .insert({ ...insertRow, status: "pending" })
      .select("id")
      .single();
  }
  if (result.error && isMissingColumn(result.error)) {
    const insertRowLegacy: Record<string, unknown> = {
      expense_date: date,
      vendor,
      notes: notes || null,
      reference_no: null,
      total,
      amount: total,
      line_count: 1,
      status: "pending",
    };
    result = await c.from("expenses").insert(insertRowLegacy).select("id").single();
  }
  if (result.error && isMissingColumn(result.error)) {
    const insertRowLegacyNoAmt: Record<string, unknown> = {
      expense_date: date,
      vendor,
      notes: notes || null,
      reference_no: null,
      total,
      line_count: 1,
      status: "pending",
    };
    result = await c.from("expenses").insert(insertRowLegacyNoAmt).select("id").single();
  }
  const { data: expRow, error: expErr } = result;
  if (expErr) throw new Error(expErr.message ?? "Failed to create quick expense.");
  const expenseId = (expRow as { id: string } | null)?.id;
  if (!expenseId) throw new Error("Failed to create quick expense: no id.");

  const lineBase = (includeProject: boolean): Record<string, unknown> => ({
    expense_id: expenseId,
    amount: total,
    ...(includeProject && projectId ? { project_id: projectId } : {}),
  });

  const lineAttempts: Record<string, unknown>[] = [
    { ...lineBase(true), category, memo: notes || null },
    { ...lineBase(true), category },
    { ...lineBase(true) },
    // If DB has no expense_lines.project_id (stale remote snapshot), still create the line;
    // expenses.project_id update below keeps header project.
    { ...lineBase(false), category, memo: notes || null },
    { ...lineBase(false), category },
    { ...lineBase(false) },
  ];

  let lineErr: { message?: string } | null = null;
  for (const attempt of lineAttempts) {
    const { error } = await c.from("expense_lines").insert(attempt);
    lineErr = error;
    if (!lineErr) break;
    if (!isMissingColumn(lineErr)) break;
  }
  if (lineErr) throw new Error(lineErr.message ?? "Failed to create expense line.");

  if (projectId) {
    const { error: hdrErr } = await c
      .from("expenses")
      .update({ project_id: projectId })
      .eq("id", expenseId);
    if (hdrErr && !isMissingColumn(hdrErr)) {
      console.warn("[createQuickExpense] expenses.project_id update:", hdrErr.message);
    }
  }

  if (payload.paymentAccountId !== undefined) {
    const paId = payload.paymentAccountId?.trim() || null;
    const paUpd = await c.from("expenses").update({ payment_account_id: paId }).eq("id", expenseId);
    if (paUpd.error && !isMissingColumn(paUpd.error)) {
      console.warn("[createQuickExpense] payment_account_id update:", paUpd.error.message);
    }
  }

  const exp = await getExpenseById(expenseId);
  if (!exp) throw new Error("Failed to load created expense.");
  return exp;
}

const REIMBURSEMENT_CATEGORY = "reimbursement";

/** Create an expense + one line for a paid worker reimbursement. Prevents duplicates by reference_no or source/source_id.
 * Stores reimbursement.project_id and reimbursement.worker_id on the expense so the list can show project and worker. */
export async function createExpenseFromPaidReimbursement(
  reimb: {
    id: string;
    workerId?: string | null;
    workerName?: string | null;
    vendor?: string | null;
    projectId?: string | null;
    amount?: number | null;
    description?: string | null;
  },
  opts?: { paymentMethod?: string | null; note?: string | null }
): Promise<Expense | null> {
  const c = client();
  const reimbursementId = reimb.id;
  const amount = Number(reimb.amount) ?? 0;
  const date = new Date().toISOString().slice(0, 10);
  const projectId = reimb.projectId ?? null;
  const vendorName =
    (reimb.vendor ?? "Worker Reimbursement")?.toString().trim() || "Worker Reimbursement";
  const paymentMethod = (opts?.paymentMethod ?? "").trim() || "—";
  const notes = (opts?.note ?? reimb.description ?? "").toString().trim() || null;
  const referenceNo = `REIM-${reimbursementId}`;

  if (typeof console !== "undefined" && console.log) {
    console.log("[createExpenseFromPaidReimbursement] start", {
      reimbursementId,
      workerId: reimb.workerId,
      projectId,
      amount,
      vendorName,
    });
  }

  let existingId: string | null = null;
  // Check by reference_no first (works when source/source_id columns don't exist)
  try {
    const { data: byRef } = await c
      .from("expenses")
      .select("id")
      .eq("reference_no", referenceNo)
      .maybeSingle();
    existingId = byRef?.id ?? null;
    if (typeof console !== "undefined" && console.log) {
      console.log("[createExpenseFromPaidReimbursement] duplicate check by reference_no", {
        existingId,
      });
    }
  } catch {
    // reference_no column may not exist; try source/source_id next
  }
  if (!existingId) {
    try {
      const { data: existing } = await c
        .from("expenses")
        .select("id")
        .eq("source", WORKER_REIMBURSEMENT_SOURCE)
        .eq("source_id", reimbursementId)
        .maybeSingle();
      existingId = existing?.id ?? null;
    } catch {
      // source/source_id columns may not exist
    }
  }
  if (existingId) {
    try {
      const exp = await getExpenseById(existingId);
      if (exp) return exp;
    } catch {
      // Return minimal so caller has expense id
    }
    return {
      id: existingId,
      date,
      vendorName: vendorName,
      paymentMethod,
      referenceNo,
      notes: notes ?? undefined,
      attachments: [],
      lines: [{ id: "", projectId, category: REIMBURSEMENT_CATEGORY, amount }],
    } as Expense;
  }

  // Try inserts in order; on "column not in schema cache" strip more columns until one succeeds.
  // expenses may have amount (NOT NULL) and/or total; set both when present.
  const attempts: Record<string, unknown>[] = [
    {
      expense_date: date,
      vendor_name: vendorName,
      payment_method: paymentMethod,
      notes,
      reference_no: referenceNo,
      total: amount,
      amount,
      line_count: 1,
      receipt_url: null,
      status: "paid",
      source: WORKER_REIMBURSEMENT_SOURCE,
      source_id: reimbursementId,
      source_type: "reimbursement",
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
      vendor: vendorName,
    },
    {
      expense_date: date,
      vendor_name: vendorName,
      notes,
      reference_no: referenceNo,
      total: amount,
      amount,
      line_count: 1,
      status: "paid",
      source: WORKER_REIMBURSEMENT_SOURCE,
      source_id: reimbursementId,
      source_type: "reimbursement",
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
      vendor: vendorName,
    },
    {
      expense_date: date,
      vendor_name: vendorName,
      notes,
      reference_no: referenceNo,
      total: amount,
      amount,
      line_count: 1,
      status: "approved",
      source: WORKER_REIMBURSEMENT_SOURCE,
      source_id: reimbursementId,
      source_type: "reimbursement",
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
      vendor: vendorName,
    },
    {
      expense_date: date,
      vendor_name: vendorName,
      notes,
      reference_no: referenceNo,
      total: amount,
      amount,
      line_count: 1,
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
    },
    {
      expense_date: date,
      vendor: vendorName,
      notes,
      reference_no: referenceNo,
      total: amount,
      amount,
      line_count: 1,
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
    },
    {
      expense_date: date,
      total: amount,
      amount,
      line_count: 1,
      notes,
      reference_no: referenceNo,
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
    },
    {
      expense_date: date,
      total: amount,
      amount,
      line_count: 1,
      worker_id: reimb.workerId ?? null,
      project_id: projectId,
    },
    {
      expense_date: date,
      vendor: vendorName,
      total: amount,
      amount,
      line_count: 1,
      project_id: projectId,
    },
    { expense_date: date, vendor: vendorName, total: amount, amount, line_count: 1 },
    { expense_date: date, total: amount, amount, line_count: 1, project_id: projectId },
    { expense_date: date, total: amount, amount, line_count: 1 },
  ];

  let result: { data: { id?: string } | null; error: { message?: string } | null } = {
    data: null,
    error: null,
  };
  for (let i = 0; i < attempts.length; i++) {
    const row = attempts[i]!;
    result = await c.from("expenses").insert(row).select("id").single();
    if (typeof console !== "undefined" && console.log) {
      console.log("[createExpenseFromPaidReimbursement] insert attempt", i + 1, {
        keys: Object.keys(row),
        ok: !result.error,
        error: result.error?.message,
      });
    }
    if (!result.error) break;
    if (
      isStatusConstraintError(result.error) &&
      (row as Record<string, unknown>).status === "paid"
    ) {
      result = await c
        .from("expenses")
        .insert({ ...row, status: "approved" })
        .select("id")
        .single();
      if (!result.error) break;
    }
    if (!isMissingColumn(result.error)) break;
  }

  const { data: expRow, error: expErr } = result;
  if (expErr) throw new Error(expErr.message ?? "Failed to create expense.");
  const expenseId = (expRow as { id: string } | null)?.id;
  if (!expenseId) throw new Error("Failed to create expense: no id.");
  if (typeof console !== "undefined" && console.log) {
    console.log("[createExpenseFromPaidReimbursement] expense created", { expenseId });
    console.log("[workflow test] expense created", { expenseId, reimbursementId });
  }

  const linePayloads: Record<string, unknown>[] = [
    {
      expense_id: expenseId,
      project_id: projectId,
      category: REIMBURSEMENT_CATEGORY,
      memo: notes,
      amount,
      total: amount,
    },
    {
      expense_id: expenseId,
      project_id: projectId,
      category: REIMBURSEMENT_CATEGORY,
      amount,
      total: amount,
    },
    { expense_id: expenseId, project_id: projectId, amount, total: amount },
    { expense_id: expenseId, amount, total: amount },
    {
      expense_id: expenseId,
      project_id: projectId,
      category: REIMBURSEMENT_CATEGORY,
      memo: notes,
      amount,
    },
    { expense_id: expenseId, project_id: projectId, category: REIMBURSEMENT_CATEGORY, amount },
    { expense_id: expenseId, project_id: projectId, amount },
    { expense_id: expenseId, project_id: projectId },
    { expense_id: expenseId, category: REIMBURSEMENT_CATEGORY, memo: notes, amount },
    { expense_id: expenseId, category: REIMBURSEMENT_CATEGORY, amount },
    { expense_id: expenseId, amount },
    { expense_id: expenseId, total: amount },
    { expense_id: expenseId, category: REIMBURSEMENT_CATEGORY, total: amount },
    { expense_id: expenseId },
  ];
  let lineErr: { message?: string } | null = null;
  for (const payload of linePayloads) {
    const res = await c.from("expense_lines").insert(payload);
    lineErr = res.error;
    if (!lineErr) {
      if (typeof console !== "undefined" && console.log) {
        console.log(
          "[createExpenseFromPaidReimbursement] expense_lines inserted",
          Object.keys(payload)
        );
      }
      break;
    }
    if (!isMissingColumn(lineErr)) break;
  }
  if (lineErr) throw new Error(lineErr.message ?? "Failed to create expense line.");

  try {
    const exp = await getExpenseById(expenseId);
    if (exp) return exp;
  } catch {
    // Schema may not match getExpenseById expectations
  }
  return {
    id: expenseId,
    date,
    vendorName: vendorName,
    paymentMethod,
    referenceNo,
    notes: notes ?? undefined,
    attachments: [],
    lines: [{ id: "", projectId, category: REIMBURSEMENT_CATEGORY, amount }],
  } as Expense;
}

export async function updateExpense(
  expenseId: string,
  patch: Partial<{
    date: string;
    vendorName: string;
    paymentMethod: string;
    referenceNo: string;
    notes: string;
    cardName: string | null;
    accountId: string | null;
    paymentAccountId: string | null;
  }>
): Promise<Expense | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.date != null) updates.expense_date = patch.date.slice(0, 10);
  if (patch.vendorName != null) updates.vendor = patch.vendorName;
  if (patch.paymentMethod != null) updates.payment_method = patch.paymentMethod;
  if (patch.referenceNo !== undefined) updates.reference_no = patch.referenceNo || null;
  if (patch.notes !== undefined) updates.notes = patch.notes || null;
  if (patch.cardName !== undefined) updates.card_name = patch.cardName?.trim() || null;
  if (patch.accountId !== undefined) updates.account_id = patch.accountId ?? null;
  if (patch.paymentAccountId !== undefined)
    updates.payment_account_id = patch.paymentAccountId ?? null;
  if (Object.keys(updates).length > 0) {
    let res = await c.from("expenses").update(updates).eq("id", expenseId);
    let err: { message?: string } | null = res.error;
    if (err && isMissingColumn(err) && updates.payment_method !== undefined) {
      delete updates.payment_method;
      if (Object.keys(updates).length > 0) {
        res = await c.from("expenses").update(updates).eq("id", expenseId);
        err = res.error;
      } else {
        err = null;
      }
    }
    if (err && isMissingColumn(err) && updates.payment_account_id !== undefined) {
      delete updates.payment_account_id;
      if (Object.keys(updates).length > 0) {
        res = await c.from("expenses").update(updates).eq("id", expenseId);
        err = res.error;
      } else {
        err = null;
      }
    }
    if (err) return null;
  }
  return getExpenseById(expenseId);
}

/** Update expense and first line for review workflow: vendor, amount, project, category, worker, notes, status. */
export async function updateExpenseForReview(
  expenseId: string,
  patch: Partial<{
    date: string;
    vendorName: string;
    notes: string;
    status:
      | "pending"
      | "needs_review"
      | "reviewed"
      | "approved"
      | "reimbursed"
      | "reimbursable"
      | "paid"
      | "draft";
    workerId: string | null;
    projectId: string | null;
    category: string;
    amount: number;
    sourceType: Expense["sourceType"];
    paymentAccountId: string | null;
  }>
): Promise<Expense | null> {
  const c = client();
  const expUpdates: Record<string, unknown> = {};
  if (patch.date != null) expUpdates.expense_date = patch.date.slice(0, 10);
  if (patch.vendorName != null) {
    expUpdates.vendor = patch.vendorName;
    expUpdates.vendor_name = patch.vendorName;
  }
  if (patch.notes !== undefined) expUpdates.notes = patch.notes || null;
  if (patch.status != null) expUpdates.status = patch.status;
  if (patch.workerId !== undefined) expUpdates.worker_id = patch.workerId;
  if (patch.sourceType != null) expUpdates.source_type = patch.sourceType;
  if (patch.paymentAccountId !== undefined) {
    expUpdates.payment_account_id = patch.paymentAccountId?.trim() || null;
  }
  if (Object.keys(expUpdates).length > 0) {
    let res = await c.from("expenses").update(expUpdates).eq("id", expenseId);
    let err: { message?: string } | null = res.error;
    if (err && isMissingColumn(err) && patch.sourceType != null) {
      delete expUpdates.source_type;
      if (Object.keys(expUpdates).length > 0) {
        res = await c.from("expenses").update(expUpdates).eq("id", expenseId);
        err = res.error;
      } else {
        err = null;
      }
    }
    if (err && isMissingColumn(err) && patch.date != null) {
      delete expUpdates.expense_date;
      if (Object.keys(expUpdates).length > 0) {
        res = await c.from("expenses").update(expUpdates).eq("id", expenseId);
        err = res.error;
      } else {
        err = null;
      }
    }
    if (err && isMissingColumn(err) && patch.paymentAccountId !== undefined) {
      delete expUpdates.payment_account_id;
      if (Object.keys(expUpdates).length > 0) {
        res = await c.from("expenses").update(expUpdates).eq("id", expenseId);
        err = res.error;
      } else {
        err = null;
      }
    }
    if (err) return null;
  }
  if (patch.projectId !== undefined || patch.category != null || patch.amount != null) {
    const { data: lines } = await c
      .from("expense_lines")
      .select("id")
      .eq("expense_id", expenseId)
      .limit(1);
    const firstLine = Array.isArray(lines) ? lines[0] : null;
    if (firstLine && typeof firstLine === "object" && "id" in firstLine) {
      const lineUpdates: Record<string, unknown> = {};
      if (patch.projectId !== undefined) lineUpdates.project_id = patch.projectId;
      if (patch.category != null) lineUpdates.category = patch.category;
      if (patch.amount != null) lineUpdates.amount = patch.amount;
      if (Object.keys(lineUpdates).length > 0) {
        await c
          .from("expense_lines")
          .update(lineUpdates)
          .eq("id", (firstLine as { id: string }).id)
          .eq("expense_id", expenseId);
      }
    }
  }
  if (patch.projectId !== undefined) {
    const hdr =
      patch.projectId != null && String(patch.projectId).trim() !== ""
        ? String(patch.projectId).trim()
        : null;
    const { error: hdrErr } = await c
      .from("expenses")
      .update({ project_id: hdr })
      .eq("id", expenseId);
    if (hdrErr && !isMissingColumn(hdrErr)) {
      console.warn("[updateExpenseForReview] expenses.project_id update:", hdrErr.message);
    }
  }
  return getExpenseById(expenseId);
}

export async function updateExpenseReceiptUrl(
  expenseId: string,
  receiptUrl: string
): Promise<Expense | null> {
  const c = client();
  const { error } = await c
    .from("expenses")
    .update({ receipt_url: receiptUrl })
    .eq("id", expenseId);
  if (error) {
    if (isMissingColumn(error)) return getExpenseById(expenseId);
    return null;
  }
  return getExpenseById(expenseId);
}

export async function updateExpenseStatus(
  expenseId: string,
  status: NonNullable<Expense["status"]>
): Promise<Expense | null> {
  const c = client();
  const { error } = await c.from("expenses").update({ status }).eq("id", expenseId);
  if (error) {
    if (isMissingColumn(error)) return getExpenseById(expenseId);
    return null;
  }
  return getExpenseById(expenseId);
}

/** Set status to 'reimbursed' for all expenses with the given worker_id and status in ('pending','needs_review','approved'). Returns count updated. */
export async function markWorkerExpensesReimbursed(workerId: string): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from("expenses")
    .select("id")
    .eq("worker_id", workerId)
    .or("status.eq.pending,status.eq.needs_review,status.eq.approved");
  if (error) {
    if (isMissingColumn(error)) return 0;
    throw new Error((error as { message?: string }).message ?? "Failed to update");
  }
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;
  const { error: updateError } = await c
    .from("expenses")
    .update({ status: "reimbursed" })
    .in("id", ids);
  if (updateError)
    throw new Error((updateError as { message?: string }).message ?? "Failed to update");
  return ids.length;
}

export async function addExpenseLine(
  expenseId: string,
  line: {
    projectId: string | null;
    category: string;
    costCode?: string | null;
    memo?: string | null;
    amount: number;
  }
): Promise<Expense | null> {
  const c = client();
  await c.from("expense_lines").insert({
    expense_id: expenseId,
    project_id: line.projectId ?? null,
    category: line.category ?? "Other",
    cost_code: line.costCode ?? null,
    memo: line.memo ?? null,
    amount: line.amount ?? 0,
  });
  return getExpenseById(expenseId);
}

export async function updateExpenseLine(
  expenseId: string,
  lineId: string,
  patch: Partial<ExpenseLine>
): Promise<Expense | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.projectId !== undefined) updates.project_id = patch.projectId;
  if (patch.category != null) updates.category = patch.category;
  if (patch.costCode !== undefined) updates.cost_code = patch.costCode ?? null;
  if (patch.memo !== undefined) updates.memo = patch.memo ?? null;
  if (patch.amount != null) updates.amount = patch.amount;
  if (Object.keys(updates).length > 0) {
    await c.from("expense_lines").update(updates).eq("id", lineId).eq("expense_id", expenseId);
  }
  return getExpenseById(expenseId);
}

export async function deleteExpenseLine(
  expenseId: string,
  lineId: string
): Promise<Expense | null> {
  const c = client();
  const { data: lines } = await c.from("expense_lines").select("id").eq("expense_id", expenseId);
  if (lines && lines.length <= 1) {
    await c
      .from("expense_lines")
      .update({ project_id: null, category: "Other", amount: 0, cost_code: null, memo: null })
      .eq("id", lineId)
      .eq("expense_id", expenseId);
  } else {
    await c.from("expense_lines").delete().eq("id", lineId).eq("expense_id", expenseId);
  }
  return getExpenseById(expenseId);
}

export async function deleteExpense(expenseId: string): Promise<boolean> {
  const c = client();
  // expense_lines has FK `expense_id references expenses(id) on delete cascade` in migrations.
  // We delete the expense header and rely on DB cascade to remove all expense_lines.
  const { error } = await c.from("expenses").delete().eq("id", expenseId);
  return !error;
}

export async function addExpenseAttachment(
  expenseId: string,
  att: ExpenseAttachment
): Promise<Expense | null> {
  const c = client();
  const { error } = await c.from("attachments").insert({
    entity_type: "expense",
    entity_id: expenseId,
    file_name: att.fileName,
    file_path: att.url,
    mime_type: att.mimeType,
    size_bytes: att.size,
  });
  if (error) throw new Error(error.message ?? "Failed to save attachment record.");
  return getExpenseById(expenseId);
}

function isMissingExpenseAttachmentsTable(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    msg.includes("expense_attachments") ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

export async function insertExpenseAttachmentRecord(
  expenseId: string,
  payload: { storagePath: string; fileType: "image" | "pdf" }
): Promise<Expense | null> {
  const c = client();
  const { error } = await c.from("expense_attachments").insert({
    expense_id: expenseId,
    file_url: payload.storagePath,
    file_type: payload.fileType,
  });
  if (error) {
    if (isMissingExpenseAttachmentsTable(error))
      throw new Error(
        "expense_attachments table is missing. Apply migration 202604291300_create_expense_attachments.sql."
      );
    throw new Error(error.message ?? "Failed to save attachment.");
  }
  return getExpenseById(expenseId);
}

export async function deleteExpenseAttachment(
  expenseId: string,
  attachmentId: string
): Promise<Expense | null> {
  const c = client();
  const { data: ea, error: eaErr } = await c
    .from("expense_attachments")
    .select("id, file_url")
    .eq("id", attachmentId)
    .eq("expense_id", expenseId)
    .maybeSingle();
  if (!eaErr && ea) {
    const filePath = (ea as { file_url?: unknown }).file_url;
    if (typeof filePath === "string" && filePath) {
      const { error: storageErr } = await c.storage.from("expense-attachments").remove([filePath]);
      if (storageErr) throw new Error(storageErr.message ?? "Failed to delete attachment file.");
    }
    const { error: delErr } = await c
      .from("expense_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("expense_id", expenseId);
    if (delErr) throw new Error(delErr.message ?? "Failed to delete attachment record.");
    return getExpenseById(expenseId);
  }

  const { data: att, error: attErr } = await c
    .from("attachments")
    .select("id, file_path")
    .eq("id", attachmentId)
    .eq("entity_type", "expense")
    .eq("entity_id", expenseId)
    .maybeSingle();
  if (attErr) throw new Error(attErr.message ?? "Failed to load attachment.");

  const filePath = (att as { file_path?: unknown } | null)?.file_path;
  if (typeof filePath === "string" && filePath) {
    const { error: storageErr } = await c.storage.from("expense-attachments").remove([filePath]);
    if (storageErr) throw new Error(storageErr.message ?? "Failed to delete attachment file.");
  }

  const { error: delErr } = await c
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("entity_type", "expense")
    .eq("entity_id", expenseId);
  if (delErr) throw new Error(delErr.message ?? "Failed to delete attachment record.");
  return getExpenseById(expenseId);
}

export function getExpenseTotal(expense: Expense): number {
  return expense.lines.reduce((sum, l) => sum + l.amount, 0);
}

/** Expense lines for a project (for project detail / profit drilldown). */
export async function getExpenseLinesByProject(
  projectId: string,
  limit = 5
): Promise<Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }>> {
  const c = client();
  const { data: lineRows } = await c
    .from("expense_lines")
    .select("id, expense_id, project_id, category, cost_code, memo, amount")
    .eq("project_id", projectId);
  const lines = (lineRows ?? []) as (ExpenseLineRow & { expense_id: string })[];
  const result: Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }> =
    [];
  for (const l of lines.slice(0, limit * 2)) {
    const exp = await getExpenseById(l.expense_id);
    if (!exp) continue;
    result.push({
      expenseId: exp.id,
      date: exp.date,
      vendorName: exp.vendorName,
      line: toExpenseLine(l as ExpenseLineRow),
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result.slice(0, limit);
}

/** All expense lines for a project. */
export async function getProjectExpenseLines(
  projectId: string
): Promise<Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }>> {
  const c = client();
  const { data: lineRows } = await c
    .from("expense_lines")
    .select("id, expense_id, project_id, category, cost_code, memo, amount")
    .eq("project_id", projectId);
  const lines = (lineRows ?? []) as (ExpenseLineRow & { expense_id: string })[];
  const result: Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }> =
    [];
  for (const l of lines) {
    const exp = await getExpenseById(l.expense_id);
    if (!exp) continue;
    result.push({
      expenseId: exp.id,
      date: exp.date,
      vendorName: exp.vendorName,
      line: toExpenseLine(l as ExpenseLineRow),
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

export async function getExpenseTotalsByProject(projectId: string): Promise<number> {
  const c = client();
  const { data: rows } = await c.from("expense_lines").select("amount").eq("project_id", projectId);
  return (rows ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
}

export async function getTotalExpenses(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c.from("expenses").select("total");
  if (error) {
    if (isMissingColumn(error)) {
      const { data: lineRows } = await c.from("expense_lines").select("expense_id, amount");
      if (!lineRows?.length) return 0;
      const byExpense = new Map<string, number>();
      for (const r of lineRows as { expense_id: string; amount?: number }[]) {
        const id = r.expense_id;
        byExpense.set(id, (byExpense.get(id) ?? 0) + Number(r.amount ?? 0));
      }
      return Array.from(byExpense.values()).reduce((s, v) => s + v, 0);
    }
    return 0;
  }
  return (rows ?? []).reduce((s, r) => s + Number((r as { total?: number }).total || 0), 0);
}

/** Sum of all expense_lines amounts (amount or total column). For finance overview. */
export async function getTotalExpenseLinesSum(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c.from("expense_lines").select("amount");
  if (error) {
    return 0;
  }
  return (rows ?? []).reduce((s, r) => s + Number((r as { amount?: number }).amount ?? 0), 0);
}

/** Sum of expense line amounts for expenses with expense_date in the given month. For dashboard "Expenses This Month". */
export async function getExpensesTotalForMonth(year: number, month: number): Promise<number> {
  const c = client();
  const y = String(year);
  const m = String(month).padStart(2, "0");
  const start = `${y}-${m}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  const { data: expenseRows } = await c
    .from("expenses")
    .select("id")
    .gte("expense_date", start)
    .lte("expense_date", end);
  const ids = (expenseRows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;
  const { data: lineRows } = await c.from("expense_lines").select("amount").in("expense_id", ids);
  return (lineRows ?? []).reduce((s, r) => s + Number((r as { amount?: number }).amount || 0), 0);
}

/** Unlinked expenses for bank tx suggestion. */
export async function getUnlinkedExpenses(): Promise<Expense[]> {
  const c = client();
  const { data: btRows } = await c
    .from("bank_transactions")
    .select("linked_expense_id")
    .not("linked_expense_id", "is", null);
  const linkedIds = new Set(
    (btRows ?? []).map((r: { linked_expense_id: string }) => r.linked_expense_id)
  );
  const all = await getExpenses();
  return all.filter((e) => !linkedIds.has(e.id));
}

export type ExpenseRecentRow = {
  id: string;
  expense_date: string;
  vendor_name: string;
  notes: string | null;
  total: number;
  created_at: string;
  project_id: string | null;
  project_name: string | null;
};

/** Recent expenses for dashboard activity feed. Ordered by created_at desc, limit. Resolves first line's project for project_name. */
export async function getExpensesRecent(limit: number): Promise<ExpenseRecentRow[]> {
  const c = client();
  const cols = "id,expense_date,vendor,vendor_name,notes,total,created_at";
  const colsLegacy = "id,expense_date,vendor,notes,total,created_at";
  const colsNoTotal = "id,expense_date,vendor,vendor_name,notes,created_at";
  const colsNoTotalLegacy = "id,expense_date,vendor,notes,created_at";
  const safeLimit = Math.max(1, Math.min(limit, 100));

  let rows: Array<Record<string, unknown>> = [];
  let error: { message?: string } | null = null;
  let needTotalFromLines = false;

  const primary = await c
    .from("expenses")
    .select(cols)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (!primary.error) {
    rows = (primary.data ?? []) as Array<Record<string, unknown>>;
  } else if (isMissingColumn(primary.error)) {
    const legacy = await c
      .from("expenses")
      .select(colsLegacy)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (!legacy.error) {
      rows = (legacy.data ?? []) as Array<Record<string, unknown>>;
    } else if (isMissingColumn(legacy.error)) {
      const noTotal = await c
        .from("expenses")
        .select(colsNoTotal)
        .order("created_at", { ascending: false })
        .limit(safeLimit);
      if (!noTotal.error) {
        rows = (noTotal.data ?? []) as Array<Record<string, unknown>>;
        needTotalFromLines = true;
      } else if (isMissingColumn(noTotal.error)) {
        const noTotalLegacy = await c
          .from("expenses")
          .select(colsNoTotalLegacy)
          .order("created_at", { ascending: false })
          .limit(safeLimit);
        if (noTotalLegacy.error) error = noTotalLegacy.error;
        else {
          rows = (noTotalLegacy.data ?? []) as Array<Record<string, unknown>>;
          needTotalFromLines = true;
        }
      } else {
        error = noTotal.error;
      }
    } else {
      error = legacy.error;
    }
  } else {
    error = primary.error;
  }
  if (error) {
    if (isMissingTable(error)) return [];
    return [];
  }
  const list = rows ?? [];
  if (list.length === 0) return [];
  const ids = list.map((r) => r.id as string);
  const totalByExpenseId = new Map<string, number>();
  const { data: lineRows } = await c
    .from("expense_lines")
    .select(needTotalFromLines ? "expense_id, project_id, amount" : "expense_id, project_id")
    .in("expense_id", ids);
  const firstProjectByExpenseId = new Map<string, string>();
  for (const l of (lineRows ?? []) as unknown as Array<{
    expense_id: string;
    project_id: string | null;
    amount?: number;
  }>) {
    if (l.project_id && !firstProjectByExpenseId.has(l.expense_id))
      firstProjectByExpenseId.set(l.expense_id, l.project_id);
    if (needTotalFromLines && l.amount != null) {
      const id = l.expense_id;
      totalByExpenseId.set(id, (totalByExpenseId.get(id) ?? 0) + Number(l.amount));
    }
  }
  const projectIds = Array.from(firstProjectByExpenseId.values());
  let projectNameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projRows } = await c.from("projects").select("id, name").in("id", projectIds);
    projectNameById = new Map(
      ((projRows ?? []) as Array<{ id: string; name: string | null }>).map((p) => [
        p.id,
        p.name ?? "",
      ])
    );
  }
  return list.map((r) => {
    const expenseId = (r.id as string) ?? "";
    const projectId = firstProjectByExpenseId.get(expenseId) ?? null;
    const total = needTotalFromLines
      ? (totalByExpenseId.get(expenseId) ?? 0)
      : Number(r.total) || 0;
    return {
      id: expenseId,
      expense_date: (r.expense_date as string)?.slice(0, 10) ?? "",
      vendor_name: (r.vendor_name ?? r.vendor ?? "") as string,
      notes: (r.notes as string | null) ?? null,
      total,
      created_at: (r.created_at as string) ?? new Date().toISOString(),
      project_id: projectId,
      project_name: projectId ? (projectNameById.get(projectId) ?? null) : null,
    };
  });
}
