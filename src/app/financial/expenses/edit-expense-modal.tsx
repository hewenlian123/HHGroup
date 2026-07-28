"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteExpenseAttachment,
  getExpenseTotal,
  type Expense,
  type ExpenseAttachment,
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import {
  eventTargetsAttachmentPreviewModal,
  inferAttachmentPreviewType,
} from "@/components/attachment-preview-modal";
import {
  useAttachmentPreview,
  type AttachmentPreviewFileItem,
} from "@/contexts/attachment-preview-context";
import {
  getExpenseDisplayAttachments,
  getExpenseReceiptItemsFromParts,
  isExpenseReceiptUrlAttachmentId,
  type ExpenseReceiptItem,
} from "@/lib/expense-receipt-items";
import {
  fetchExpenseReceiptManifest,
  receiptApiItemToExpenseReceiptItem,
  type ExpenseReceiptApiItem,
} from "@/lib/expense-receipt-api-client";
import {
  dedupeExpenseAttachmentsByStorageKey,
  expenseAttachmentStorageDedupeKey,
} from "@/lib/expense-attachment-dedupe";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { ExpensePaymentMethodSelect } from "@/components/expense-payment-method-select";
import { ExpensePaymentSourceSelect } from "@/components/expense-payment-source-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { ExpenseDatePicker } from "@/components/expense-date-picker";
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
import { ExpenseSubcontractDeductionFields } from "@/components/expense-subcontract-deduction-fields";
import type { PaymentAccountRow } from "@/lib/data";
import type { SubcontractDeductionOption } from "@/lib/data";
import { persistLastExpensePaymentAccountId } from "@/lib/expense-payment-preferences";
import {
  deriveExpenseWorkflowStatus,
  expenseCostAllocationFromProjectId,
  expenseCostAllocationRequiresProject,
  expenseNeedsReviewFromDb,
  expenseSourceTypeIsWorkerReimbursement,
  expenseStatusUiLabel,
  preserveConfirmedExpenseStatusOnCompleteSave,
  EXPENSE_COST_ALLOCATION_OVERHEAD,
  EXPENSE_COST_ALLOCATION_PROJECT_COST,
  EXPENSE_PROJECT_SELECT_NONE,
  EXPENSE_WORKER_SELECT_NONE,
  type ExpenseCostAllocation,
} from "@/lib/expense-workflow-status";
import { defaultPaymentMethodName } from "@/lib/expense-options-db";
import { cn } from "@/lib/utils";
import { stripInboxUploadNoiseFromText } from "@/lib/inbox-upload-constants";
import { ExpenseEditAttachmentsSection } from "./expense-edit-attachments-section";

function attachmentIsImage(att: ExpenseAttachment): boolean {
  if (att.mimeType.startsWith("image/")) return true;
  return (
    /\.(jpe?g|png|gif|webp)$/i.test(att.fileName) || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(att.url)
  );
}

type ReceiptPreviewItem = ExpenseReceiptItem & { attachmentId?: string };

function secureReceiptItemsWithAttachmentIds(items: ExpenseReceiptApiItem[]): ReceiptPreviewItem[] {
  return items.map((item) => {
    const receipt = receiptApiItemToExpenseReceiptItem(item);
    const sourceId = /^(?:attachment|expense_attachment)\.([0-9a-f-]{36})$/i.exec(item.id)?.[1];
    return { ...receipt, attachmentId: sourceId };
  });
}

function receiptItemsToPreviewFiles(items: ReceiptPreviewItem[]): AttachmentPreviewFileItem[] {
  return items.map((it, i) => ({
    url: /^https?:\/\//i.test((it.url ?? "").trim()) ? (it.url ?? "").trim() : "",
    fileName: it.fileName ?? `File ${i + 1}`,
    fileType: inferAttachmentPreviewType(it.fileName ?? "", it.url ?? ""),
    attachmentId: it.attachmentId,
  }));
}

type ProjectOption = { id: string; name: string | null };
type WorkerOption = { id: string; name: string };

const FIELD_LABEL = "text-xs uppercase tracking-wide text-muted-foreground";
const INPUT_ROW = "h-10 rounded-sm border-border/60 text-sm";
const SELECT_TRIGGER = "h-10 rounded-sm border-border/60 text-sm [&>span]:line-clamp-1";

export type ExpenseReviewSavePatch = {
  expenseId: string;
  date: string;
  vendorName: string;
  amount: number;
  projectId: string | null;
  workerId: string | null;
  category: string;
  notes: string | undefined;
  status: NonNullable<Expense["status"]>;
  sourceType: Expense["sourceType"];
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  paymentMethod: string;
  subcontractDeduction?: {
    enabled: boolean;
    subcontractId: string | null;
    subcontractorId: string | null;
    projectId: string | null;
    amount: number;
    note?: string | null;
  } | null;
};

type Props = {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  workers: WorkerOption[];
  subcontractDeductionOptions?: SubcontractDeductionOption[];
  supabase: SupabaseClient | null;
  /** After add/remove attachment (not receipt_url). */
  onExpenseAttachmentsUpdated?: (expense: Expense) => void;
  /** Sync: parent applies optimistic UI + background persist. */
  onSave: (patch: ExpenseReviewSavePatch) => void;
};

export function EditExpenseModal({
  expense,
  open,
  onOpenChange,
  projects,
  workers,
  subcontractDeductionOptions = [],
  supabase,
  onExpenseAttachmentsUpdated,
  onSave,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [vendorName, setVendorName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [costAllocation, setCostAllocation] = React.useState<ExpenseCostAllocation>(
    EXPENSE_COST_ALLOCATION_OVERHEAD
  );
  const [workerId, setWorkerId] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState("Other");
  const [notes, setNotes] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState("");
  const [sourceType, setSourceType] = React.useState<Expense["sourceType"]>("company");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [paymentAccountsLocal, setPaymentAccountsLocal] = React.useState<PaymentAccountRow[]>([]);
  const [deductFromSubcontractor, setDeductFromSubcontractor] = React.useState(false);
  const [deductionSubcontractId, setDeductionSubcontractId] = React.useState("");
  const [deductionAmount, setDeductionAmount] = React.useState("");
  const [deductionNote, setDeductionNote] = React.useState("");
  const [attachments, setAttachments] = React.useState<ExpenseAttachment[]>([]);
  const [thumbById, setThumbById] = React.useState<Record<string, string | null>>({});
  const { openPreview, patchPreview, closePreview } = useAttachmentPreview();
  const patchPreviewRef = React.useRef(patchPreview);
  const closePreviewRef = React.useRef(closePreview);
  patchPreviewRef.current = patchPreview;
  closePreviewRef.current = closePreview;
  const editPreviewSessionRef = React.useRef(0);
  const editPreviewIndexRef = React.useRef(0);
  const expensePreviewRef = React.useRef(expense);
  React.useEffect(() => {
    if (!expense) return;
    const refE = expensePreviewRef.current;
    const propN = expense.attachments?.length ?? 0;
    const refN = refE?.attachments?.length ?? 0;
    if (refE?.id === expense.id && propN > refN) {
      return;
    }
    expensePreviewRef.current = expense;
  }, [expense]);

  React.useEffect(() => {
    if (expense) {
      setVendorName(expense.vendorName ?? "");
      setAmount(String(getExpenseTotal(expense)));
      const nextProjectId = expense.lines[0]?.projectId ?? expense.headerProjectId ?? null;
      setProjectId(nextProjectId);
      setCostAllocation(expenseCostAllocationFromProjectId(nextProjectId));
      setWorkerId(expense.workerId ?? null);
      setCategory(expense.lines[0]?.category ?? "Other");
      setNotes(stripInboxUploadNoiseFromText(expense.notes ?? ""));
      setExpenseDate((expense.date ?? "").slice(0, 10));
      setSourceType(expense.sourceType ?? "company");
      setPaymentMethod((expense.paymentMethod ?? "").trim());
      setPaymentAccountId(expense.paymentAccountId ?? "");
      const deduction = expense.subcontractDeduction;
      setDeductFromSubcontractor(Boolean(deduction));
      setDeductionSubcontractId(deduction?.subcontract_id ?? "");
      setDeductionAmount(deduction ? String(deduction.amount) : "");
      setDeductionNote(deduction?.note ?? "");
      setAttachments(getExpenseDisplayAttachments(expense));
    }
  }, [expense]);

  React.useEffect(() => {
    if (!deductFromSubcontractor) return;
    if (deductionAmount.trim()) return;
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) setDeductionAmount(String(Math.round(n * 100) / 100));
  }, [amount, deductFromSubcontractor, deductionAmount]);

  React.useEffect(() => {
    if (!expense || !open) return;
    const pm = (expense.paymentMethod ?? "").trim();
    if (pm) return;
    let cancelled = false;
    void defaultPaymentMethodName().then((d) => {
      if (!cancelled && d) setPaymentMethod(d);
    });
    return () => {
      cancelled = true;
    };
  }, [expense, open]);

  React.useEffect(() => {
    if (!open || !expense || attachments.length === 0) {
      setThumbById({});
      return;
    }
    let alive = true;
    const rawItems = getExpenseReceiptItemsFromParts({
      receiptUrl: expense.receiptUrl,
      attachments,
    });
    void fetchExpenseReceiptManifest(expense.id)
      .then((manifest) => {
        if (!alive) return;
        const secure = secureReceiptItemsWithAttachmentIds(manifest.items);
        const next: Record<string, string | null> = {};
        for (const attachment of attachments) {
          if (!attachmentIsImage(attachment)) {
            next[attachment.id] = null;
            continue;
          }
          const index = rawItems.findIndex(
            (item) =>
              expenseAttachmentStorageDedupeKey(item.url) ===
              expenseAttachmentStorageDedupeKey(attachment.url)
          );
          next[attachment.id] = index >= 0 ? (secure[index]?.url ?? null) : null;
        }
        setThumbById(next);
      })
      .catch(() => {
        if (alive) setThumbById({});
      });
    return () => {
      alive = false;
    };
  }, [attachments, expense, open]);

  const openAttachmentPreview = React.useCallback(
    async (att: ExpenseAttachment) => {
      const ex = expense;
      if (!ex) return;
      const deduped = dedupeExpenseAttachmentsByStorageKey(attachments);
      const rawItems = getExpenseReceiptItemsFromParts({
        receiptUrl: ex.receiptUrl,
        attachments: deduped,
      });
      if (rawItems.length === 0) {
        toast({
          title: "Nothing to preview",
          description: "This expense has no receipt or attachment files yet.",
          variant: "default",
        });
        return;
      }
      const initialIndex = Math.max(
        0,
        rawItems.findIndex(
          (x) =>
            expenseAttachmentStorageDedupeKey(x.url) === expenseAttachmentStorageDedupeKey(att.url)
        )
      );
      const session = ++editPreviewSessionRef.current;
      editPreviewIndexRef.current = initialIndex;
      let secureItems: ReceiptPreviewItem[];
      try {
        const manifest = await fetchExpenseReceiptManifest(ex.id);
        secureItems = secureReceiptItemsWithAttachmentIds(manifest.items);
      } catch {
        toast({
          title: "Preview unavailable",
          description: "The receipt could not be loaded securely.",
          variant: "error",
        });
        return;
      }

      openPreview({
        files: receiptItemsToPreviewFiles(secureItems),
        initialIndex,
        isLoading: false,
        onIndexChange: (i) => {
          editPreviewIndexRef.current = i;
        },
        onRefreshPreviewUrl: async () => {
          if (editPreviewSessionRef.current !== session) return null;
          const ex2 = expensePreviewRef.current;
          if (!ex2) return null;
          const manifest = await fetchExpenseReceiptManifest(ex2.id);
          const resolved = secureReceiptItemsWithAttachmentIds(manifest.items);
          patchPreviewRef.current({
            files: receiptItemsToPreviewFiles(resolved),
          });
          const idx = editPreviewIndexRef.current;
          return (resolved[idx]?.url ?? "").trim() || null;
        },
        onDeleteCurrent: async (attachmentId) => {
          if (isExpenseReceiptUrlAttachmentId(attachmentId)) return;
          const ex3 = expensePreviewRef.current;
          if (!ex3) return;
          const nextExp = await deleteExpenseAttachment(ex3.id, attachmentId);
          if (!nextExp) return;
          const nextAtts = getExpenseDisplayAttachments(nextExp);
          setAttachments(nextAtts);
          onExpenseAttachmentsUpdated?.(nextExp);
          expensePreviewRef.current = nextExp;
          if (
            getExpenseReceiptItemsFromParts({
              receiptUrl: nextExp.receiptUrl,
              attachments: nextAtts,
            }).length === 0
          ) {
            closePreviewRef.current();
            return;
          }
          const manifest = await fetchExpenseReceiptManifest(nextExp.id);
          const resolved3 = secureReceiptItemsWithAttachmentIds(manifest.items);
          patchPreviewRef.current({ files: receiptItemsToPreviewFiles(resolved3) });
        },
      });
    },
    [attachments, expense, onExpenseAttachmentsUpdated, openPreview, toast]
  );

  const handleSave = () => {
    if (!expense || saving) return;
    const numAmount = parseFloat(amount);
    if (Number.isNaN(numAmount) || numAmount < 0) {
      toast({ title: "Invalid amount", variant: "error" });
      return;
    }
    if (expenseCostAllocationRequiresProject(costAllocation) && !projectId) {
      toast({
        title: "Missing project",
        description:
          "Project Cost expenses must be assigned to a project. Choose Overhead only for company expenses.",
        variant: "error",
      });
      return;
    }
    if (expenseSourceTypeIsWorkerReimbursement(sourceType) && !workerId) {
      toast({
        title: "Missing worker",
        description: "Worker reimbursement expenses must be assigned to a worker.",
        variant: "error",
      });
      return;
    }
    const selectedDeductionOption = subcontractDeductionOptions.find(
      (option) => option.subcontractId === deductionSubcontractId
    );
    const deductionAmountValue = Number(deductionAmount);
    if (deductFromSubcontractor) {
      if (!projectId) {
        toast({
          title: "Missing project",
          description: "A subcontractor deduction must be tied to a project expense.",
          variant: "error",
        });
        return;
      }
      if (!selectedDeductionOption) {
        toast({
          title: "Missing subcontractor",
          description: "Choose which subcontractor payable this expense should reduce.",
          variant: "error",
        });
        return;
      }
      if (!Number.isFinite(deductionAmountValue) || deductionAmountValue <= 0) {
        toast({
          title: "Invalid deduction",
          description: "Deduction amount must be greater than 0.",
          variant: "error",
        });
        return;
      }
    }
    flushSync(() => setSaving(true));
    void (async () => {
      try {
        const paId = paymentAccountId.trim() || null;
        const paName = paId
          ? (paymentAccountsLocal.find((a) => a.id === paId)?.name ??
            expense.paymentAccountName ??
            null)
          : null;
        const pm =
          paymentMethod.trim() ||
          (await defaultPaymentMethodName()) ||
          (expense.paymentMethod ?? "").trim() ||
          "Cash";
        const workflowStatus = preserveConfirmedExpenseStatusOnCompleteSave(
          expense.status,
          deriveExpenseWorkflowStatus(projectId, category || "Other", costAllocation)
        );
        onSave({
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
          subcontractDeduction: deductFromSubcontractor
            ? {
                enabled: true,
                subcontractId: selectedDeductionOption?.subcontractId ?? null,
                subcontractorId: selectedDeductionOption?.subcontractorId ?? null,
                projectId: projectId || null,
                amount: deductionAmountValue,
                note: deductionNote.trim() || null,
              }
            : null,
        });
      } finally {
        flushSync(() => setSaving(false));
      }
    })();
  };

  const projectRadixValue =
    projectId && String(projectId).trim() !== "" ? projectId : EXPENSE_PROJECT_SELECT_NONE;
  const workerRadixValue =
    workerId && String(workerId).trim() !== "" ? workerId : EXPENSE_WORKER_SELECT_NONE;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onPointerDownOutside={(e) => {
            if (eventTargetsAttachmentPreviewModal(e)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (eventTargetsAttachmentPreviewModal(e)) e.preventDefault();
          }}
          className="expenses-ui-dialog flex max-h-[min(92vh,820px)] w-full max-w-[560px] flex-col gap-0 overflow-hidden border-border/60 p-0"
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Edit expense
            </DialogTitle>
          </DialogHeader>
          {expense ? (
            <>
              <div className="max-h-[min(88vh,680px)] min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className={FIELD_LABEL}>Vendor</label>
                    <Input
                      data-testid="edit-expense-vendor-input"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className={INPUT_ROW}
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
                      className={cn(INPUT_ROW, "tabular-nums")}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Date</label>
                    <ExpenseDatePicker
                      id="edit-expense-date"
                      value={expenseDate}
                      onChange={setExpenseDate}
                      className={INPUT_ROW}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Classification</label>
                    <ExpenseSearchableSelect
                      id="edit-expense-cost-allocation-select"
                      value={costAllocation}
                      disabled={saving}
                      className={SELECT_TRIGGER}
                      placeholder="Classification"
                      searchPlaceholder="Search classification…"
                      emptyText="No matching classifications"
                      options={[
                        {
                          value: EXPENSE_COST_ALLOCATION_OVERHEAD,
                          label: "Overhead",
                          searchText: "company overhead",
                        },
                        {
                          value: EXPENSE_COST_ALLOCATION_PROJECT_COST,
                          label: "Project Cost",
                          searchText: "project cost",
                        },
                      ]}
                      onValueChange={(v) => {
                        const next = v as ExpenseCostAllocation;
                        setCostAllocation(next);
                        if (next === EXPENSE_COST_ALLOCATION_OVERHEAD) setProjectId(null);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Project</label>
                    <ExpenseSearchableSelect
                      id="edit-expense-project-select"
                      value={projectRadixValue}
                      disabled={saving}
                      className={SELECT_TRIGGER}
                      placeholder="Project"
                      searchPlaceholder="Search projects…"
                      emptyText="No matching projects"
                      options={[
                        {
                          value: EXPENSE_PROJECT_SELECT_NONE,
                          label: "Overhead",
                          searchText: "no project overhead unassigned",
                        },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: p.name ?? p.id,
                          searchText: p.id,
                        })),
                      ]}
                      onValueChange={(v) => {
                        if (v === EXPENSE_PROJECT_SELECT_NONE) {
                          setProjectId(null);
                        } else {
                          setProjectId(v);
                          setCostAllocation(EXPENSE_COST_ALLOCATION_PROJECT_COST);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className={FIELD_LABEL}>Category</label>
                      <Link
                        href="/settings/expenses"
                        className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                    <ExpenseCategorySelect
                      id="edit-expense-category-select"
                      value={category}
                      onValueChange={setCategory}
                      disabled={saving}
                      className={SELECT_TRIGGER}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className={FIELD_LABEL}>Payment method</label>
                      <Link
                        href="/settings/expenses"
                        className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                    <ExpensePaymentMethodSelect
                      id="edit-expense-payment-method-select"
                      value={paymentMethod}
                      onValueChange={setPaymentMethod}
                      disabled={saving}
                      className={SELECT_TRIGGER}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className={FIELD_LABEL}>Payment account</label>
                      <Link
                        href="/settings/expenses"
                        className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                    <PaymentAccountSelect
                      id="edit-expense-payment-select"
                      value={paymentAccountId}
                      onValueChange={(id) => {
                        setPaymentAccountId(id);
                        persistLastExpensePaymentAccountId(id);
                      }}
                      disabled={saving}
                      onAccountsUpdated={setPaymentAccountsLocal}
                      className={SELECT_TRIGGER}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Worker</label>
                    <ExpenseSearchableSelect
                      id="edit-expense-worker-select"
                      value={workerRadixValue}
                      disabled={saving}
                      className={SELECT_TRIGGER}
                      placeholder="Worker"
                      searchPlaceholder="Search workers…"
                      emptyText="No matching workers"
                      options={[
                        {
                          value: EXPENSE_WORKER_SELECT_NONE,
                          label: "—",
                          searchText: "none no worker",
                        },
                        ...workers.map((w) => ({
                          value: w.id,
                          label: w.name,
                          searchText: w.id,
                        })),
                      ]}
                      onValueChange={(v) =>
                        setWorkerId(v === EXPENSE_WORKER_SELECT_NONE ? null : v)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className={FIELD_LABEL}>Payment source</label>
                      <Link
                        href="/settings/expenses"
                        className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                    <ExpensePaymentSourceSelect
                      value={(sourceType ?? "company") as NonNullable<Expense["sourceType"]>}
                      onValueChange={(v) => setSourceType(v)}
                      disabled={saving}
                      id="edit-expense-payment-source-select"
                      className={SELECT_TRIGGER}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={FIELD_LABEL}>Status</label>
                    <Badge
                      variant="outline"
                      className="flex h-10 w-full items-center justify-start gap-2 rounded-sm border-border/60 px-3 py-0 text-sm font-normal"
                    >
                      {(() => {
                        const w = deriveExpenseWorkflowStatus(projectId, category, costAllocation);
                        return (
                          <>
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                expenseNeedsReviewFromDb(w) ? "bg-orange-500" : "bg-green-500"
                              )}
                              aria-hidden
                            />
                            {expenseStatusUiLabel(w)}
                          </>
                        );
                      })()}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground">
                      Set project and category to mark done when you save.
                    </p>
                  </div>
                  <div className="col-span-2">
                    <ExpenseSubcontractDeductionFields
                      idPrefix="edit-expense-subcontract-deduction"
                      enabled={deductFromSubcontractor}
                      onEnabledChange={setDeductFromSubcontractor}
                      projectId={projectId}
                      subcontractId={deductionSubcontractId}
                      onSubcontractIdChange={setDeductionSubcontractId}
                      amount={deductionAmount}
                      onAmountChange={setDeductionAmount}
                      note={deductionNote}
                      onNoteChange={setDeductionNote}
                      options={subcontractDeductionOptions}
                      disabled={saving}
                      triggerClassName={SELECT_TRIGGER}
                      inputClassName={INPUT_ROW}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={FIELD_LABEL}>Description</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={cn(INPUT_ROW, "min-h-[88px] resize-y py-2")}
                      placeholder="Optional"
                      disabled={saving}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3">
                  <span className={cn(FIELD_LABEL, "mb-2 block")}>Attachments</span>
                  <ExpenseEditAttachmentsSection
                    expense={expense}
                    supabase={supabase}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    thumbById={thumbById}
                    disabled={saving}
                    onExpenseUpdated={onExpenseAttachmentsUpdated}
                    onPreviewAttachment={(att) => void openAttachmentPreview(att)}
                    showDelete
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-sm"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-10 rounded-sm bg-black px-5 text-white hover:bg-neutral-900 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
                  onClick={handleSave}
                  disabled={saving}
                  aria-busy={saving}
                >
                  <SubmitSpinner loading={saving} className="mr-2" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
