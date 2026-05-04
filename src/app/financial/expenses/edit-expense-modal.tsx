"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteExpenseAttachment,
  getExpenseTotal,
  type Expense,
  type ExpenseAttachment,
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { inferAttachmentPreviewType } from "@/components/attachment-preview-modal";
import {
  useAttachmentPreview,
  type AttachmentPreviewFileItem,
} from "@/contexts/attachment-preview-context";
import {
  getExpenseReceiptItemsFromParts,
  resolveExpenseReceiptItemsPreviewUrls,
  type ExpenseReceiptItem,
} from "@/lib/expense-receipt-items";
import {
  dedupeExpenseAttachmentsByStorageKey,
  expenseAttachmentStorageDedupeKey,
} from "@/lib/expense-attachment-dedupe";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import type { PaymentAccountRow } from "@/lib/data";
import { persistLastExpensePaymentAccountId } from "@/lib/expense-payment-preferences";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import {
  deriveExpenseWorkflowStatus,
  expenseNeedsReviewFromDb,
  expenseStatusUiLabel,
  EXPENSE_PROJECT_SELECT_NONE,
  EXPENSE_WORKER_SELECT_NONE,
} from "@/lib/expense-workflow-status";
import { cn } from "@/lib/utils";
import { ExpenseEditAttachmentsSection } from "./expense-edit-attachments-section";

function attachmentIsImage(att: ExpenseAttachment): boolean {
  if (att.mimeType.startsWith("image/")) return true;
  return (
    /\.(jpe?g|png|gif|webp)$/i.test(att.fileName) || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(att.url)
  );
}

type ReceiptPreviewItem = ExpenseReceiptItem & { attachmentId?: string };

function enrichReceiptItemsWithAttachmentIds(
  items: ExpenseReceiptItem[],
  dedupedAttachments: ExpenseAttachment[]
): ReceiptPreviewItem[] {
  const keyToAtt = new Map<string, ExpenseAttachment>();
  for (const a of dedupedAttachments) {
    const k = expenseAttachmentStorageDedupeKey(a.url);
    if (k) keyToAtt.set(k, a);
  }
  return items.map((it) => {
    const k = expenseAttachmentStorageDedupeKey(it.url);
    const match = k ? keyToAtt.get(k) : undefined;
    return { ...it, attachmentId: match?.id };
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

function receiptItemsNeedSignedUrls(
  rawItems: ExpenseReceiptItem[],
  shellFiles: AttachmentPreviewFileItem[]
): boolean {
  return (
    shellFiles.every((f) => !(f.url ?? "").trim()) ||
    rawItems.some((it) => {
      const u = (it.url ?? "").trim();
      return u.length > 0 && !/^https?:\/\//i.test(u);
    })
  );
}

type ProjectOption = { id: string; name: string | null };
type WorkerOption = { id: string; name: string };

const FIELD_LABEL = "text-xs uppercase tracking-wide text-muted-foreground";
const INPUT_ROW = "h-10 rounded-sm border-border/60 text-sm";
const SELECT_TRIGGER = "h-10 rounded-sm border-border/60 text-sm [&>span]:line-clamp-1";

const selectPopperContentProps = {
  position: "popper" as const,
  sideOffset: 4,
  className: "z-[200] max-h-[min(280px,var(--radix-select-content-available-height))]",
};

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
};

type Props = {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  workers: WorkerOption[];
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
  supabase,
  onExpenseAttachmentsUpdated,
  onSave,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [vendorName, setVendorName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [workerId, setWorkerId] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState("Other");
  const [notes, setNotes] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState("");
  const [sourceType, setSourceType] = React.useState<Expense["sourceType"]>("company");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [paymentAccountsLocal, setPaymentAccountsLocal] = React.useState<PaymentAccountRow[]>([]);
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
  const attachmentsPreviewRef = React.useRef(attachments);

  React.useEffect(() => {
    attachmentsPreviewRef.current = attachments;
  }, [attachments]);

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
      setProjectId(expense.lines[0]?.projectId ?? expense.headerProjectId ?? null);
      setWorkerId(expense.workerId ?? null);
      setCategory(expense.lines[0]?.category ?? "Other");
      setNotes(expense.notes ?? "");
      setExpenseDate((expense.date ?? "").slice(0, 10));
      setSourceType(expense.sourceType ?? "company");
      setPaymentAccountId(expense.paymentAccountId ?? "");
      setAttachments(expense.attachments ?? []);
    }
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

  const openAttachmentPreview = React.useCallback(
    async (att: ExpenseAttachment) => {
      const ex = expense;
      if (!ex) return;
      if (!supabase) {
        toast({
          title: "Preview unavailable",
          description: "Supabase is not configured.",
          variant: "error",
        });
        return;
      }
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
      const enriched = enrichReceiptItemsWithAttachmentIds(rawItems, deduped);
      const shellFiles = receiptItemsToPreviewFiles(enriched);
      const initialIndex = Math.max(
        0,
        enriched.findIndex(
          (x) =>
            expenseAttachmentStorageDedupeKey(x.url) === expenseAttachmentStorageDedupeKey(att.url)
        )
      );
      const needsSigned = receiptItemsNeedSignedUrls(rawItems, shellFiles);
      const session = ++editPreviewSessionRef.current;
      editPreviewIndexRef.current = initialIndex;

      openPreview({
        files: shellFiles,
        initialIndex,
        isLoading: needsSigned,
        onIndexChange: (i) => {
          editPreviewIndexRef.current = i;
        },
        onRefreshPreviewUrl: async () => {
          if (editPreviewSessionRef.current !== session) return null;
          const ex2 = expensePreviewRef.current;
          const atts = dedupeExpenseAttachmentsByStorageKey(attachmentsPreviewRef.current);
          if (!ex2) return null;
          const raws = getExpenseReceiptItemsFromParts({
            receiptUrl: ex2.receiptUrl,
            attachments: atts,
          });
          const enriched2 = enrichReceiptItemsWithAttachmentIds(raws, atts);
          const resolved = await resolveExpenseReceiptItemsPreviewUrls(enriched2, supabase);
          patchPreviewRef.current({ files: receiptItemsToPreviewFiles(resolved) });
          const idx = editPreviewIndexRef.current;
          return (resolved[idx]?.url ?? "").trim() || null;
        },
        onDeleteCurrent: async (attachmentId) => {
          const ex3 = expensePreviewRef.current;
          if (!ex3) return;
          const nextExp = await deleteExpenseAttachment(ex3.id, attachmentId);
          if (!nextExp) return;
          const nextAtts = dedupeExpenseAttachmentsByStorageKey(nextExp.attachments ?? []);
          setAttachments(nextAtts);
          onExpenseAttachmentsUpdated?.(nextExp);
          expensePreviewRef.current = nextExp;
          attachmentsPreviewRef.current = nextAtts;
          const raws2 = getExpenseReceiptItemsFromParts({
            receiptUrl: nextExp.receiptUrl,
            attachments: nextAtts,
          });
          if (raws2.length === 0) {
            closePreviewRef.current();
            return;
          }
          const enriched3 = enrichReceiptItemsWithAttachmentIds(raws2, nextAtts);
          const resolved3 = await resolveExpenseReceiptItemsPreviewUrls(enriched3, supabase);
          patchPreviewRef.current({ files: receiptItemsToPreviewFiles(resolved3) });
        },
      });

      if (!needsSigned) return;

      void resolveExpenseReceiptItemsPreviewUrls(enriched, supabase)
        .then((resolved) => {
          if (editPreviewSessionRef.current !== session) return;
          patchPreviewRef.current({
            isLoading: false,
            files: receiptItemsToPreviewFiles(
              resolved.map((it, i) => ({ ...it, attachmentId: enriched[i]?.attachmentId }))
            ),
          });
        })
        .catch((e) => {
          if (editPreviewSessionRef.current !== session) return;
          toast({
            title: "Preview failed",
            description: e instanceof Error ? e.message : "Could not prepare preview.",
            variant: "error",
          });
          closePreviewRef.current();
        });
    },
    [expense, supabase, attachments, toast, openPreview, onExpenseAttachmentsUpdated]
  );

  const handleSave = () => {
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
      const workflowStatus = deriveExpenseWorkflowStatus(projectId, category || "Other");
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
      });
    } finally {
      setSaving(false);
    }
  };

  const projectRadixValue =
    projectId && String(projectId).trim() !== "" ? projectId : EXPENSE_PROJECT_SELECT_NONE;
  const workerRadixValue =
    workerId && String(workerId).trim() !== "" ? workerId : EXPENSE_WORKER_SELECT_NONE;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="expenses-ui-dialog flex max-h-[min(92vh,820px)] w-full max-w-[560px] flex-col gap-0 overflow-hidden border-border/60 p-0">
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
                    <Input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className={INPUT_ROW}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Project</label>
                    <Select
                      value={projectRadixValue}
                      disabled={saving}
                      onValueChange={(v) =>
                        setProjectId(v === EXPENSE_PROJECT_SELECT_NONE ? null : v)
                      }
                    >
                      <SelectTrigger className={SELECT_TRIGGER}>
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
                      className={SELECT_TRIGGER}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Payment account</label>
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
                    <Select
                      value={workerRadixValue}
                      disabled={saving}
                      onValueChange={(v) =>
                        setWorkerId(v === EXPENSE_WORKER_SELECT_NONE ? null : v)
                      }
                    >
                      <SelectTrigger className={SELECT_TRIGGER}>
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
                      <SelectTrigger className={SELECT_TRIGGER}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="receipt_upload">Receipt upload</SelectItem>
                        <SelectItem value="reimbursement">Reimbursement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={FIELD_LABEL}>Status</label>
                    <Badge
                      variant="outline"
                      className="flex h-10 w-full items-center justify-start gap-2 rounded-sm border-border/60 px-3 py-0 text-sm font-normal"
                    >
                      {(() => {
                        const w = deriveExpenseWorkflowStatus(projectId, category);
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
                  <div className="col-span-2 space-y-1.5">
                    <label className={FIELD_LABEL}>Notes</label>
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
