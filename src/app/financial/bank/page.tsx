"use client";

import * as React from "react";
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
  isExpenseCategoryDisabled,
  isVendorDisabled,
  isPaymentMethodDisabled,
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

function getNextUnmatched(transactions: BankTransaction[], currentId: string | null): BankTransaction | null {
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
  const [transactions, setTransactions] = React.useState<BankTransaction[]>(() => getBankTransactions());
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<TabFilter>("unmatched");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [importMessage, setImportMessage] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const [reconcileType, setReconcileType] = React.useState<"Expense" | "Income" | "Transfer">("Expense");
  const [lines, setLines] = React.useState<SplitLineRow[]>([]);
  const [vendorName, setVendorName] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("ACH");

  const [bulkCategory, setBulkCategory] = React.useState("Other");
  const [bulkProjectId, setBulkProjectId] = React.useState<string>("");
  const [bulkVendor, setBulkVendor] = React.useState("");
  const [bulkPaymentMethod, setBulkPaymentMethod] = React.useState("ACH");

  const selected =
    selectedIds.size === 1
      ? transactions.find((t) => t.id === Array.from(selectedIds)[0]) ?? null
      : null;
  const selectedList = transactions.filter((t) => selectedIds.has(t.id));
  const isBulkMode = selectedList.length > 1;

  const projects = getProjects();
  const categories = getExpenseCategories();
  const vendorsList = getVendors();
  const paymentMethodsList = getPaymentMethods();

  const targetAmount = selected ? Math.abs(selected.amount) : 0;
  const linesTotal = lines.reduce((s, l) => s + l.amount, 0);
  const remaining = targetAmount - linesTotal;
  const canReconcile =
    reconcileType !== "Expense" ||
    (remaining === 0 && lines.some((l) => l.amount > 0));

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

  const refresh = React.useCallback(() => {
    setTransactions(getBankTransactions());
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const imported = importBankTransactionsFromCsv(text);
      refresh();
      setImportMessage(`Imported ${imported.length} lines`);
      setTimeout(() => setImportMessage(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLineChange = (lineId: string, patch: Partial<SplitLineRow>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    );
  };

  const handleDeleteLine = (lineId: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== lineId)));
  };

  const handleReconcile = () => {
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
    reconcileBankTransaction(params);
    refresh();
    const next = getNextUnmatched(getBankTransactions(), selected.id);
    setSelectedIds(next ? new Set([next.id]) : new Set());
  };

  const handleLinkToExpense = (expenseId: string) => {
    if (!selected) return;
    const ok = linkBankTransactionToExpense(selected.id, expenseId);
    if (ok) {
      refresh();
      const next = getNextUnmatched(getBankTransactions(), selected.id);
      setSelectedIds(next ? new Set([next.id]) : new Set());
    }
  };

  const handleUnlink = () => {
    if (!selected) return;
    unlinkBankTransaction(selected.id);
    refresh();
    const updated = getBankTransactions().find((t) => t.id === selected.id);
    setSelectedIds(updated ? new Set([updated.id]) : new Set());
  };

  const selectedTxFromList = selected ? transactions.find((t) => t.id === selected.id) ?? selected : null;
  const isReconciled = selectedTxFromList?.status === "reconciled";
  const isLinkedToExpense = !!(selectedTxFromList?.linkedExpenseId);
  const suggestions: ExpenseSuggestion[] = React.useMemo(
    () => (selected && selected.status === "unmatched" ? getSuggestedExpensesForBankTx(selected) : []),
    [selected]
  );

  const bankListRef = React.useRef<HTMLDivElement>(null);
  const [focusNewLineId, setFocusNewLineId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selected || reconcileType !== "Expense") return;
    const el = document.getElementById("bank-reconcile-first-focus");
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
      queueMicrotask(() => el.focus());
    }
  }, [selected?.id, reconcileType, selected]);

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
      if (suggestions.length > 0 && !("linkedBankTxId" in suggestions[0].expense && suggestions[0].expense.linkedBankTxId)) {
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

  const handleReconcileAll = () => {
    const fresh = getBankTransactions();
    for (const tx of selectedList) {
      const current = fresh.find((t) => t.id === tx.id);
      if (!current) continue;
      if (current.amount < 0) {
        reconcileBankTransaction({
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
        reconcileBankTransaction({
          bankTxId: current.id,
          type: "Income",
        });
      }
    }
    refresh();
    const next = getNextUnmatched(getBankTransactions(), null);
    setSelectedIds(next ? new Set([next.id]) : new Set());
    setToastMessage(`Reconciled ${selectedList.length} transaction(s).`);
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Bank Reconcile"
        description="Import CSV and reconcile each transaction. Owner/internal only."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Bank lines */}
        <Card
          ref={bankListRef}
          tabIndex={0}
          className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-4 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => document.getElementById("bank-csv-upload")?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
            </div>
            <Input
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg max-w-xs"
            />
          </div>
          {importMessage && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-2">{importMessage}</p>
          )}
          {toastMessage && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-2">{toastMessage}</p>
          )}
          <div className="flex gap-2 mb-3">
            {(["unmatched", "reconciled", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium capitalize",
                  tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
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
                className="rounded-lg ml-auto"
                onClick={selectAllUnmatched}
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Select all Unmatched
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <TableHead className="w-10 text-center">
                    <span className="sr-only">Select</span>
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Description</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => (
                  <TableRow
                    key={tx.id}
                    className={cn(
                      "cursor-pointer border-b border-zinc-100/50 dark:border-border/30",
                      selectedIds.has(tx.id) && "bg-primary/10"
                    )}
                    onClick={() => setSelectedIds(new Set([tx.id]))}
                  >
                    <TableCell className="w-10 p-2 text-center" onClick={(e) => e.stopPropagation()}>
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
                        tx.amount >= 0 ? "text-emerald-600/90 dark:text-emerald-400/90" : "text-red-600/90 dark:text-red-400/90"
                      )}
                    >
                      {tx.amount >= 0 ? "+" : ""}${tx.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-xs font-medium", tx.status === "reconciled" ? "text-emerald-600" : "text-amber-600")}>
                        {tx.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Right: Reconcile panel */}
        <Card
          className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6"
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
                {selectedList.length} transaction(s) selected. Expenses will use one line each; income will be marked reconciled.
              </p>
              <div className="space-y-4">
                <CreatableSelect
                  label="Category"
                  value={bulkCategory}
                  options={categories}
                  placeholder="Category"
                  onChange={setBulkCategory}
                  onCreate={(name) => {
                    const id = addExpenseCategory(name);
                    if (id) setBulkCategory(name);
                  }}
                />
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
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
              <Button className="mt-6 rounded-lg w-full" onClick={handleReconcileAll}>
                Reconcile All
              </Button>
            </>
          ) : selected ? (
            isReconciled ? (
              <>
                <h2 className="text-base font-semibold text-foreground mb-2">Reconciled</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedTxFromList?.description} — {selectedTxFromList && (selectedTxFromList.amount >= 0 ? "+" : "")}${selectedTxFromList?.amount.toLocaleString()}
                </p>
                {selectedTxFromList?.reconciledAt && (
                  <p className="text-sm text-muted-foreground mb-2">Reconciled on {selectedTxFromList.reconciledAt}</p>
                )}
                {isLinkedToExpense && selectedTxFromList?.linkedExpenseId && (
                  <p className="text-sm font-medium text-foreground mb-2">Linked to Expense #{selectedTxFromList.linkedExpenseId}</p>
                )}
                <span
                  className={cn(
                    "inline-block text-xs font-medium px-2 py-1 rounded mb-4",
                    reconcileType === "Expense" && "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
                    reconcileType === "Income" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400",
                    reconcileType === "Transfer" && "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {reconcileType}
                </span>
                <div className="flex flex-col gap-2">
                  {selectedTxFromList?.linkedExpenseId && (
                    <Button asChild variant="outline" className="rounded-lg">
                      <Link href={`/financial/expenses/${selectedTxFromList.linkedExpenseId}`}>Open Expense</Link>
                    </Button>
                  )}
                  {isLinkedToExpense && (
                    <Button variant="outline" className="rounded-lg text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-600" onClick={handleUnlink}>
                      Unlink
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground mb-2">Reconcile</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {selected.description} — {selected.amount >= 0 ? "+" : ""}${selected.amount.toLocaleString()}
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                    value={reconcileType}
                    onChange={(e) => setReconcileType(e.target.value as "Expense" | "Income" | "Transfer")}
                  >
                    <option value="Expense">Expense</option>
                    <option value="Income">Income</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>

                {reconcileType === "Expense" && (
                  <>
                    {suggestions.length > 0 && (
                      <Card className="mt-4 p-4 rounded-xl border border-zinc-200/60 dark:border-border">
                        <h3 className="text-sm font-semibold text-foreground mb-3">Match Existing Expense</h3>
                        <p className="text-xs text-muted-foreground mb-3">Link this bank line to an existing expense to avoid duplicates.</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {suggestions.map((s) => (
                            <div
                              key={s.expense.id}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200/60 dark:border-border p-2 text-sm"
                            >
                              <span className="tabular-nums text-muted-foreground w-20">{s.expense.date}</span>
                              <span className="font-medium min-w-[100px]">{s.expense.vendorName}</span>
                              <span className="tabular-nums font-medium text-red-600/90 dark:text-red-400/90">${s.total.toLocaleString()}</span>
                              <span className="text-muted-foreground">{s.projectLabel}</span>
                              <span className="text-muted-foreground">{s.categoryLabel}</span>
                              <span className="text-muted-foreground truncate max-w-[120px]" title={s.memoLabel}>{s.memoLabel}</span>
                              <div className="ml-auto flex gap-1">
                                <Button asChild variant="ghost" size="sm" className="h-8">
                                  <Link href={`/financial/expenses/${s.expense.id}`}>View</Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => handleLinkToExpense(s.expense.id)}
                                  disabled={!!("linkedBankTxId" in s.expense && s.expense.linkedBankTxId)}
                                >
                                  Link
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
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
                )}

                {reconcileType !== "Expense" && (
                  <p className="text-sm text-muted-foreground mt-4">Mark as reconciled without creating an expense.</p>
                )}

                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    onClick={handleReconcile}
                    className="rounded-lg"
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
        </Card>
      </div>
    </div>
  );
}
