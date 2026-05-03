"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InlineLoading } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getExpenseTotal, type Expense, type ExpenseAttachment } from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { inferAttachmentPreviewType } from "@/components/attachment-preview-modal";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import type { PaymentAccountRow } from "@/lib/data";
import { persistLastExpensePaymentAccountId } from "@/lib/expense-payment-preferences";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import type { ExpenseReviewSavePatch } from "./edit-expense-modal";
import { cn } from "@/lib/utils";
import {
  deriveExpenseWorkflowStatus,
  expenseHasCategoryForWorkflow,
  expenseHasProjectForWorkflow,
  expenseNeedsReviewFromDb,
  expenseStatusUiLabel,
  EXPENSE_PROJECT_SELECT_NONE,
  EXPENSE_WORKER_SELECT_NONE,
} from "@/lib/expense-workflow-status";
import { getExpenseReceiptItemsFromParts } from "@/lib/expense-receipt-items";

type ProjectOption = { id: string; name: string | null };
type WorkerOption = { id: string; name: string };

const PAYMENT_METHOD_OPTIONS = ["Amex", "Visa", "Cash", "Company"] as const;

const FIELD_LABEL = "text-xs uppercase tracking-wide text-muted-foreground";
const INPUT_CLASS = "h-10 rounded-sm border-border/60 text-sm max-md:min-h-11 max-md:text-base";
const SELECT_TRIGGER_CLASS =
  "h-10 max-md:min-h-11 max-md:text-base rounded-sm border-border/60 text-sm [&>span]:line-clamp-1";

const selectPopperContentProps = {
  position: "popper" as const,
  sideOffset: 4,
  className: "z-[200] max-h-[min(280px,var(--radix-select-content-available-height))]",
};

export type ExpenseInboxPreviewSavePayload = ExpenseReviewSavePatch & {
  paymentMethod: string;
};

function attachmentIsImage(att: ExpenseAttachment): boolean {
  if (att.mimeType.startsWith("image/")) return true;
  return (
    /\.(jpe?g|png|gif|webp)$/i.test(att.fileName) || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(att.url)
  );
}

function sourceTypeLabel(t: Expense["sourceType"]): string {
  if (t === "reimbursement") return "Reimbursement";
  if (t === "receipt_upload") return "Receipt upload";
  return "Company";
}

function paymentMethodLabel(pm: string | undefined): string {
  const v = (pm ?? "").trim();
  return v !== "" ? v : "—";
}

function projectLabelFromExpense(expense: Expense, projectNameById: Map<string, string>): string {
  const lineIds = expense.lines.map((l) => l.projectId ?? null);
  const headerRaw = expense.headerProjectId ?? null;
  const headerId =
    headerRaw != null && String(headerRaw).trim() !== "" ? String(headerRaw).trim() : null;
  const distinct = new Set<string>();
  for (const id of lineIds) {
    if (id != null && String(id).trim() !== "") distinct.add(String(id));
  }
  if (headerId) distinct.add(headerId);
  if (distinct.size === 0) {
    if (expense.lines.length === 0) return "—";
    return "Overhead";
  }
  if (distinct.size === 1) {
    const id = [...distinct][0]!;
    return projectNameById.get(id) ?? id;
  }
  return "Multiple";
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className={cn(FIELD_LABEL, "border-b border-border/60 pb-2 font-medium")}>{title}</h3>
      {children}
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className={FIELD_LABEL}>{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

type Props = {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When dialog opens, start in this mode. */
  enterMode?: "preview" | "edit";
  projects: ProjectOption[];
  workers: WorkerOption[];
  projectNameById: Map<string, string>;
  supabase: SupabaseClient | null;
  setCategoriesList: React.Dispatch<React.SetStateAction<string[]>>;
  onSave: (payload: ExpenseInboxPreviewSavePayload) => Promise<Expense | null>;
  onMarkReviewed: (expense: Expense) => Promise<void>;
  /** Navigate within current inbox page without closing the dialog. */
  previewNav?: {
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
  /** Hint only: possible duplicate among loaded inbox rows. */
  possibleDuplicate?: boolean;
};

export function ExpenseInboxPreviewModal({
  expense,
  open,
  onOpenChange,
  enterMode = "preview",
  projects,
  workers,
  projectNameById,
  supabase,
  setCategoriesList,
  onSave,
  onMarkReviewed,
  previewNav,
  possibleDuplicate = false,
}: Props) {
  const { toast } = useToast();
  const { openPreview } = useAttachmentPreview();
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [markBusy, setMarkBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [vendorName, setVendorName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [workerId, setWorkerId] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState("Other");
  const [notes, setNotes] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState("");
  const [sourceType, setSourceType] = React.useState<Expense["sourceType"]>("company");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [paymentAccountsLocal, setPaymentAccountsLocal] = React.useState<PaymentAccountRow[]>([]);
  const [attachments, setAttachments] = React.useState<ExpenseAttachment[]>([]);
  const [thumbById, setThumbById] = React.useState<Record<string, string | null>>({});

  const prevOpenRef = React.useRef(false);
  const prevExpenseIdRef = React.useRef<string | null>(null);
  const expenseId = expense?.id ?? null;
  React.useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      setMode(enterMode);
    }
    if (!open) {
      setMode("preview");
      prevExpenseIdRef.current = null;
    }
  }, [open, enterMode]);

  React.useEffect(() => {
    if (!open || !expenseId) return;
    const prevId = prevExpenseIdRef.current;
    if (prevId !== null && prevId !== expenseId) {
      setMode("preview");
    }
    prevExpenseIdRef.current = expenseId;
  }, [open, expenseId]);

  React.useEffect(() => {
    if (!expense) return;
    setVendorName(expense.vendorName ?? "");
    setAmount(String(getExpenseTotal(expense)));
    setProjectId(expense.lines[0]?.projectId ?? expense.headerProjectId ?? null);
    setWorkerId(expense.workerId ?? null);
    setCategory(expense.lines[0]?.category ?? "Other");
    setNotes(expense.notes ?? "");
    setExpenseDate((expense.date ?? "").slice(0, 10));
    setSourceType(expense.sourceType ?? "company");
    setPaymentMethod((expense.paymentMethod ?? "").trim() || PAYMENT_METHOD_OPTIONS[0]);
    setPaymentAccountId(expense.paymentAccountId ?? "");
    setAttachments(expense.attachments ?? []);
  }, [expense]);

  React.useEffect(() => {
    if (!open || !supabase || attachments.length === 0) {
      setThumbById({});
      return;
    }
    let alive = true;
    void (async () => {
      const next: Record<string, string | null> = {};
      for (const att of attachments) {
        if (!attachmentIsImage(att)) {
          next[att.id] = null;
          continue;
        }
        const raw = (att.url ?? "").trim();
        if (!raw) {
          next[att.id] = null;
          continue;
        }
        const signed = await resolvePreviewSignedUrl({
          supabase,
          rawUrlOrPath: raw,
          ttlSec: 3600,
          bucketCandidates: ["expense-attachments", "receipts"],
        });
        next[att.id] = signed || null;
      }
      if (alive) setThumbById(next);
    })();
    return () => {
      alive = false;
    };
  }, [open, supabase, attachments]);

  const resolvePreviewUrl = React.useCallback(
    async (att: ExpenseAttachment): Promise<string> => {
      const raw = (att.url ?? "").trim();
      if (!raw || !supabase) return "";
      return await resolvePreviewSignedUrl({
        supabase,
        rawUrlOrPath: raw,
        ttlSec: 3600,
        bucketCandidates: ["expense-attachments", "receipts"],
      });
    },
    [supabase]
  );

  const openAttachmentPreview = React.useCallback(
    async (att: ExpenseAttachment) => {
      const url = await resolvePreviewUrl(att);
      if (!url) {
        toast({
          title: "Preview unavailable",
          description: "Could not load file URL.",
          variant: "error",
        });
        return;
      }
      openPreview({
        url,
        fileName: att.fileName || "Attachment",
        fileType: inferAttachmentPreviewType(att.fileName, url),
      });
    },
    [resolvePreviewUrl, toast, openPreview]
  );

  const receiptItems = React.useMemo(() => {
    if (!expense) return [];
    return getExpenseReceiptItemsFromParts({
      receiptUrl: expense.receiptUrl,
      attachments,
    });
  }, [expense, attachments]);

  const openReceiptItemPreview = React.useCallback(
    async (item: { url: string; fileName: string }) => {
      const raw = item.url.trim();
      if (!raw) return;
      if (!supabase) {
        toast({
          title: "Preview unavailable",
          description: "Supabase is not configured.",
          variant: "error",
        });
        return;
      }
      const url = await resolvePreviewSignedUrl({
        supabase,
        rawUrlOrPath: raw,
        ttlSec: 3600,
        bucketCandidates: ["expense-attachments", "receipts"],
      });
      if (!url) {
        toast({
          title: "Preview unavailable",
          description: "Could not load file URL.",
          variant: "error",
        });
        return;
      }
      openPreview({
        url,
        fileName: item.fileName,
        fileType: inferAttachmentPreviewType(item.fileName, url),
      });
    },
    [supabase, toast, openPreview]
  );

  const handleSave = async () => {
    if (!expense || saving) return;
    const numAmount = parseFloat(amount);
    if (Number.isNaN(numAmount) || numAmount < 0) {
      toast({ title: "Invalid amount", variant: "error" });
      return;
    }
    flushSync(() => setSaving(true));
    try {
      const paId = paymentAccountId.trim() || null;
      const paName = paId
        ? (paymentAccountsLocal.find((a) => a.id === paId)?.name ??
          expense.paymentAccountName ??
          null)
        : null;
      const pm = paymentMethod.trim() || PAYMENT_METHOD_OPTIONS[0];
      const workflowStatus = deriveExpenseWorkflowStatus(projectId, category || "Other");
      const saved = await onSave({
        expenseId: expense.id,
        date: expenseDate.slice(0, 10),
        vendorName: vendorName.trim(),
        amount: numAmount,
        projectId: projectId || null,
        workerId: workerId || null,
        category: category || "Other",
        notes: notes.trim() || undefined,
        status: workflowStatus,
        sourceType,
        paymentAccountId: paId,
        paymentAccountName: paName,
        paymentMethod: pm,
      });
      if (saved) {
        setMode("preview");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
    if (!expense || markBusy) return;
    flushSync(() => setMarkBusy(true));
    try {
      await onMarkReviewed(expense);
    } finally {
      setMarkBusy(false);
    }
  };

  const cancelEdit = () => {
    if (!expense) return;
    setVendorName(expense.vendorName ?? "");
    setAmount(String(getExpenseTotal(expense)));
    setProjectId(expense.lines[0]?.projectId ?? expense.headerProjectId ?? null);
    setWorkerId(expense.workerId ?? null);
    setCategory(expense.lines[0]?.category ?? "Other");
    setNotes(expense.notes ?? "");
    setExpenseDate((expense.date ?? "").slice(0, 10));
    setSourceType(expense.sourceType ?? "company");
    setPaymentMethod((expense.paymentMethod ?? "").trim() || PAYMENT_METHOD_OPTIONS[0]);
    setPaymentAccountId(expense.paymentAccountId ?? "");
    setAttachments(expense.attachments ?? []);
    setMode("preview");
  };

  if (!expense) return null;

  const showMarkDone = expenseNeedsReviewFromDb(expense.status);
  const missingProject = !expenseHasProjectForWorkflow(expense);
  const missingCategory = !expenseHasCategoryForWorkflow(expense);
  const missingReceipt = receiptItems.length === 0;

  const projectRadixValue =
    projectId && String(projectId).trim() !== "" ? projectId : EXPENSE_PROJECT_SELECT_NONE;
  const workerRadixValue =
    workerId && String(workerId).trim() !== "" ? workerId : EXPENSE_WORKER_SELECT_NONE;
  const pmInList = (PAYMENT_METHOD_OPTIONS as readonly string[]).includes(paymentMethod);
  const paymentMethodRadixValue =
    pmInList || !paymentMethod.trim()
      ? paymentMethod.trim() || PAYMENT_METHOD_OPTIONS[0]
      : paymentMethod;

  const previewDivide = "divide-y divide-border/60";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="expenses-ui-dialog flex max-h-[min(92vh,820px)] w-full max-w-[560px] flex-col gap-0 overflow-hidden border-border/60 p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-foreground">
            {mode === "preview" ? "Expense" : "Edit expense"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {mode === "preview" ? (
            <div className="space-y-6">
              {possibleDuplicate ? (
                <p
                  className="rounded-sm border border-amber-200/70 bg-amber-50/80 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-50"
                  role="status"
                >
                  This transaction may be a duplicate.
                </p>
              ) : null}
              {(missingProject || missingCategory || missingReceipt) && (
                <div className="flex flex-wrap gap-1">
                  {missingProject ? (
                    <span className="rounded-sm border border-amber-200/80 bg-amber-50/80 px-1.5 py-0.5 text-[11px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-50">
                      Missing project
                    </span>
                  ) : null}
                  {missingCategory ? (
                    <span className="rounded-sm border border-amber-200/80 bg-amber-50/80 px-1.5 py-0.5 text-[11px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-50">
                      Missing category
                    </span>
                  ) : null}
                  {missingReceipt ? (
                    <span className="rounded-sm border border-amber-200/80 bg-amber-50/80 px-1.5 py-0.5 text-[11px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-50">
                      Missing receipt
                    </span>
                  ) : null}
                </div>
              )}
              <ModalSection title="Basic info">
                <div className={previewDivide}>
                  <PreviewRow label="Vendor">
                    {(expense.vendorName ?? "").trim() !== "" ? expense.vendorName : "Needs Review"}
                  </PreviewRow>
                  <PreviewRow label="Amount">
                    <span className="tabular-nums font-medium text-[#d92d20] dark:text-red-400">
                      −$
                      {getExpenseTotal(expense).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </PreviewRow>
                  <PreviewRow label="Date">{(expense.date ?? "—").slice(0, 10)}</PreviewRow>
                  <PreviewRow label="Notes">
                    {(expense.notes ?? "").trim() !== "" ? expense.notes : "—"}
                  </PreviewRow>
                </div>
              </ModalSection>

              <ModalSection title="Classification">
                <div className={previewDivide}>
                  <PreviewRow label="Project">
                    {projectLabelFromExpense(expense, projectNameById)}
                  </PreviewRow>
                  <PreviewRow label="Category">
                    {expense.lines[0]?.category?.trim() ? expense.lines[0].category : "—"}
                  </PreviewRow>
                  <PreviewRow label="Worker">
                    {expense.workerId
                      ? (workers.find((w) => w.id === expense.workerId)?.name ?? expense.workerId)
                      : "—"}
                  </PreviewRow>
                  <PreviewRow label="Payment source">
                    {sourceTypeLabel(expense.sourceType)}
                  </PreviewRow>
                  <PreviewRow label="Status">{expenseStatusUiLabel(expense.status)}</PreviewRow>
                </div>
              </ModalSection>

              <ModalSection title="Payment">
                <div className={previewDivide}>
                  <PreviewRow label="Payment method">
                    {paymentMethodLabel(expense.paymentMethod)}
                  </PreviewRow>
                  <PreviewRow label="Payment account">
                    {expense.paymentAccountName?.trim() || "—"}
                  </PreviewRow>
                </div>
              </ModalSection>

              <ModalSection title="Attachments">
                <div className="pt-1">
                  {receiptItems.length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1">
                      {receiptItems.map((item, idx) => (
                        <li key={`${item.url}-${idx}`}>
                          <button
                            type="button"
                            className="text-left text-sm text-foreground underline-offset-2 hover:underline"
                            onClick={() => void openReceiptItemPreview(item)}
                          >
                            {item.fileName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </ModalSection>
            </div>
          ) : (
            <div className="space-y-6">
              <ModalSection title="Basic info">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={FIELD_LABEL}>Vendor</label>
                    <Input
                      data-testid="edit-expense-vendor-input"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className={INPUT_CLASS}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Amount</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={cn(INPUT_CLASS, "tabular-nums")}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Date</label>
                    <Input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className={INPUT_CLASS}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={FIELD_LABEL}>Notes</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={cn(INPUT_CLASS, "min-h-[88px] resize-y py-2")}
                      placeholder="Optional"
                      disabled={saving}
                      rows={3}
                    />
                  </div>
                </div>
              </ModalSection>

              <ModalSection title="Classification">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Project</label>
                    <Select
                      value={projectRadixValue}
                      disabled={saving}
                      onValueChange={(v) =>
                        setProjectId(v === EXPENSE_PROJECT_SELECT_NONE ? null : v)
                      }
                    >
                      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        <SelectItem value={EXPENSE_PROJECT_SELECT_NONE}>Overhead</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name ?? p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Category</label>
                    <ExpenseCategorySelect
                      value={category}
                      onValueChange={setCategory}
                      disabled={saving}
                      onCategoriesUpdated={(names) => setCategoriesList(names)}
                      className={SELECT_TRIGGER_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Worker</label>
                    <Select
                      value={workerRadixValue}
                      disabled={saving}
                      onValueChange={(v) =>
                        setWorkerId(v === EXPENSE_WORKER_SELECT_NONE ? null : v)
                      }
                    >
                      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                        <SelectValue placeholder="Worker" />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        <SelectItem value={EXPENSE_WORKER_SELECT_NONE}>—</SelectItem>
                        {workers.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Payment source</label>
                    <Select
                      value={sourceType ?? "company"}
                      disabled={saving}
                      onValueChange={(v) => setSourceType(v as NonNullable<Expense["sourceType"]>)}
                    >
                      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="receipt_upload">Receipt upload</SelectItem>
                        <SelectItem value="reimbursement">Reimbursement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </ModalSection>

              <ModalSection title="Payment">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Payment method</label>
                    <Select
                      value={paymentMethodRadixValue}
                      disabled={saving}
                      onValueChange={(v) => setPaymentMethod(v)}
                    >
                      <SelectTrigger
                        id="edit-expense-payment-method-select"
                        className={SELECT_TRIGGER_CLASS}
                      >
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        {!pmInList && paymentMethod.trim() ? (
                          <SelectItem value={paymentMethod}>{paymentMethod}</SelectItem>
                        ) : null}
                        {PAYMENT_METHOD_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Payment account</label>
                    <PaymentAccountSelect
                      id="edit-expense-payment-select"
                      value={paymentAccountId}
                      fallbackDisplayName={expense.paymentAccountName ?? undefined}
                      onValueChange={(id) => {
                        setPaymentAccountId(id);
                        persistLastExpensePaymentAccountId(id);
                      }}
                      disabled={saving}
                      onAccountsUpdated={setPaymentAccountsLocal}
                      className={SELECT_TRIGGER_CLASS}
                    />
                  </div>
                </div>
              </ModalSection>

              <ModalSection title="Attachments">
                {!supabase || attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {attachments.length === 0
                      ? "No attachments."
                      : "Configure Supabase to preview."}
                  </p>
                ) : (
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {attachments.map((att) => {
                      const thumb = thumbById[att.id];
                      const isPdf = !attachmentIsImage(att);
                      return (
                        <li
                          key={att.id}
                          className="flex items-center gap-2 border-b border-border/40 py-2 last:border-0"
                        >
                          <button
                            type="button"
                            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/60"
                            onClick={() => void openAttachmentPreview(att)}
                            aria-label="Preview"
                          >
                            {isPdf ? (
                              <span className="text-[10px] font-medium text-muted-foreground">
                                PDF
                              </span>
                            ) : thumb ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={thumb} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <InlineLoading className="h-4 w-4" size="md" />
                            )}
                          </button>
                          <span className="min-w-0 flex-1 truncate text-sm">{att.fileName}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 px-2 text-xs"
                            onClick={() => void openAttachmentPreview(att)}
                          >
                            View
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ModalSection>
            </div>
          )}
        </div>

        {mode === "preview" ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {previewNav ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-sm"
                    disabled={!previewNav.canPrev}
                    onClick={() => previewNav.onPrev()}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-sm"
                    disabled={!previewNav.canNext}
                    onClick={() => previewNav.onNext()}
                  >
                    Next
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-sm"
                onClick={() => setMode("edit")}
              >
                Edit
              </Button>
              {showMarkDone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-sm"
                  disabled={markBusy}
                  onClick={() => void handleMarkReviewed()}
                >
                  <SubmitSpinner loading={markBusy} className="mr-2" />
                  Mark Done
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-sm"
              disabled={saving}
              onClick={cancelEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-10 rounded-sm bg-black px-5 text-white hover:bg-neutral-900 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
