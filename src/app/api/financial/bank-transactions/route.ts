import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { getARSummary } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

type BankTransactionRow = {
  id: string;
  txn_date: string;
  description: string;
  amount: number | string | null;
  status: "unmatched" | "reconciled";
  reconciled_at?: string | null;
  linked_expense_id?: string | null;
  reconcile_type?: "Expense" | "Income" | "Transfer" | null;
};

type SplitLineInput = {
  projectId?: string | null;
  category?: string | null;
  memo?: string | null;
  amount?: number | string | null;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return /schema cache|could not find the table|relation .* does not exist/i.test(e.message ?? "");
}

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function mapBankTransaction(row: BankTransactionRow) {
  return {
    id: row.id,
    date: row.txn_date,
    txn_date: row.txn_date,
    description: row.description,
    amount: safeNumber(row.amount),
    status: row.status,
    reconciledAt: row.reconciled_at ?? null,
    linkedExpenseId: row.linked_expense_id ?? null,
    reconcileType: row.reconcile_type ?? null,
  };
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "reconcile";

  try {
    if (view === "linked-expenses") {
      const expenseIds = [
        ...new Set(
          (searchParams.get("expenseIds") ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        ),
      ].slice(0, 250);
      const links: Array<{ expenseId: string; bankTxId: string }> = [];
      for (let i = 0; i < expenseIds.length; i += 100) {
        const slice = expenseIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from("bank_transactions")
          .select("id,linked_expense_id")
          .in("linked_expense_id", slice);
        if (error) {
          if (isMissingTableError(error)) continue;
          throw new Error(error.message);
        }
        for (const row of data ?? []) {
          const expenseId = (row as { linked_expense_id?: string | null }).linked_expense_id;
          const bankTxId = (row as { id?: string | null }).id;
          if (expenseId && bankTxId) links.push({ expenseId, bankTxId });
        }
      }
      return NextResponse.json({ ok: true, links }, { headers: NO_CACHE_HEADERS });
    }

    if (view === "summary") {
      let reconciledTotal = 0;
      let expTotal = 0;
      let bankBalance = 0;
      let unreconciledBankTotal = 0;

      const [bankRes, bankRecentRes, expRes, arSummary] = await Promise.all([
        supabase.from("bank_transactions").select("amount,status").limit(10000),
        supabase
          .from("bank_transactions")
          .select("id,txn_date,description,amount,status")
          .eq("status", "unmatched")
          .order("txn_date", { ascending: false })
          .limit(8),
        supabase.from("expenses").select("total").limit(10000),
        getARSummary().catch(() => ({ totalAR: 0, overdueAR: 0, paidThisMonth: 0 })),
      ]);

      if (!bankRes.error) {
        const rows = (bankRes.data ?? []) as Array<{
          amount: number | string | null;
          status: "unmatched" | "reconciled";
        }>;
        bankBalance = rows.reduce((sum, r) => sum + safeNumber(r.amount), 0);
        reconciledTotal = rows.reduce(
          (sum, r) => (r.status === "reconciled" ? sum + safeNumber(r.amount) : sum),
          0
        );
        unreconciledBankTotal = rows.reduce(
          (sum, r) => (r.status === "unmatched" ? sum + safeNumber(r.amount) : sum),
          0
        );
      } else if (!isMissingTableError(bankRes.error)) {
        throw new Error(bankRes.error.message);
      }

      if (!expRes.error) {
        expTotal = (expRes.data ?? []).reduce(
          (sum, r) => sum + safeNumber((r as { total?: number | string | null }).total),
          0
        );
      } else if (!isMissingTableError(expRes.error)) {
        throw new Error(expRes.error.message);
      }

      const recentUnreconciled = bankRecentRes.error
        ? []
        : ((bankRecentRes.data ?? []) as BankTransactionRow[]).map(mapBankTransaction);

      return NextResponse.json(
        {
          ok: true,
          summary: {
            bankBalance,
            reconciledBankTotal: reconciledTotal,
            unreconciledBankTotal,
            systemExpenses: expTotal,
            cashDifference: reconciledTotal - expTotal,
            totalAR: arSummary.totalAR,
            overdueAR: arSummary.overdueAR,
            recentUnreconciled,
          },
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    const loadCategories = async (): Promise<string[]> => {
      const initial = await supabase
        .from("categories")
        .select("name,type,status")
        .eq("type", "expense")
        .order("name", { ascending: true })
        .limit(500);
      const typeOnly =
        initial.error && /column .*status|schema cache/i.test(initial.error.message ?? "")
          ? await supabase
              .from("categories")
              .select("name,type")
              .eq("type", "expense")
              .order("name", { ascending: true })
              .limit(500)
          : initial;
      const res =
        typeOnly.error && /column .*type|schema cache/i.test(typeOnly.error.message ?? "")
          ? await supabase
              .from("categories")
              .select("name")
              .order("name", { ascending: true })
              .limit(500)
          : typeOnly;
      if (res.error) {
        if (isMissingTableError(res.error)) return ["Other"];
        throw new Error(res.error.message);
      }
      const names = (res.data ?? [])
        .filter((r) => (r as { status?: string }).status !== "inactive")
        .map((r) => (r as { name: string }).name)
        .filter(Boolean);
      return names.length ? names : ["Other"];
    };

    const loadNameList = async (table: "vendors" | "payment_methods", fallback: string[]) => {
      const initial = await supabase
        .from(table)
        .select("name,status")
        .order("name", { ascending: true })
        .limit(500);
      const res =
        initial.error && /column .*status|schema cache/i.test(initial.error.message ?? "")
          ? await supabase.from(table).select("name").order("name", { ascending: true }).limit(500)
          : initial;
      if (res.error) {
        if (isMissingTableError(res.error)) return fallback;
        throw new Error(res.error.message);
      }
      const names = (res.data ?? [])
        .filter((r) => (r as { status?: string }).status !== "inactive")
        .map((r) => (r as { name: string }).name)
        .filter(Boolean);
      return names.length ? names : fallback;
    };

    const [txRes, projRes, categories, vendors, paymentMethods] = await Promise.all([
      supabase
        .from("bank_transactions")
        .select(
          "id,txn_date,description,amount,status,reconciled_at,linked_expense_id,reconcile_type"
        )
        .order("txn_date", { ascending: false })
        .limit(2000),
      supabase
        .from("projects")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
      loadCategories(),
      loadNameList("vendors", []),
      loadNameList("payment_methods", ["ACH"]),
    ]);

    if (txRes.error && !isMissingTableError(txRes.error)) throw new Error(txRes.error.message);
    if (projRes.error && !isMissingTableError(projRes.error))
      throw new Error(projRes.error.message);

    return NextResponse.json(
      {
        ok: true,
        transactions: ((txRes.data ?? []) as BankTransactionRow[]).map(mapBankTransaction),
        projects: (projRes.data ?? []) as Array<{ id: string; name: string }>,
        categories,
        vendors,
        paymentMethods,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load bank transactions.";
    return apiError(500, message);
  }
}

export async function POST(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiError(400, "Invalid JSON body.");
    const action = String(body.action ?? "").trim();

    if (action === "import") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const payload = rows
        .map((row) => {
          const r = row as { date?: unknown; description?: unknown; amount?: unknown };
          const txnDate = typeof r.date === "string" ? r.date.slice(0, 10) : "";
          const description = typeof r.description === "string" ? r.description.trim() : "";
          const amount = safeNumber(r.amount);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate) || !description) return null;
          return { txn_date: txnDate, description, amount, status: "unmatched" as const };
        })
        .filter(Boolean) as Array<{
        txn_date: string;
        description: string;
        amount: number;
        status: "unmatched";
      }>;

      if (payload.length === 0) return apiError(400, "No valid rows found.");
      const chunkSize = 500;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const { error } = await supabase
          .from("bank_transactions")
          .insert(payload.slice(i, i + chunkSize));
        if (error) throw new Error(error.message);
      }
      return NextResponse.json(
        { ok: true, imported: payload.length },
        { headers: NO_CACHE_HEADERS }
      );
    }

    const txId = typeof body.txId === "string" ? body.txId.trim() : "";
    if (!txId) return apiError(400, "Transaction id is required.");

    if (action === "linkExpense") {
      const expenseId = typeof body.expenseId === "string" ? body.expenseId.trim() : "";
      if (!expenseId) return apiError(400, "Expense id is required.");
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          status: "reconciled",
          reconcile_type: "Expense",
          reconciled_at: new Date().toISOString(),
          linked_expense_id: expenseId,
        })
        .eq("id", txId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "unlink") {
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          status: "unmatched",
          reconcile_type: null,
          reconciled_at: null,
          linked_expense_id: null,
          vendor_name: null,
          payment_method: null,
        })
        .eq("id", txId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "reconcile") {
      const type = body.type === "Income" || body.type === "Transfer" ? body.type : "Expense";
      const { data: tx, error: txError } = await supabase
        .from("bank_transactions")
        .select("id,txn_date,description,amount,status")
        .eq("id", txId)
        .maybeSingle();
      if (txError) throw new Error(txError.message);
      if (!tx) return apiError(404, "Transaction not found.");

      const row = tx as BankTransactionRow;
      if (type === "Expense") {
        const vendorName =
          typeof body.vendorName === "string" && body.vendorName.trim()
            ? body.vendorName.trim()
            : row.description;
        const paymentMethod =
          typeof body.paymentMethod === "string" && body.paymentMethod.trim()
            ? body.paymentMethod.trim()
            : "ACH";

        const { data: exp, error: expErr } = await supabase
          .from("expenses")
          .insert({
            expense_date: row.txn_date,
            vendor_name: vendorName,
            payment_method: paymentMethod,
            notes: row.description,
            reference_no: null,
          })
          .select("id")
          .single();
        if (expErr) throw new Error(expErr.message);
        const expenseId = (exp as { id: string }).id;

        const inputLines = Array.isArray(body.lines) ? (body.lines as SplitLineInput[]) : [];
        const lines =
          inputLines.length > 0
            ? inputLines
            : [
                {
                  projectId: body.projectId as string | null | undefined,
                  category: typeof body.category === "string" ? body.category : "Other",
                  memo: row.description,
                  amount: Math.abs(safeNumber(row.amount)),
                },
              ];
        const lineRows = lines.map((line) => ({
          expense_id: expenseId,
          project_id: line.projectId ?? null,
          category: line.category || "Other",
          memo: line.memo ?? null,
          amount: Math.max(0, safeNumber(line.amount)),
        }));
        const { error: linesErr } = await supabase.from("expense_lines").insert(lineRows);
        if (linesErr) throw new Error(linesErr.message);

        const { error: updateErr } = await supabase
          .from("bank_transactions")
          .update({
            status: "reconciled",
            reconcile_type: "Expense",
            reconciled_at: new Date().toISOString(),
            linked_expense_id: expenseId,
            vendor_name: vendorName,
            payment_method: paymentMethod,
          })
          .eq("id", txId);
        if (updateErr) throw new Error(updateErr.message);
        return NextResponse.json({ ok: true, expenseId }, { headers: NO_CACHE_HEADERS });
      }

      const { error: updateErr } = await supabase
        .from("bank_transactions")
        .update({
          status: "reconciled",
          reconcile_type: type,
          reconciled_at: new Date().toISOString(),
        })
        .eq("id", txId);
      if (updateErr) throw new Error(updateErr.message);
      return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
    }

    return apiError(400, "Unsupported bank transaction action.");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update bank transactions.";
    return apiError(500, message);
  }
}
