"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/skeleton";
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
  insertExpenseAttachmentRecord,
  type Expense,
  type ExpenseAttachment,
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { inferAttachmentPreviewType } from "@/components/attachment-preview-modal";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
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

function attachmentIsImage(att: ExpenseAttachment): boolean {
  if (att.mimeType.startsWith("image/")) return true;
  return (
    /\.(jpe?g|png|gif|webp)$/i.test(att.fileName) || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(att.url)
  );
}

function storageFileType(file: File): "image" | "pdf" | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (file.type.startsWith("image/")) return "image";
  if (/\.(jpe?g|png|gif|webp)$/i.test(file.name)) return "image";
  return null;
}

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
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const { openPreview } = useAttachmentPreview();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

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

  const resolvePreviewUrl = React.useCallback(
    async (att: ExpenseAttachment): Promise<string> => {
      const raw = (att.url ?? "").trim();
      if (!raw) return "";
      if (!supabase) return "";
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

  const handleUploadFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !expense) return;
      if (!supabase) {
        toast({
          title: "Upload failed",
          description: "Supabase is not configured.",
          variant: "error",
        });
        return;
      }
      setUploadBusy(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          const ft = storageFileType(file);
          if (!ft) {
            toast({
              title: "Skipped file",
              description: `${file.name} is not an image or PDF.`,
              variant: "error",
            });
            continue;
          }
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
          const filePath = `expenses/${expense.id}/${Date.now()}-${i}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("expense-attachments")
            .upload(filePath, file, {
              contentType: file.type || undefined,
              upsert: false,
            });
          if (upErr) throw upErr;
          const next = await insertExpenseAttachmentRecord(expense.id, {
            storagePath: filePath,
            fileType: ft,
          });
          if (next) {
            setAttachments(next.attachments ?? []);
            onExpenseAttachmentsUpdated?.(next);
          }
        }
        toast({ title: "Attachment(s) added", variant: "success" });
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "error",
        });
      } finally {
        setUploadBusy(false);
      }
    },
    [expense, supabase, toast, onExpenseAttachmentsUpdated]
  );

  const handleDeleteAttachment = React.useCallback(
    async (att: ExpenseAttachment) => {
      if (!expense) return;
      if (!window.confirm("Delete this attachment?")) return;
      try {
        const next = await deleteExpenseAttachment(expense.id, att.id);
        if (next) {
          setAttachments(next.attachments ?? []);
          onExpenseAttachmentsUpdated?.(next);
          toast({ title: "Attachment removed", variant: "success" });
        }
      } catch (e) {
        toast({
          title: "Delete failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "error",
        });
      }
    },
    [expense, toast, onExpenseAttachmentsUpdated]
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
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,.pdf"
                  multiple
                  onChange={(e) => {
                    void handleUploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    void handleUploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
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

                <div className="border-t border-gray-100 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="exp-dlg-muted text-[11px] font-medium">Attachments</span>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="exp-btn-secondary h-8 rounded-sm"
                        disabled={!supabase || uploadBusy || saving}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploadBusy ? (
                          <>
                            <InlineLoading className="mr-1.5" />
                            Uploading…
                          </>
                        ) : (
                          "+ Add attachment"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="btn-outline-ghost exp-btn-secondary h-8 rounded-sm"
                        disabled={!supabase || uploadBusy || saving}
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        Camera
                      </Button>
                    </div>
                  </div>
                  {!supabase ? (
                    <p className="exp-dlg-muted mt-2 text-xs">
                      Configure Supabase to add attachments.
                    </p>
                  ) : attachments.length === 0 ? (
                    <p className="exp-dlg-muted mt-1.5 text-[11px]">No attachments yet.</p>
                  ) : (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                      {attachments.map((att) => {
                        const thumb = thumbById[att.id];
                        const isPdf = !attachmentIsImage(att);
                        return (
                          <li
                            key={att.id}
                            className="flex items-center gap-2 border-b border-gray-100/80 py-1.5 last:border-0"
                          >
                            <button
                              type="button"
                              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-gray-100"
                              onClick={() => void openAttachmentPreview(att)}
                              aria-label="Preview"
                            >
                              {isPdf ? (
                                <span className="text-[9px] font-medium text-text-secondary">
                                  PDF
                                </span>
                              ) : thumb ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <InlineLoading className="h-4 w-4" size="md" />
                              )}
                            </button>
                            <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                              {att.fileName}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="btn-outline-ghost h-7 shrink-0 px-2 text-xs text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-text-primary"
                              onClick={() => void openAttachmentPreview(att)}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="btn-outline-ghost h-7 shrink-0 px-2 text-xs text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                              onClick={() => void handleDeleteAttachment(att)}
                              disabled={saving}
                            >
                              Remove
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
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
