"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getBankTransactions,
  importBankTransactionsFromCsv,
  reconcileBankTransaction,
  linkBankTransactionToExpense,
  unlinkBankTransaction,
  getSuggestedExpensesForBankTx,
  getProjects,
  getExpenseCategories,
  getVendors,
  getPaymentMethods,
  addExpenseCategory,
  addVendor,
  addPaymentMethod,
  type BankTransaction,
  type ReconcileParams,
  type ExpenseSuggestion,
} from "@/lib/data";
import { SplitLinesEditor, type SplitLineRow } from "@/components/split-lines-editor";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Upload, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type TabFilter = "unmatched" | "reconciled" | "all";

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

export default function BankReconcilePage() {
  const [transactions, setTransactions] = React.useState<BankTransaction[]>([]);
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

  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [vendorsList, setVendorsList] = React.useState<string[]>([]);
  const [paymentMethodsList, setPaymentMethodsList] = React.useState<string[]>([]);

  const reloadAll = React.useCallback(async () => {
    const [txs, projs, cats, vendors, methods] = await Promise.all([
      getBankTransactions(),
      getProjects(),
      getExpenseCategories(),
      getVendors(),
      getPaymentMethods(),
    ]);
    setTransactions(txs);
    setProjects(projs);
    setCategories(cats);
    setVendorsList(vendors);
    setPaymentMethodsList(methods);
  }, []);

  React.useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useOnAppSync(
    React.useCallback(() => {
      void reloadAll();
    }, [reloadAll]),
    [reloadAll]
  );

  const selected =
    selectedIds.size === 1
      ? (transactions.find((t) => t.id === Array.from(selectedIds)[0]) ?? null)
      : null;
  const selectedList = transactions.filter((t) => selectedIds.has(t.id));
  const isBulkMode = selectedList.length > 1;

  const refresh = React.useCallback(async () => {
    const txs = await getBankTransactions();
    setTransactions(txs);
    return txs;
  }, []);

  const targetAmount = selected ? Math.abs(selected.amount) : 0;
  const linesTotal = lines.reduce((s, l) => s + l.amount, 0);
  const remaining = targetAmount - linesTotal;
  const canReconcile =
    reconcileType !== "Expense" || (remaining === 0 && lines.some((l) => l.amount > 0));

  React.useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result);
      const imported = await importBankTransactionsFromCsv(text);
      await refresh();
      setImportMessage(`Imported ${imported.length} lines`);
      setTimeout(() => setImportMessage(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLineChange = (lineId: string, patch: Partial<SplitLineRow>) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  };

  const handleDeleteLine = (lineId: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== lineId)));
  };

  const handleReconcile = async () => {
    if (!selected || !canReconcile) return;
    const params: ReconcileParams = {
      bankTxId: selected.id,
      type: reconcileType,
      vendorName: vendorName || selected.description,
      paymentMethod,
      lines:
        reconcileType === "Expense" && lines.length > 0
          ? lines.map((l) => ({
              projectId: l.projectId,
              category: l.category || "Other",
              memo: l.memo ?? undefined,
              amount: l.amount,
            }))
          : undefined,
    };
    await reconcileBankTransaction(params);
    const txs = await refresh();
    const next = getNextUnmatched(txs, selected.id);
    setSelectedIds(next ? new Set([next.id]) : new Set());
  };

  const handleLinkToExpense = async (expenseId: string) => {
    if (!selected) return;
    const ok = await linkBankTransactionToExpense(selected.id, expenseId);
    if (ok) {
      const txs = await refresh();
      const next = getNextUnmatched(txs, selected.id);
      setSelectedIds(next ? new Set([next.id]) : new Set());
    }
  };

  const handleUnlink = async () => {
    if (!selected) return;
    await unlinkBankTransaction(selected.id);
    const txs = await refresh();
    const updated = txs.find((t) => t.id === selected.id);
    setSelectedIds(updated ? new Set([updated.id]) : new Set());
  };

  const selectedTxFromList = selected
    ? (transactions.find((t) => t.id === selected.id) ?? selected)
    : null;
  const isReconciled = selectedTxFromList?.status === "reconciled";
  const isLinkedToExpense = !!selectedTxFromList?.linkedExpenseId;
  const [suggestions, setSuggestions] = React.useState<ExpenseSuggestion[]>([]);
  React.useEffect(() => {
    if (!selected || selected.status !== "unmatched") {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    getSuggestedExpensesForBankTx(selected).then((s) => {
      if (!cancelled) setSuggestions(s);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const bankListRef = React.useRef<HTMLDivElement>(null);
  const [focusNewLineId, setFocusNewLineId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selected || reconcileType !== "Expense") return;
    const el = document.getElementById("bank-reconcile-first-focus");
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
      queueMicrotask(() => el.focus());
    }
  }, [selected, reconcileType]);

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
      handleReconcileAll();
    } else if (!isBulkMode && e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      if (canReconcile) {
        e.preventDefault();
        handleReconcile();
      }
    } else if (!isBulkMode && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (
        suggestions.length > 0 &&
        !("linkedBankTxId" in suggestions[0].expense && suggestions[0].expense.linkedBankTxId)
      ) {
        e.preventDefault();
        handleLinkToExpense(suggestions[0].expense.id);
      }
    }
  };

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

  const handleReconcileAll = async () => {
    const fresh = await getBankTransactions();
    for (const tx of selectedList) {
      const current = fresh.find((t) => t.id === tx.id);
      if (!current) continue;
      if (current.amount < 0) {
        await reconcileBankTransaction({
          bankTxId: current.id,
          type: "Expense",
          projectId: bulkProjectId || null,
          category: bulkCategory || "Other",
          vendorName: bulkVendor || current.description,
          paymentMethod: bulkPaymentMethod || "ACH",
          lines: [
            {
              projectId: bulkProjectId || null,
              category: bulkCategory || "Other",
              memo: current.description,
              amount: Math.abs(current.amount),
            },
          ],
        });
      } else {
        await reconcileBankTransaction({
          bankTxId: current.id,
          type: "Income",
        });
      }
    }
    const txs = await refresh();
    const next = getNextUnmatched(txs, null);
    setSelectedIds(next ? new Set([next.id]) : new Set());
    setToastMessage(`Reconciled ${selectedList.length} transaction(s).`);
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Bank Reconcile"
        description="Import CSV and reconcile each transaction. Owner/internal only."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Bank lines */}
        <div
          ref={bankListRef}
          tabIndex={0}
          className="overflow-hidden border border-[#E5E7EB] p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-border"
          onKeyDown={handleBankListKeyDown}
        >
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-2 sm:w-auto">
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
                className="rounded-sm"
                onClick={() => document.getElementById("bank-csv-upload")?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
            </div>
            <Input
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs rounded-sm"
            />
          </div>
          {importMessage && (
            <p className="mb-2 text-sm text-[#111827] dark:text-foreground">{importMessage}</p>
          )}
          {toastMessage && (
            <p className="mb-2 text-sm text-[#111827] dark:text-foreground">{toastMessage}</p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            {(["unmatched", "reconciled", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  tab === t
                    ? "border-[#111827]/25 bg-[#F9FAFB] text-[#111827] dark:border-border dark:bg-muted/40 dark:text-foreground"
                    : "border-[#E5E7EB] bg-background text-muted-foreground hover:bg-[#F9FAFB]/60 dark:border-border"
                )}
              >
                {t}
              </button>
            ))}
            {unmatchedInFiltered.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto rounded-sm"
                onClick={selectAllUnmatched}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Select all Unmatched
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-sm border border-[#E5E7EB] dark:border-border">
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
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => (
                  <TableRow
                    key={tx.id}
                    className={cn(
                      "cursor-pointer border-b border-[#E5E7EB]/80 transition-colors hover:bg-[#F9FAFB] dark:border-border/40 dark:hover:bg-muted/20",
                      selectedIds.has(tx.id) && "bg-[#F9FAFB] dark:bg-muted/30"
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
                      {tx.amount >= 0 ? "+" : ""}${tx.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          tx.status === "reconciled" ? "text-hh-profit-positive" : "text-amber-600"
                        )}
                      >
                        {tx.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right: Reconcile panel */}
        <div
          className="overflow-hidden border border-[#E5E7EB] p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-border"
          onKeyDown={handlePanelKeyDown}
          tabIndex={0}
        >
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
                  onCreate={async (name) => {
                    const id = await addExpenseCategory(name);
                    if (id) setBulkCategory(name);
                  }}
                />
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Project
                  </label>
                  <Select value={bulkProjectId} onChange={(e) => setBulkProjectId(e.target.value)}>
                    <option value="">Overhead</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <CreatableSelect
                  label="Vendor"
                  value={bulkVendor}
                  options={vendorsList}
                  placeholder="Vendor"
                  onChange={setBulkVendor}
                  onCreate={(name) => {
                    addVendor(name);
                    setBulkVendor(name);
                  }}
                />
                <CreatableSelect
                  label="Payment Method"
                  value={bulkPaymentMethod}
                  options={paymentMethodsList}
                  placeholder="Payment method"
                  onChange={setBulkPaymentMethod}
                  onCreate={(name) => {
                    addPaymentMethod(name);
                    setBulkPaymentMethod(name);
                  }}
                />
              </div>
              <Button size="sm" className="mt-6 w-full rounded-sm" onClick={handleReconcileAll}>
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
                  {selectedTxFromList?.amount.toLocaleString()}
                </p>
                {selectedTxFromList?.reconciledAt && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Reconciled on {selectedTxFromList.reconciledAt}
                  </p>
                )}
                {isLinkedToExpense && selectedTxFromList?.linkedExpenseId && (
                  <p className="text-sm font-medium text-foreground mb-2">
                    Linked to Expense #{selectedTxFromList.linkedExpenseId}
                  </p>
                )}
                <span className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-foreground">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      reconcileType === "Expense" && "bg-red-500/80",
                      reconcileType === "Income" && "bg-[#166534]/80",
                      reconcileType === "Transfer" && "bg-foreground/40"
                    )}
                  />
                  {reconcileType}
                </span>
                <div className="flex flex-col gap-2">
                  {selectedTxFromList?.linkedExpenseId && (
                    <Button asChild variant="outline" size="sm" className="rounded-sm">
                      <Link href={`/financial/expenses/${selectedTxFromList.linkedExpenseId}`}>
                        Open Expense
                      </Link>
                    </Button>
                  )}
                  {isLinkedToExpense && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-sm border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400"
                      onClick={handleUnlink}
                    >
                      Unlink
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground mb-2">Reconcile</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {selected.description} — {selected.amount >= 0 ? "+" : ""}$
                  {selected.amount.toLocaleString()}
                </p>
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Type
                  </label>
                  <Select
                    value={reconcileType}
                    onChange={(e) =>
                      setReconcileType(e.target.value as "Expense" | "Income" | "Transfer")
                    }
                  >
                    <option value="Expense">Expense</option>
                    <option value="Income">Income</option>
                    <option value="Transfer">Transfer</option>
                  </Select>
                </div>

                {reconcileType === "Expense" && (
                  <>
                    {suggestions.length > 0 && (
                      <div className="mt-4 border border-[#E5E7EB] p-4 dark:border-border">
                        <h3 className="mb-3 text-sm font-semibold text-foreground">
                          Match Existing Expense
                        </h3>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Link this bank line to an existing expense to avoid duplicates.
                        </p>
                        <div className="max-h-64 space-y-2 overflow-y-auto">
                          {suggestions.map((s) => (
                            <div
                              key={s.expense.id}
                              className="flex flex-wrap items-center gap-2 border border-[#E5E7EB] p-2 text-sm dark:border-border"
                            >
                              <span className="tabular-nums text-muted-foreground w-20">
                                {s.expense.date}
                              </span>
                              <span className="font-medium min-w-[100px]">
                                {s.expense.vendorName}
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
                                <Button asChild variant="ghost" size="sm" className="h-8">
                                  <Link href={`/financial/expenses/${s.expense.id}`}>View</Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => handleLinkToExpense(s.expense.id)}
                                  disabled={
                                    !!("linkedBankTxId" in s.expense && s.expense.linkedBankTxId)
                                  }
                                >
                                  Link
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                        onAddCategory={addExpenseCategory}
                        onAddVendor={addVendor}
                        onAddPaymentMethod={addPaymentMethod}
                        onToast={setToastMessage}
                        isExpenseCategoryDisabled={() => false}
                        isVendorDisabled={() => false}
                        isPaymentMethodDisabled={() => false}
                        minLines={1}
                        firstFocusId="bank-reconcile-first-focus"
                        focusLineId={focusNewLineId}
                        onFocusLineHandled={() => setFocusNewLineId(null)}
                      />
                    </div>
                  </>
                )}

                {reconcileType !== "Expense" && (
                  <p className="text-sm text-muted-foreground mt-4">
                    Mark as reconciled without creating an expense.
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    size="sm"
                    className="rounded-sm"
                    onClick={handleReconcile}
                    disabled={!canReconcile}
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
        </div>
      </div>
    </div>
  );
}
