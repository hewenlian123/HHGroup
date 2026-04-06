"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SplitLinesEditor, type SplitLineRow } from "@/components/split-lines-editor";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Upload, CheckSquare } from "lucide-react";
import { MatchStatusBadge, bankTransactionMatchKind } from "@/components/base";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase";

type TabFilter = "unmatched" | "reconciled" | "all";

type BankTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: "unmatched" | "reconciled";
  reconciledAt?: string | null;
  linkedExpenseId?: string | null;
  reconcileType?: "Expense" | "Income" | "Transfer" | null;
};

type ExpenseSuggestion = {
  expense: { id: string; expense_date: string; vendor_name: string; total: number };
  total: number;
  projectLabel: string;
  categoryLabel: string;
  memoLabel: string;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

function suggestFromDescription(description: string): { vendor?: string; category?: string } {
  const d = description.toLowerCase();
  const out: { vendor?: string; category?: string } = {};
  if (d.includes("home depot")) {
    out.vendor = "Home Depot";
    out.category = "Materials";
  }
  if (d.includes("permit")) out.category = out.category ?? "Permit";
  if (d.includes("fuel") || d.includes("gas")) out.category = out.category ?? "Fuel";
  if (d.includes("steel")) out.category = out.category ?? "Materials";
  return out;
}

function createEmptyLine(id: string): SplitLineRow {
  return { id, projectId: null, category: "Other", memo: null, amount: 0 };
}

function getNextUnmatched(
  transactions: BankTransaction[],
  currentId: string | null
): BankTransaction | null {
  const unmatched = transactions.filter((t) => t.status === "unmatched");
  if (unmatched.length === 0) return null;
  if (!currentId) return unmatched[0];
  const idx = unmatched.findIndex((t) => t.id === currentId);
  if (idx < 0) return unmatched[0];
  if (idx >= unmatched.length - 1) return null;
  return unmatched[idx + 1];
}

function isEditableElement(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  if (role === "combobox" || role === "listbox") return true;
  return false;
}

function parseCsv(text: string): Array<{ date: string; description: string; amount: number }> {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader =
    header.some((h) => h.includes("date")) && header.some((h) => h.includes("amount"));
  const startIdx = hasHeader ? 1 : 0;

  const dateIdx = hasHeader ? header.findIndex((h) => h.includes("date")) : 0;
  const descIdx = hasHeader
    ? header.findIndex((h) => h.includes("description") || h.includes("memo") || h.includes("name"))
    : 1;
  const amtIdx = hasHeader ? header.findIndex((h) => h.includes("amount")) : 2;

  const toYmd = (raw: string): string | null => {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) {
      const mm = String(m[1]).padStart(2, "0");
      const dd = String(m[2]).padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  };

  const toAmount = (raw: string): number | null => {
    const s = raw.replace(/\$/g, "").replace(/,/g, "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const out: Array<{ date: string; description: string; amount: number }> = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const date = toYmd(cols[dateIdx] ?? "");
    const description = (cols[descIdx] ?? "").trim();
    const amount = toAmount(cols[amtIdx] ?? "");
    if (!date || !description || amount == null) continue;
    out.push({ date, description, amount });
  }
  return out;
}

export default function BankReconcileClient() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [transactions, setTransactions] = React.useState<BankTransaction[]>([]);
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = React.useState<string[]>(["Other"]);
  const [vendorsList, setVendorsList] = React.useState<string[]>([]);
  const [paymentMethodsList, setPaymentMethodsList] = React.useState<string[]>(["ACH"]);

  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<TabFilter>("unmatched");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [importMessage, setImportMessage] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const [reconcileType, setReconcileType] = React.useState<"Expense" | "Income" | "Transfer">(
    "Expense"
  );
  const [lines, setLines] = React.useState<SplitLineRow[]>([]);
  const [vendorName, setVendorName] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("ACH");

  const [bulkCategory, setBulkCategory] = React.useState("Other");
  const [bulkProjectId, setBulkProjectId] = React.useState<string>("");
  const [bulkVendor, setBulkVendor] = React.useState("");
  const [bulkPaymentMethod, setBulkPaymentMethod] = React.useState("ACH");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);

    const [txRes, projRes, catRes, venRes, pmRes] = await Promise.all([
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
      supabase
        .from("categories")
        .select("name,type,status")
        .eq("type", "expense")
        .order("name", { ascending: true })
        .limit(500),
      supabase.from("vendors").select("name,status").order("name", { ascending: true }).limit(500),
      supabase
        .from("payment_methods")
        .select("name,status")
        .order("name", { ascending: true })
        .limit(500),
    ]);

    if (txRes.error) {
      if (!isMissingTableError(txRes.error)) setError(txRes.error.message);
      setTransactions([]);
    } else {
      const list = (txRes.data ?? []).map((r) => {
        const row = r as {
          id: string;
          txn_date: string;
          description: string;
          amount: number;
          status: "unmatched" | "reconciled";
          reconciled_at?: string | null;
          linked_expense_id?: string | null;
          reconcile_type?: "Expense" | "Income" | "Transfer" | null;
        };
        return {
          id: row.id,
          date: row.txn_date,
          description: row.description,
          amount: safeNumber(row.amount),
          status: row.status,
          reconciledAt: row.reconciled_at ?? null,
          linkedExpenseId: row.linked_expense_id ?? null,
          reconcileType: row.reconcile_type ?? null,
        } satisfies BankTransaction;
      });
      setTransactions(list);
    }

    if (projRes.error)
      setError((prev) => prev ?? projRes.error?.message ?? "Failed to load projects.");
    setProjects((projRes.data ?? []) as Array<{ id: string; name: string }>);

    if (catRes.error) {
      if (!isMissingTableError(catRes.error))
        setError((prev) => prev ?? catRes.error?.message ?? "Failed to load categories.");
      setCategories(["Other"]);
    } else {
      const names = (catRes.data ?? [])
        .filter((r) => (r as { status?: string }).status !== "inactive")
        .map((r) => (r as { name: string }).name)
        .filter(Boolean);
      setCategories(names.length ? names : ["Other"]);
    }

    if (venRes.error) {
      if (!isMissingTableError(venRes.error))
        setError((prev) => prev ?? venRes.error?.message ?? "Failed to load vendors.");
      setVendorsList([]);
    } else {
      setVendorsList(
        (venRes.data ?? [])
          .filter((r) => (r as { status?: string }).status !== "inactive")
          .map((r) => (r as { name: string }).name)
          .filter(Boolean)
      );
    }

    if (pmRes.error) {
      if (!isMissingTableError(pmRes.error))
        setError((prev) => prev ?? pmRes.error?.message ?? "Failed to load payment methods.");
      setPaymentMethodsList(["ACH"]);
    } else {
      const names = (pmRes.data ?? [])
        .filter((r) => (r as { status?: string }).status !== "inactive")
        .map((r) => (r as { name: string }).name)
        .filter(Boolean);
      setPaymentMethodsList(names.length ? names : ["ACH"]);
    }

    setLoading(false);
  }, [configured, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  React.useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  const selected =
    selectedIds.size === 1
      ? (transactions.find((t) => t.id === Array.from(selectedIds)[0]) ?? null)
      : null;
  const selectedList = transactions.filter((t) => selectedIds.has(t.id));
  const isBulkMode = selectedList.length > 1;

  const targetAmount = selected ? Math.abs(selected.amount) : 0;
  const linesTotal = lines.reduce((s, l) => s + l.amount, 0);
  const remaining = targetAmount - linesTotal;
  const canReconcile =
    reconcileType !== "Expense" || (remaining === 0 && lines.some((l) => l.amount > 0));

  const filtered = React.useMemo(() => {
    let list = transactions;
    if (tab === "unmatched") list = list.filter((t) => t.status === "unmatched");
    else if (tab === "reconciled") list = list.filter((t) => t.status === "reconciled");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.description.toLowerCase().includes(q));
    }
    return list;
  }, [transactions, tab, search]);

  const unmatchedInFiltered = React.useMemo(
    () => filtered.filter((t) => t.status === "unmatched"),
    [filtered]
  );

  React.useEffect(() => {
    if (selected) {
      setReconcileType(selected.amount < 0 ? "Expense" : "Income");
      const suggest = suggestFromDescription(selected.description);
      setVendorName(suggest.vendor ?? selected.description);
      setPaymentMethod("ACH");
      const firstCategory = suggest.category ?? "Other";
      const lineId = `line-${selected.id}-0`;
      setLines([
        {
          id: lineId,
          projectId: null,
          category: firstCategory,
          memo: selected.description,
          amount: selected.status === "unmatched" ? Math.abs(selected.amount) : 0,
        },
      ]);
    }
  }, [selected]);

  const handleLineChange = (lineId: string, patch: Partial<SplitLineRow>) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  };

  const handleDeleteLine = (lineId: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== lineId)));
  };

  const [suggestions, setSuggestions] = React.useState<ExpenseSuggestion[]>([]);

  React.useEffect(() => {
    const loadSuggestions = async () => {
      if (!supabase || !selected || selected.status !== "unmatched" || selected.amount >= 0) {
        setSuggestions([]);
        return;
      }
      const target = Math.abs(selected.amount);
      const txDate = selected.date;
      const txTime = new Date(txDate).getTime();
      const rangeStart = new Date(txTime - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const rangeEnd = new Date(txTime + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: expRows, error: expErr } = await supabase
        .from("expenses")
        .select("id,expense_date,vendor_name,total")
        .gte("expense_date", rangeStart)
        .lte("expense_date", rangeEnd)
        .order("expense_date", { ascending: false })
        .limit(50);

      if (expErr) {
        setSuggestions([]);
        return;
      }
      const close = (expRows ?? [])
        .map((e) => e as { id: string; expense_date: string; vendor_name: string; total: number })
        .filter((e) => Math.abs(safeNumber(e.total) - target) < 0.01);
      if (close.length === 0) {
        setSuggestions([]);
        return;
      }

      const ids = close.map((e) => e.id);
      const { data: lineRows } = await supabase
        .from("expense_lines")
        .select("expense_id,project_id,category,memo,projects(name)")
        .in("expense_id", ids)
        .order("created_at", { ascending: true })
        .limit(500);

      const firstByExpense = new Map<
        string,
        { project?: string; category?: string; memo?: string }
      >();
      for (const r of (lineRows ?? []) as Array<{
        expense_id: string;
        category: string;
        memo: string | null;
        projects?: { name: string } | { name: string }[] | null;
      }>) {
        if (firstByExpense.has(r.expense_id)) continue;
        const projRel = r.projects as { name: string } | { name: string }[] | null | undefined;
        const projName = Array.isArray(projRel) ? projRel[0]?.name : projRel?.name;
        firstByExpense.set(r.expense_id, {
          project: projName,
          category: r.category,
          memo: r.memo ?? undefined,
        });
      }

      setSuggestions(
        close.map((e) => {
          const meta = firstByExpense.get(e.id);
          return {
            expense: e,
            total: safeNumber(e.total),
            projectLabel: meta?.project ?? "Overhead",
            categoryLabel: meta?.category ?? "Other",
            memoLabel: meta?.memo ?? "—",
          };
        })
      );
    };
    void loadSuggestions();
  }, [selected, supabase]);

  const addExpenseCategory = async (name: string): Promise<string> => {
    const v = name.trim();
    if (!v || !supabase) return "";
    const { error: insErr } = await supabase
      .from("categories")
      .insert({ name: v, type: "expense", status: "active" });
    if (!insErr) {
      setCategories((prev) =>
        prev.includes(v) ? prev : [...prev, v].sort((a, b) => a.localeCompare(b))
      );
      return v;
    }
    setToastMessage(insErr.message);
    return "";
  };

  const addVendor = async (name: string): Promise<string> => {
    const v = name.trim();
    if (!v || !supabase) return "";
    const { error: insErr } = await supabase.from("vendors").insert({ name: v, status: "active" });
    if (!insErr) {
      setVendorsList((prev) =>
        prev.includes(v) ? prev : [...prev, v].sort((a, b) => a.localeCompare(b))
      );
      return v;
    }
    setToastMessage(insErr.message);
    return "";
  };

  const addPaymentMethod = async (name: string): Promise<string> => {
    const v = name.trim();
    if (!v || !supabase) return "";
    const { error: insErr } = await supabase
      .from("payment_methods")
      .insert({ name: v, status: "active" });
    if (!insErr) {
      setPaymentMethodsList((prev) =>
        prev.includes(v) ? prev : [...prev, v].sort((a, b) => a.localeCompare(b))
      );
      return v;
    }
    setToastMessage(insErr.message);
    return "";
  };

  const isExpenseCategoryDisabled = (name: string) => (name ? false : false);
  const isVendorDisabled = (name: string) => (name ? false : false);
  const isPaymentMethodDisabled = (name: string) => (name ? false : false);

  const reconcileTx = async (
    tx: BankTransaction,
    params: {
      type: "Expense" | "Income" | "Transfer";
      vendorName?: string;
      paymentMethod?: string;
      lines?: SplitLineRow[];
      projectId?: string | null;
      category?: string;
    }
  ) => {
    if (!supabase) return;

    if (params.type === "Expense") {
      const headerVendor = (params.vendorName || tx.description).trim();
      const headerMethod = (params.paymentMethod || "ACH").trim();

      const { data: exp, error: expErr } = await supabase
        .from("expenses")
        .insert({
          expense_date: tx.date,
          vendor_name: headerVendor,
          payment_method: headerMethod,
          notes: tx.description,
          reference_no: null,
        })
        .select("id")
        .single();
      if (expErr) throw expErr;
      const expenseId = (exp as { id: string }).id;

      const linePayload =
        params.lines && params.lines.length > 0
          ? params.lines
          : [
              {
                id: "auto",
                projectId: params.projectId ?? null,
                category: params.category ?? "Other",
                memo: tx.description,
                amount: Math.abs(tx.amount),
              },
            ];

      const rows = linePayload.map((l) => ({
        expense_id: expenseId,
        project_id: l.projectId ?? null,
        category: l.category || "Other",
        memo: l.memo ?? null,
        amount: Math.max(0, safeNumber(l.amount)),
      }));
      const { error: linesErr } = await supabase.from("expense_lines").insert(rows);
      if (linesErr) throw linesErr;

      const { error: updErr } = await supabase
        .from("bank_transactions")
        .update({
          status: "reconciled",
          reconcile_type: "Expense",
          reconciled_at: new Date().toISOString(),
          linked_expense_id: expenseId,
          vendor_name: headerVendor,
          payment_method: headerMethod,
        })
        .eq("id", tx.id);
      if (updErr) throw updErr;
      return;
    }

    const { error: updErr } = await supabase
      .from("bank_transactions")
      .update({
        status: "reconciled",
        reconcile_type: params.type,
        reconciled_at: new Date().toISOString(),
      })
      .eq("id", tx.id);
    if (updErr) throw updErr;
  };

  const handleReconcile = async () => {
    if (!selected || !canReconcile || !supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reconcileTx(selected, {
        type: reconcileType,
        vendorName,
        paymentMethod,
        lines: reconcileType === "Expense" ? lines : undefined,
      });
      await refresh();
      const next = getNextUnmatched(transactions, selected.id);
      setSelectedIds(next ? new Set([next.id]) : new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reconcile.");
    } finally {
      setBusy(false);
    }
  };

  const handleLinkToExpense = async (expenseId: string) => {
    if (!selected || !supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from("bank_transactions")
        .update({
          status: "reconciled",
          reconcile_type: "Expense",
          reconciled_at: new Date().toISOString(),
          linked_expense_id: expenseId,
        })
        .eq("id", selected.id);
      if (updErr) throw updErr;
      await refresh();
      const next = getNextUnmatched(transactions, selected.id);
      setSelectedIds(next ? new Set([next.id]) : new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link expense.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!selected || !supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from("bank_transactions")
        .update({
          status: "unmatched",
          reconcile_type: null,
          reconciled_at: null,
          linked_expense_id: null,
          vendor_name: null,
          payment_method: null,
        })
        .eq("id", selected.id);
      if (updErr) throw updErr;
      await refresh();
      setSelectedIds(new Set([selected.id]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlink.");
    } finally {
      setBusy(false);
    }
  };

  const handleReconcileAll = async () => {
    if (!supabase || busy || selectedList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const tx of selectedList) {
        if (tx.status !== "unmatched") continue;
        if (tx.amount < 0) {
          await reconcileTx(tx, {
            type: "Expense",
            vendorName: bulkVendor || tx.description,
            paymentMethod: bulkPaymentMethod || "ACH",
            projectId: bulkProjectId || null,
            category: bulkCategory || "Other",
          });
        } else {
          await reconcileTx(tx, { type: "Income" });
        }
      }
      await refresh();
      const next = getNextUnmatched(transactions, null);
      setSelectedIds(next ? new Set([next.id]) : new Set());
      setToastMessage(`Reconciled ${selectedList.length} transaction(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reconcile selected transactions.");
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    e.target.value = "";
    if (parsed.length === 0) {
      setImportMessage("No valid rows found.");
      setTimeout(() => setImportMessage(null), 4000);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const rows = parsed.map((r) => ({
        txn_date: r.date,
        description: r.description,
        amount: r.amount,
        status: "unmatched" as const,
      }));
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error: insErr } = await supabase.from("bank_transactions").insert(chunk);
        if (insErr) throw insErr;
      }
      await refresh();
      setImportMessage(`Imported ${rows.length} line(s)`);
      setTimeout(() => setImportMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const bankListRef = React.useRef<HTMLDivElement>(null);
  const [focusNewLineId, setFocusNewLineId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selected || reconcileType !== "Expense") return;
    const el = document.getElementById("bank-reconcile-first-focus");
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
      queueMicrotask(() => el.focus());
    }
  }, [selected?.id, reconcileType, selected]);

  const handleAddLineWithFocus = () => {
    const baseId = selected ? `line-${selected.id}` : "line-new";
    const newId = `${baseId}-${Date.now()}`;
    setLines((prev) => [...prev, createEmptyLine(newId)]);
    setFocusNewLineId(newId);
  };

  const toggleSelectedId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllUnmatched = () => {
    setSelectedIds(new Set(unmatchedInFiltered.map((t) => t.id)));
  };

  const handleBankListKeyDown = (e: React.KeyboardEvent) => {
    if (isEditableElement(e.target)) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = selected ? filtered.findIndex((t) => t.id === selected.id) : -1;
      const next = idx < 0 ? filtered[0] : filtered[idx + 1];
      if (next) setSelectedIds(new Set([next.id]));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = selected ? filtered.findIndex((t) => t.id === selected.id) : 0;
      const prev = idx <= 0 ? null : filtered[idx - 1];
      if (prev) setSelectedIds(new Set([prev.id]));
    }
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (isEditableElement(e.target)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setSelectedIds(new Set());
    } else if (isBulkMode && e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      void handleReconcileAll();
    } else if (!isBulkMode && e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      if (canReconcile) {
        e.preventDefault();
        void handleReconcile();
      }
    } else if (!isBulkMode && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (suggestions.length > 0) {
        e.preventDefault();
        void handleLinkToExpense(suggestions[0].expense.id);
      }
    }
  };

  const selectedTxFromList = selected
    ? (transactions.find((t) => t.id === selected.id) ?? selected)
    : null;
  const isReconciled = selectedTxFromList?.status === "reconciled";
  const isLinkedToExpense = !!selectedTxFromList?.linkedExpenseId;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Bank Reconcile" subtitle="Import CSV and reconcile each transaction." />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          ref={bankListRef}
          tabIndex={0}
          className="overflow-hidden p-4 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onKeyDown={handleBankListKeyDown}
        >
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                id="bank-csv-upload"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("bank-csv-upload")?.click()}
                disabled={busy || !configured}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
            </div>
            <Input
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          {importMessage ? (
            <p className="mb-2 text-sm text-text-primary dark:text-foreground">{importMessage}</p>
          ) : null}
          {toastMessage ? (
            <p className="mb-2 text-sm text-text-primary dark:text-foreground">{toastMessage}</p>
          ) : null}

          <div className="flex gap-2 mb-3">
            {(["unmatched", "reconciled", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium capitalize",
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {t}
              </button>
            ))}
            {unmatchedInFiltered.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={selectAllUnmatched}
                disabled={busy}
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Select all Unmatched
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 text-center">
                    <span className="sr-only">Select</span>
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Description
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                    Amount
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No data yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((tx) => {
                    const matchSt = bankTransactionMatchKind(tx.status);
                    return (
                      <TableRow
                        key={tx.id}
                        className={cn(
                          "hh-row-interactive cursor-pointer border-b border-zinc-100/50 dark:border-border/30",
                          selectedIds.has(tx.id) && "bg-primary/10"
                        )}
                        onClick={() => setSelectedIds(new Set([tx.id]))}
                      >
                        <TableCell
                          className="w-10 p-2 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => toggleSelectedId(tx.id)}
                            className="h-4 w-4 rounded border-input"
                          />
                        </TableCell>
                        <TableCell className="tabular-nums">{tx.date}</TableCell>
                        <TableCell className="font-medium">{tx.description}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            tx.amount >= 0
                              ? "text-hh-profit-positive dark:text-hh-profit-positive"
                              : "text-red-600/90 dark:text-red-400/90"
                          )}
                        >
                          {tx.amount >= 0 ? "+" : ""}$
                          {tx.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <MatchStatusBadge kind={matchSt.kind} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden p-6" onKeyDown={handlePanelKeyDown} tabIndex={0}>
          {selectedList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <p className="text-sm">Select a bank transaction to reconcile.</p>
            </div>
          ) : isBulkMode ? (
            <>
              <h2 className="text-base font-semibold text-foreground mb-1">Bulk Reconcile</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedList.length} transaction(s) selected. Expenses will use one line each;
                income will be marked reconciled.
              </p>
              <div className="space-y-4">
                <CreatableSelect
                  label="Category"
                  value={bulkCategory}
                  options={categories}
                  placeholder="Category"
                  onChange={setBulkCategory}
                  onCreate={(name) => {
                    void addExpenseCategory(name).then((v) => v && setBulkCategory(v));
                  }}
                />
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Project
                  </label>
                  <select
                    className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
                    value={bulkProjectId}
                    onChange={(e) => setBulkProjectId(e.target.value)}
                  >
                    <option value="">Overhead</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <CreatableSelect
                  label="Vendor"
                  value={bulkVendor}
                  options={vendorsList}
                  placeholder="Vendor"
                  onChange={setBulkVendor}
                  onCreate={(name) => {
                    void addVendor(name).then((v) => v && setBulkVendor(v));
                  }}
                />
                <CreatableSelect
                  label="Payment Method"
                  value={bulkPaymentMethod}
                  options={paymentMethodsList}
                  placeholder="Payment method"
                  onChange={setBulkPaymentMethod}
                  onCreate={(name) => {
                    void addPaymentMethod(name).then((v) => v && setBulkPaymentMethod(v));
                  }}
                />
              </div>
              <Button
                className="mt-6 w-full"
                onClick={() => void handleReconcileAll()}
                disabled={busy}
              >
                Reconcile All
              </Button>
            </>
          ) : selected ? (
            isReconciled ? (
              <>
                <h2 className="text-base font-semibold text-foreground mb-2">Reconciled</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedTxFromList?.description} —{" "}
                  {selectedTxFromList && (selectedTxFromList.amount >= 0 ? "+" : "")}$
                  {selectedTxFromList?.amount.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </p>
                {selectedTxFromList?.reconciledAt ? (
                  <p className="text-sm text-muted-foreground mb-2">
                    Reconciled on {selectedTxFromList.reconciledAt.slice(0, 10)}
                  </p>
                ) : null}
                {isLinkedToExpense && selectedTxFromList?.linkedExpenseId ? (
                  <p className="text-sm font-medium text-foreground mb-2">Linked to Expense</p>
                ) : null}
                <span
                  className={cn(
                    "inline-block text-xs font-medium px-2 py-1 rounded mb-4",
                    selectedTxFromList?.reconcileType === "Expense" &&
                      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
                    selectedTxFromList?.reconcileType === "Income" &&
                      "bg-[#DCFCE7] text-[#166534] dark:bg-emerald-900/40 dark:text-emerald-400",
                    selectedTxFromList?.reconcileType === "Transfer" &&
                      "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {selectedTxFromList?.reconcileType ?? "Reconciled"}
                </span>
                <div className="flex flex-col gap-2">
                  {selectedTxFromList?.linkedExpenseId ? (
                    <Button asChild variant="outline">
                      <Link href={`/financial/expenses/${selectedTxFromList.linkedExpenseId}`}>
                        Open Expense
                      </Link>
                    </Button>
                  ) : null}
                  {isLinkedToExpense ? (
                    <Button
                      variant="outline"
                      className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-600"
                      onClick={() => void handleUnlink()}
                      disabled={busy}
                    >
                      Unlink
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground mb-2">Reconcile</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {selected.description} — {selected.amount >= 0 ? "+" : ""}$
                  {selected.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </label>
                  <select
                    className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
                    value={reconcileType}
                    onChange={(e) =>
                      setReconcileType(e.target.value as "Expense" | "Income" | "Transfer")
                    }
                  >
                    <option value="Expense">Expense</option>
                    <option value="Income">Income</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>

                {reconcileType === "Expense" ? (
                  <>
                    {suggestions.length > 0 ? (
                      <Card className="mt-4 p-4 rounded-xl border border-zinc-200/60 dark:border-border">
                        <h3 className="text-sm font-semibold text-foreground mb-3">
                          Match Existing Expense
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          Link this bank line to an existing expense to avoid duplicates.
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {suggestions.map((s) => (
                            <div
                              key={s.expense.id}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200/60 dark:border-border p-2 text-sm"
                            >
                              <span className="tabular-nums text-muted-foreground w-20">
                                {s.expense.expense_date}
                              </span>
                              <span className="font-medium min-w-[100px]">
                                {s.expense.vendor_name}
                              </span>
                              <span className="tabular-nums font-medium text-red-600/90 dark:text-red-400/90">
                                ${s.total.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground">{s.projectLabel}</span>
                              <span className="text-muted-foreground">{s.categoryLabel}</span>
                              <span
                                className="text-muted-foreground truncate max-w-[120px]"
                                title={s.memoLabel}
                              >
                                {s.memoLabel}
                              </span>
                              <div className="ml-auto flex gap-1">
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="btn-outline-ghost h-8"
                                >
                                  <Link href={`/financial/expenses/${s.expense.id}`}>View</Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => void handleLinkToExpense(s.expense.id)}
                                  disabled={busy}
                                >
                                  Link
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ) : null}

                    <div className="mt-6">
                      <SplitLinesEditor
                        lines={lines}
                        onLineChange={handleLineChange}
                        onAddLine={handleAddLineWithFocus}
                        onDeleteLine={handleDeleteLine}
                        showHeaderVendorPayment
                        vendorName={vendorName}
                        onVendorNameChange={setVendorName}
                        paymentMethod={paymentMethod}
                        onPaymentMethodChange={setPaymentMethod}
                        targetAmount={targetAmount}
                        projects={projects}
                        categories={categories}
                        vendorsList={vendorsList}
                        paymentMethodsList={paymentMethodsList}
                        onAddCategory={(name) => {
                          void addExpenseCategory(name);
                          return name.trim();
                        }}
                        onAddVendor={(name) => {
                          void addVendor(name);
                          return name.trim();
                        }}
                        onAddPaymentMethod={(name) => {
                          void addPaymentMethod(name);
                          return name.trim();
                        }}
                        onToast={setToastMessage}
                        isExpenseCategoryDisabled={isExpenseCategoryDisabled}
                        isVendorDisabled={isVendorDisabled}
                        isPaymentMethodDisabled={isPaymentMethodDisabled}
                        minLines={1}
                        firstFocusId="bank-reconcile-first-focus"
                        focusLineId={focusNewLineId}
                        onFocusLineHandled={() => setFocusNewLineId(null)}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-4">
                    Mark as reconciled without creating an expense.
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    onClick={() => void handleReconcile()}
                    disabled={!canReconcile || busy}
                    title={
                      reconcileType === "Expense" && !canReconcile
                        ? remaining !== 0
                          ? "Lines total must equal Needed amount"
                          : "Add at least one line with amount > 0"
                        : undefined
                    }
                  >
                    {reconcileType === "Expense" ? "Reconcile & Create Expense" : "Reconcile"}
                  </Button>
                </div>
              </>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <p className="text-sm">Select a bank transaction to reconcile.</p>
            </div>
          )}
        </Card>
      </div>

      {!configured ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Supabase is not configured.</p>
        </Card>
      ) : null}
    </div>
  );
}
