"use client";

import * as React from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/base";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchExpenseReceiptManifest,
  type ExpenseReceiptApiManifest,
} from "@/lib/expense-receipt-api-client";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import type { Expense, ExpenseLine } from "@/lib/expenses-db";
import type { ExpensesInitialData } from "@/lib/queries/expenses";
import { expenseMatchesInboxPool } from "@/lib/expense-workflow-status";

type DraftLine = {
  key: string;
  id?: string;
  projectId: string;
  category: string;
  amount: string;
  clientReimbursable: boolean;
};

type Draft = {
  vendorName: string;
  vendorId: string | null;
  referenceNo: string;
  date: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  lines: DraftLine[];
  settlement: "unpaid" | "paid";
  paymentAccountId: string;
};

const fieldClass =
  "h-11 w-full rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] px-2 text-[var(--hh-text-primary)]";
const attentionClass = "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)]";

function moneyText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

function attentionOf(expense: Expense): string[] {
  const raw = expense.ocrConfidence?.attention;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function paperInbox(expense: Expense): boolean {
  if (!expenseMatchesInboxPool(expense)) return false;
  if (expense.sourceType === "reimbursement" || expense.workerId) return false;
  return true;
}

function draftFromExpense(expense: Expense): Draft {
  const lines = expense.lines.length > 0 ? expense.lines : [blankLine()];
  return {
    vendorName: expense.vendorName ?? "",
    vendorId: expense.vendorId ?? null,
    referenceNo: expense.referenceNo ?? "",
    date: expense.date?.slice(0, 10) ?? hawaiiTodayYmd(),
    dueDate: expense.dueDate?.slice(0, 10) ?? "",
    subtotal: moneyText(expense.subtotal),
    taxAmount: moneyText(expense.taxAmount),
    lines: lines.map((line, index) => lineFromExpense(line, index)),
    settlement: "unpaid",
    paymentAccountId: expense.paymentAccountId ?? "",
  };
}

function blankLine(): ExpenseLine {
  return { id: "", projectId: null, category: "", amount: 0 };
}

function lineFromExpense(line: ExpenseLine, index: number): DraftLine {
  return {
    key: line.id || `new-${index}`,
    id: line.id || undefined,
    projectId: line.projectId ?? "",
    category: line.category ?? "",
    amount: line.amount > 0.011 ? moneyText(line.amount) : "",
    clientReimbursable: line.clientReimbursable === true,
  };
}

function duplicateCopy(expense: Expense): string {
  if (expense.duplicateReason === "vendor_invoice") {
    return "This vendor and invoice number already exist on another expense.";
  }
  if (expense.duplicateReason === "amount_date_vendor") {
    return "Another expense has a similar vendor, the same total, and a date within 3 days.";
  }
  return "This invoice may duplicate an existing expense.";
}

function ocrLabel(status: Expense["ocrStatus"]): string {
  if (status === "pending") return "OCR pending";
  if (status === "processing") return "OCR reading";
  if (status === "done") return "OCR done";
  if (status === "failed") return "OCR failed";
  return "OCR not started";
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  return body.message || "Request failed.";
}

export function InboxReviewClient({ initialData }: { initialData: ExpensesInitialData }) {
  const { toast } = useToast();
  const [items, setItems] = React.useState(() => initialData.expenses.filter(paperInbox));
  const [index, setIndex] = React.useState(0);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [manifest, setManifest] = React.useState<ExpenseReceiptApiManifest | null>(null);
  const [busy, setBusy] = React.useState<"approve" | "delete" | "retry" | "vendor" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const dirty = React.useRef(false);
  const deleteFocus = React.useRef<HTMLButtonElement>(null);
  const current = index < items.length ? items[index] : null;
  const attention = current ? attentionOf(current) : [];

  const currentId = current?.id ?? null;
  const ocrWaiting = items.some(
    (item) => item.ocrStatus === "pending" || item.ocrStatus === "processing"
  );

  React.useEffect(() => {
    if (!current) {
      setDraft(null);
      return;
    }
    dirty.current = false;
    setDraft(draftFromExpense(current));
    setError(null);
    setManifest(null);
    const controller = new AbortController();
    fetchExpenseReceiptManifest(current.id, controller.signal)
      .then(setManifest)
      .catch(() => {
        if (!controller.signal.aborted) setManifest(null);
      });
    return () => controller.abort();
    // Reset the form only when the queue moves to another invoice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  React.useEffect(() => {
    if (!ocrWaiting || !currentId) return;
    let cancelled = false;
    const refreshCurrent = async () => {
      await fetch("/api/financial/expenses/ocr-worker", {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => undefined);
      if (cancelled) return;
      const response = await fetch(`/api/expenses/${encodeURIComponent(currentId)}/operations`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { expense?: Expense };
      if (!body.expense) return;
      setItems((prev) => prev.map((item) => (item.id === body.expense!.id ? body.expense! : item)));
      if (!dirty.current) setDraft(draftFromExpense(body.expense));
    };
    const timer = window.setInterval(() => void refreshCurrent(), 4000);
    void refreshCurrent();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentId, ocrWaiting]);

  function patchDraft(patch: Partial<Draft>) {
    dirty.current = true;
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    dirty.current = true;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
          }
        : prev
    );
  }

  async function approve() {
    if (!current || !draft || busy) return;
    const lines = draft.lines.map((line) => ({
      id: line.id,
      projectId: line.projectId,
      category: line.category.trim(),
      amount: Number(line.amount),
      clientReimbursable: line.clientReimbursable,
    }));
    if (lines.some((line) => !line.projectId)) {
      setError("Choose a project on every line before approving.");
      return;
    }
    if (lines.some((line) => !line.category)) {
      setError("Choose a category on every line before approving.");
      return;
    }
    if (lines.some((line) => !Number.isFinite(line.amount) || line.amount < 0)) {
      setError("Each line amount must be a number.");
      return;
    }
    if (lines.reduce((sum, line) => sum + line.amount, 0) <= 0) {
      setError("Enter an invoice total greater than zero.");
      return;
    }
    if (draft.settlement === "paid" && !draft.paymentAccountId) {
      setError("Choose a payment account to mark this expense paid.");
      return;
    }
    setBusy("approve");
    setError(null);
    try {
      const saved = await fetch(
        `/api/financial/expenses/${encodeURIComponent(current.id)}/review-save`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorName: draft.vendorName,
            vendorId: draft.vendorId,
            referenceNo: draft.referenceNo,
            date: draft.date,
            dueDate: draft.dueDate || null,
            subtotal: draft.subtotal === "" ? null : Number(draft.subtotal),
            taxAmount: draft.taxAmount === "" ? null : Number(draft.taxAmount),
            paymentAccountId: draft.settlement === "paid" ? draft.paymentAccountId : null,
            lines,
          }),
        }
      );
      if (!saved.ok) throw new Error(await readError(saved));
      const approved = await fetch(
        `/api/financial/expenses/${encodeURIComponent(current.id)}/approve-inbox`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settlement: draft.settlement,
            paymentAccountId: draft.settlement === "paid" ? draft.paymentAccountId : null,
            paidOn: draft.settlement === "paid" ? hawaiiTodayYmd() : null,
          }),
        }
      );
      if (!approved.ok) throw new Error(await readError(approved));
      setItems((prev) => prev.filter((item) => item.id !== current.id));
      toast({
        title: draft.settlement === "paid" ? "Approved as paid" : "Approved as unpaid",
        variant: "success",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve this invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!current || busy) return;
    setBusy("delete");
    setError(null);
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(current.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await readError(response));
      setItems((prev) => prev.filter((item) => item.id !== current.id));
      setConfirmDelete(false);
      toast({ title: "Invoice deleted", variant: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this invoice.");
    } finally {
      setBusy(null);
    }
  }

  function skip() {
    if (index >= items.length - 1) {
      setError("This is the last invoice in the queue.");
      return;
    }
    setError(null);
    setIndex((value) => value + 1);
  }

  async function retryOcr() {
    if (!current) return;
    setBusy("retry");
    setError(null);
    try {
      const response = await fetch(
        `/api/financial/expenses/${encodeURIComponent(current.id)}/ocr-retry`,
        { method: "POST", credentials: "same-origin" }
      );
      if (!response.ok) throw new Error(await readError(response));
      setItems((prev) =>
        prev.map((item) =>
          item.id === current.id ? { ...item, ocrStatus: "pending", ocrError: null } : item
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry OCR.");
    } finally {
      setBusy(null);
    }
  }

  async function createVendor() {
    if (!current || !draft) return;
    const name = (current.vendorSuggestion || draft.vendorName).trim();
    if (!name) return;
    setBusy("vendor");
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { vendor?: { id?: string; name?: string } };
      if (!body.vendor?.id) throw new Error("Vendor was not created.");
      patchDraft({ vendorId: body.vendor.id, vendorName: body.vendor.name || name });
      toast({ title: "Vendor saved", variant: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the vendor.");
    } finally {
      setBusy(null);
    }
  }

  async function dismissDuplicate() {
    if (!current) return;
    const response = await fetch(
      `/api/financial/expenses/${encodeURIComponent(current.id)}/duplicate-dismiss`,
      { method: "POST", credentials: "same-origin" }
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === current.id ? { ...item, duplicateDismissedAt: new Date().toISOString() } : item
      )
    );
  }

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (event.key === "a" || event.key === "A") {
        event.preventDefault();
        void approve();
      } else if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        skip();
      } else if (event.key === "Delete") {
        event.preventDefault();
        setConfirmDelete(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const receipt = manifest?.items[0];
  const lineTotal = (draft?.lines ?? []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  return (
    <div data-testid="inbox-review-queue" className="space-y-4 py-4">
      <PageHeader
        title="Review invoices"
        description="Check the scan, confirm the coding, then approve. A approves, S skips, Delete removes."
        actions={
          <Button variant="outline" asChild>
            <Link href="/financial/inbox">Back to Inbox</Link>
          </Button>
        }
      />
      {items.length === 0 || !current || !draft ? (
        <p className="text-[var(--hh-text-secondary)]">No invoices are waiting for review.</p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <section
            data-testid="inbox-review-document"
            className="min-h-[280px] w-full overflow-hidden rounded-xl border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] lg:sticky lg:top-4 lg:min-h-[70vh] lg:w-1/2"
          >
            {receipt?.mimeType.includes("pdf") ? (
              <iframe
                title="Scanned invoice"
                src={receipt.signedUrl}
                className="h-[50vh] w-full lg:h-[70vh]"
              />
            ) : receipt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={receipt.fileName || "Scanned invoice"}
                src={receipt.signedUrl}
                className="max-h-[70vh] w-full object-contain"
              />
            ) : (
              <p className="p-4 text-sm text-[var(--hh-text-secondary)]">
                No scanned document on this draft.
              </p>
            )}
          </section>
          <form
            className="w-full space-y-3 lg:w-1/2"
            onSubmit={(event) => {
              event.preventDefault();
              void approve();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--hh-text-secondary)]">
                {index + 1} of {items.length}
              </p>
              <p className="text-sm text-[var(--hh-text-primary)]" data-testid="inbox-review-ocr">
                {ocrLabel(current.ocrStatus)}
                {current.ocrError ? ` — ${current.ocrError}` : ""}
              </p>
            </div>
            {current.ocrStatus === "failed" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void retryOcr()}
                disabled={busy === "retry"}
              >
                Retry OCR
              </Button>
            ) : null}
            {current.duplicateExpenseId && !current.duplicateDismissedAt ? (
              <div
                data-testid="inbox-duplicate-warning"
                className="space-y-2 rounded-lg border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] p-3 text-sm text-[var(--hh-text-primary)]"
              >
                <p>{duplicateCopy(current)}</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="underline"
                    href={`/financial/expenses/${current.duplicateExpenseId}`}
                  >
                    Open existing expense
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void dismissDuplicate()}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-[var(--hh-danger)]">
                {error}
              </p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="inbox-review-vendor">Vendor</Label>
              <Input
                id="inbox-review-vendor"
                value={draft.vendorName}
                onChange={(event) => patchDraft({ vendorName: event.target.value, vendorId: null })}
                className={attention.includes("vendor") ? attentionClass : undefined}
              />
              {current.vendorSuggestion && !draft.vendorId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void createVendor()}
                >
                  Create vendor “{current.vendorSuggestion}”
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="inbox-review-invoice">Invoice number</Label>
                <Input
                  id="inbox-review-invoice"
                  value={draft.referenceNo}
                  onChange={(event) => patchDraft({ referenceNo: event.target.value })}
                  className={attention.includes("invoiceNumber") ? attentionClass : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inbox-review-date">Invoice date</Label>
                <Input
                  id="inbox-review-date"
                  type="date"
                  value={draft.date}
                  onChange={(event) => patchDraft({ date: event.target.value })}
                  className={attention.includes("invoiceDate") ? attentionClass : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inbox-review-due">Due date</Label>
                <Input
                  id="inbox-review-due"
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => patchDraft({ dueDate: event.target.value })}
                  className={attention.includes("dueDate") ? attentionClass : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inbox-review-subtotal">Subtotal</Label>
                <Input
                  id="inbox-review-subtotal"
                  inputMode="decimal"
                  value={draft.subtotal}
                  onChange={(event) => patchDraft({ subtotal: event.target.value })}
                  className={attention.includes("subtotal") ? attentionClass : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inbox-review-tax">Tax</Label>
                <Input
                  id="inbox-review-tax"
                  inputMode="decimal"
                  value={draft.taxAmount}
                  onChange={(event) => patchDraft({ taxAmount: event.target.value })}
                  className={attention.includes("tax") ? attentionClass : undefined}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--hh-text-primary)]">Lines</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patchDraft({
                      lines: [
                        ...draft.lines,
                        {
                          key: `new-${draft.lines.length}-${Date.now()}`,
                          projectId: "",
                          category: "",
                          amount: "",
                          clientReimbursable: false,
                        },
                      ],
                    })
                  }
                >
                  Add line
                </Button>
              </div>
              {draft.lines.map((line) => (
                <div key={line.key} className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
                    <select
                      aria-label="Project"
                      required
                      value={line.projectId}
                      onChange={(event) => patchLine(line.key, { projectId: event.target.value })}
                      className={fieldClass}
                    >
                      <option value="">Project</option>
                      {initialData.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name || project.id}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Category"
                      required
                      value={line.category}
                      onChange={(event) => patchLine(line.key, { category: event.target.value })}
                      className={fieldClass}
                    >
                      <option value="">Category</option>
                      {initialData.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Amount"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(event) => patchLine(line.key, { amount: event.target.value })}
                      className={attention.includes("total") ? attentionClass : undefined}
                    />
                    {draft.lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          patchDraft({ lines: draft.lines.filter((item) => item.key !== line.key) })
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--hh-text-primary)]">
                    <input
                      type="checkbox"
                      data-testid="inbox-review-reimbursable"
                      checked={line.clientReimbursable}
                      onChange={(event) =>
                        patchLine(line.key, { clientReimbursable: event.target.checked })
                      }
                    />
                    Reimbursable by client
                  </label>
                </div>
              ))}
              <p className="text-sm text-[var(--hh-text-secondary)]">
                Invoice total ${lineTotal.toFixed(2)}. A single line is saved as the header total.
                Split lines must add up to that total.
              </p>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-[var(--hh-text-primary)]">
                Settlement
              </legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settlement"
                  checked={draft.settlement === "unpaid"}
                  onChange={() => patchDraft({ settlement: "unpaid" })}
                />
                Unpaid
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settlement"
                  checked={draft.settlement === "paid"}
                  onChange={() => patchDraft({ settlement: "paid" })}
                />
                Paid
              </label>
              {draft.settlement === "paid" ? (
                <select
                  aria-label="Payment account"
                  required
                  value={draft.paymentAccountId}
                  onChange={(event) => patchDraft({ paymentAccountId: event.target.value })}
                  className={fieldClass}
                >
                  <option value="">Payment account</option>
                  {initialData.paymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </fieldset>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                data-testid="inbox-review-approve"
                disabled={busy === "approve"}
              >
                {busy === "approve" ? "Approving" : "Approve"}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="inbox-review-skip"
                onClick={skip}
              >
                Skip
              </Button>
              <Button
                type="button"
                variant="destructive"
                data-testid="inbox-review-delete"
                ref={deleteFocus}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this invoice?"
        description="The draft and its scan are removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
        returnFocusRef={deleteFocus}
      />
    </div>
  );
}
