/**
 * Bank transactions — Supabase only. No mock data.
 * Table: bank_transactions.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type BankTransactionStatus = "unmatched" | "reconciled";

export type BankTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: BankTransactionStatus;
  linkedExpenseId?: string | null;
  createdAt: string;
  reconciledAt?: string;
  reconciledBy?: string;
};

type BankTransactionRow = {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  status: string;
  linked_expense_id: string | null;
  created_at: string;
  reconciled_at: string | null;
  reconciled_by?: string | null;
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

const HINT = "Run supabase/migrations/202602280010_create_bank_transactions.sql";

function toBankTx(r: BankTransactionRow): BankTransaction {
  return {
    id: r.id,
    date: r.txn_date?.slice(0, 10) ?? "",
    description: r.description ?? "",
    amount: Number(r.amount) || 0,
    status: r.status === "reconciled" ? "reconciled" : "unmatched",
    linkedExpenseId: r.linked_expense_id ?? undefined,
    createdAt: r.created_at?.slice(0, 10) ?? "",
    reconciledAt: r.reconciled_at ?? undefined,
    reconciledBy: r.reconciled_by ?? undefined,
  };
}

export async function getBankTransactions(): Promise<BankTransaction[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("bank_transactions")
    .select(
      "id, txn_date, description, amount, status, linked_expense_id, created_at, reconciled_at, reconciled_by"
    )
    .order("txn_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new Error(`bank_transactions: table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return (rows ?? []).map((r) => toBankTx(r as BankTransactionRow));
}

export async function getBankTransactionById(id: string): Promise<BankTransaction | null> {
  const c = client();
  const { data: row, error } = await c
    .from("bank_transactions")
    .select(
      "id, txn_date, description, amount, status, linked_expense_id, created_at, reconciled_at, reconciled_by"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    if (isMissingTable(error)) throw new Error(`bank_transactions: table not found. ${HINT}`);
    return null;
  }
  return toBankTx(row as BankTransactionRow);
}

export async function createBankTransaction(payload: {
  date: string;
  description: string;
  amount: number;
  status?: BankTransactionStatus;
}): Promise<BankTransaction> {
  const c = client();
  const { data: row, error } = await c
    .from("bank_transactions")
    .insert({
      txn_date: payload.date.slice(0, 10),
      description: payload.description ?? "",
      amount: payload.amount ?? 0,
      status: payload.status ?? "unmatched",
    })
    .select(
      "id, txn_date, description, amount, status, linked_expense_id, created_at, reconciled_at, reconciled_by"
    )
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create bank transaction.");
  return toBankTx(row as BankTransactionRow);
}

export async function updateBankTransaction(
  id: string,
  patch: {
    status?: BankTransactionStatus;
    linkedExpenseId?: string | null;
    reconciledAt?: string;
    reconciledBy?: string;
  }
): Promise<BankTransaction | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.status != null) updates.status = patch.status;
  if (patch.linkedExpenseId !== undefined) updates.linked_expense_id = patch.linkedExpenseId;
  if (patch.reconciledAt !== undefined) updates.reconciled_at = patch.reconciledAt ?? null;
  if (patch.reconciledBy !== undefined) updates.reconciled_by = patch.reconciledBy ?? null;
  if (Object.keys(updates).length === 0) return getBankTransactionById(id);
  const { data: row, error } = await c
    .from("bank_transactions")
    .update(updates)
    .eq("id", id)
    .select(
      "id, txn_date, description, amount, status, linked_expense_id, created_at, reconciled_at, reconciled_by"
    )
    .single();
  if (error || !row) return null;
  return toBankTx(row as BankTransactionRow);
}

export async function linkBankTransactionToExpense(
  bankTxId: string,
  expenseId: string
): Promise<boolean> {
  const c = client();
  const { data: tx } = await c
    .from("bank_transactions")
    .select("id, linked_expense_id")
    .eq("id", bankTxId)
    .maybeSingle();
  if (!tx || tx.linked_expense_id) return false;
  const now = new Date().toISOString().slice(0, 10);
  const { error } = await c
    .from("bank_transactions")
    .update({
      linked_expense_id: expenseId,
      status: "reconciled",
      reconciled_at: now,
      reconciled_by: "owner",
    })
    .eq("id", bankTxId);
  if (error) return false;
  return true;
}

export async function unlinkBankTransaction(bankTxId: string): Promise<boolean> {
  const c = client();
  const { data: tx } = await c
    .from("bank_transactions")
    .select("id, linked_expense_id")
    .eq("id", bankTxId)
    .maybeSingle();
  if (!tx || !tx.linked_expense_id) return false;
  const { error } = await c
    .from("bank_transactions")
    .update({
      linked_expense_id: null,
      status: "unmatched",
      reconciled_at: null,
      reconciled_by: null,
    })
    .eq("id", bankTxId);
  return !error;
}
