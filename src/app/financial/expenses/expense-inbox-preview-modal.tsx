"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  getExpenseTotal,
  isExpenseCategoryDisabled,
  isPaymentMethodDisabled,
  type Expense,
  type ExpenseAttachment,
  type SubcontractDeductionOption,
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
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { ExpenseDatePicker } from "@/components/expense-date-picker";
import { ExpensePaymentMethodSelect } from "@/components/expense-payment-method-select";
import { ExpensePaymentSourceSelect } from "@/components/expense-payment-source-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
import { ExpenseSubcontractDeductionFields } from "@/components/expense-subcontract-deduction-fields";
import type { PaymentAccountRow } from "@/lib/data";
import { persistLastExpensePaymentAccountId } from "@/lib/expense-payment-preferences";
import type { ExpenseReviewSavePatch } from "./edit-expense-modal";
import { defaultPaymentMethodName, isPaymentAccountOptionActive } from "@/lib/expense-options-db";
import { cn } from "@/lib/utils";
import {
  isInboxUploadExpenseReference,
  stripInboxUploadNoiseFromText,
} from "@/lib/inbox-upload-constants";
import {
  deriveExpenseWorkflowStatus,
  expenseCostAllocationFromProjectId,
  expenseCostAllocationRequiresProject,
  expenseHasCategoryForWorkflow,
  expenseHasRequiredProjectForWorkflow,
  expenseNeedsReviewFromDb,
  expenseSourceTypeIsWorkerReimbursement,
  expenseStatusUiLabel,
  preserveConfirmedExpenseStatusOnCompleteSave,
  validateApproveInboxUploadDraft,
  EXPENSE_COST_ALLOCATION_OVERHEAD,
  EXPENSE_COST_ALLOCATION_PROJECT_COST,
  EXPENSE_PROJECT_SELECT_NONE,
  EXPENSE_WORKER_SELECT_NONE,
  type ExpenseCostAllocation,
} from "@/lib/expense-workflow-status";
import {
  getExpenseDisplayAttachments,
  getExpenseReceiptItemsFromParts,
  type ExpenseReceiptItem,
} from "@/lib/expense-receipt-items";
import {
  fetchExpenseReceiptManifest,
  receiptApiItemToExpenseReceiptItem,
} from "@/lib/expense-receipt-api-client";
import {
  getExpenseHeaderLineMismatch,
  type ExpenseHeaderLineMismatch,
  type ExpenseIssueFocus,
} from "@/lib/expense-header-line-mismatch";
import { buildReceiptPreviewShellFiles } from "@/lib/receipt-preview-shell-files";
import { expenseAttachmentStorageDedupeKey } from "@/lib/expense-attachment-dedupe";
import { ExpenseEditAttachmentsSection } from "./expense-edit-attachments-section";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/formatters";

type ProjectOption = { id: string; name: string | null };
type WorkerOption = { id: string; name: string };

const FIELD_LABEL =
  "text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]";
const INPUT_CLASS =
  "h-10 rounded-lg border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-sm text-[var(--neo-text-primary)] shadow-none placeholder:text-[var(--neo-text-tertiary)] focus-visible:border-[var(--neo-gold)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-11 max-md:text-base";
const SELECT_TRIGGER_CLASS =
  "h-10 rounded-lg border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-sm text-[var(--neo-text-primary)] shadow-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-11 max-md:text-base [&>span]:line-clamp-1";
const PREVIEW_SECONDARY_BUTTON =
  "rounded-lg border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)] focus-visible:ring-[var(--neo-gold-ring)]";
const PREVIEW_PRIMARY_BUTTON =
  "rounded-lg border-transparent bg-[var(--neo-gold)] text-zinc-950 shadow-none hover:bg-[var(--neo-gold-soft)] focus-visible:ring-[var(--neo-gold-ring)]";
const PREVIEW_WARNING_CHIP =
  "rounded-md border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]";

export type ExpenseInboxPreviewSavePayload = ExpenseReviewSavePatch;

function attachmentIsImage(att: ExpenseAttachment): boolean {
  const mt = (att.mimeType ?? "").trim().toLowerCase();
  if (mt.startsWith("image/")) return true;
  const blob = `${att.fileName} ${att.url}`;
  if (/\.pdf(\?|#|$)/i.test(blob)) return false;
  return /\.(jpe?g|png|gif|webp|avif|heic|heif)(\?|#|$)/i.test(blob);
}

function findAttachmentForReceiptItem(
  item: ExpenseReceiptItem,
  list: ExpenseAttachment[]
): ExpenseAttachment | undefined {
  const key = expenseAttachmentStorageDedupeKey(item.url);
  if (!key) return undefined;
  return list.find((a) => expenseAttachmentStorageDedupeKey(a.url) === key);
}

/** Uses attachment mime when matched; otherwise URL/filename extension (incl. HEIC). */
function receiptItemIsImage(
  item: ExpenseReceiptItem,
  match: ExpenseAttachment | undefined
): boolean {
  if (match) return attachmentIsImage(match);
  const blob = `${item.fileName} ${item.url}`;
  if (/\.pdf(\?|#|$)/i.test(blob)) return false;
  return /\.(jpe?g|png|gif|webp|avif|heic|heif)(\?|#|$)/i.test(blob);
}

function receiptLineItemsToPreviewFiles(items: ExpenseReceiptItem[]): AttachmentPreviewFileItem[] {
  return items.map((it, i) => ({
    url: /^https?:\/\//i.test((it.url ?? "").trim()) ? (it.url ?? "").trim() : "",
    fileName: it.fileName ?? `File ${i + 1}`,
    fileType: inferAttachmentPreviewType(it.fileName ?? "", it.url ?? ""),
  }));
}

function sourceTypeLabel(t: Expense["sourceType"]): string {
  if (t === "reimbursement") return "Worker reimbursement";
  if (t === "receipt_upload") return "Receipt upload";
  if (t === "bank_import") return "Bank import";
  return "Manual";
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
      <h3 className={cn(FIELD_LABEL, "border-b border-[var(--neo-border)] pb-2")}>{title}</h3>
      {children}
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className={FIELD_LABEL}>{label}</div>
      <div className="text-sm text-[var(--neo-text-primary)]">{children}</div>
    </div>
  );
}

function HeaderLineMismatchPanel({
  mismatch,
  hasReceipt,
  onViewReceipt,
}: {
  mismatch: ExpenseHeaderLineMismatch;
  hasReceipt: boolean;
  onViewReceipt: () => void;
}) {
  return (
    <div
      data-testid="expense-header-line-mismatch-panel"
      className="rounded-xl border border-[rgb(184_137_45_/_0.26)] bg-[rgb(184_137_45_/_0.08)] p-3 shadow-[inset_3px_0_0_rgb(184_137_45_/_0.72)]"
      role="status"
    >
      <p className="text-sm font-semibold text-[var(--neo-text-primary)]">
        System Health found a header/line total mismatch.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(
          [
            ["Header total", mismatch.headerTotal],
            ["Split lines total", mismatch.linesTotal],
            ["Difference", mismatch.absDifference],
          ] satisfies Array<[string, number]>
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-2.5 py-2"
          >
            <p className={FIELD_LABEL}>{label}</p>
            <p className="mt-1 tabular-nums text-sm font-semibold text-[var(--neo-text-primary)]">
              {formatCurrency(Number(value))}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs leading-snug text-[var(--neo-text-secondary)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          Review receipt. If receipt total matches lines, update header. If receipt total matches
          header, adjust split lines.
        </p>
        {hasReceipt ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(PREVIEW_SECONDARY_BUTTON, "h-9 shrink-0")}
            onClick={onViewReceipt}
          >
            View receipt
          </Button>
        ) : null}
      </div>
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
  subcontractDeductionOptions: SubcontractDeductionOption[];
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
  /** After attachment upload/remove in edit mode — sync list + React Query. */
  onAttachmentsUpdated?: (expense: Expense) => void;
  /** System Health issue context for read-only diagnostic display. */
  issueContext?: ExpenseIssueFocus | null;
};

export function ExpenseInboxPreviewModal({
  expense,
  open,
  onOpenChange,
  enterMode = "preview",
  projects,
  workers,
  subcontractDeductionOptions,
  projectNameById,
  supabase,
  setCategoriesList,
  onSave,
  onMarkReviewed,
  previewNav,
  possibleDuplicate = false,
  onAttachmentsUpdated,
  issueContext = null,
}: Props) {
  const { toast } = useToast();
  const { openPreview, patchPreview } = useAttachmentPreview();
  const patchPreviewRef = React.useRef(patchPreview);
  patchPreviewRef.current = patchPreview;
  const inboxPreviewSessionRef = React.useRef(0);
  const inboxPreviewIndexRef = React.useRef(0);
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [markBusy, setMarkBusy] = React.useState(false);
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
  const [secureReceiptItems, setSecureReceiptItems] = React.useState<ExpenseReceiptItem[]>([]);
  const [previewPmArchived, setPreviewPmArchived] = React.useState(false);
  const [previewCatArchived, setPreviewCatArchived] = React.useState(false);
  const [previewPaArchived, setPreviewPaArchived] = React.useState(false);
  /** Preview-mode attachment thumbnails: keyed by storage dedupe key (same signing path as list thumbs). */
  const [previewThumbSignedByDedupeKey, setPreviewThumbSignedByDedupeKey] = React.useState<
    Record<string, string | null>
  >({});
  const [previewThumbErrorByKey, setPreviewThumbErrorByKey] = React.useState<
    Record<string, boolean>
  >({});

  const expensePreviewRef = React.useRef(expense);
  const attachmentsPreviewRef = React.useRef(attachments);

  React.useEffect(() => {
    attachmentsPreviewRef.current = attachments;
  }, [attachments]);

  React.useEffect(() => {
    if (expense) expensePreviewRef.current = expense;
  }, [expense]);

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
  }, [expense]);

  React.useEffect(() => {
    if (!deductFromSubcontractor) return;
    if (deductionAmount.trim()) return;
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) setDeductionAmount(String(Math.round(n * 100) / 100));
  }, [amount, deductFromSubcontractor, deductionAmount]);

  React.useEffect(() => {
    const pm = expense?.paymentMethod?.trim();
    if (!pm) {
      setPreviewPmArchived(false);
      return;
    }
    void isPaymentMethodDisabled(pm).then(setPreviewPmArchived);
  }, [expense?.paymentMethod, expense?.id]);

  React.useEffect(() => {
    const cat = expense?.lines[0]?.category?.trim();
    if (!cat) {
      setPreviewCatArchived(false);
      return;
    }
    void isExpenseCategoryDisabled(cat).then(setPreviewCatArchived);
  }, [expense?.lines, expense?.id]);

  React.useEffect(() => {
    const aid = expense?.paymentAccountId?.trim();
    if (!aid) {
      setPreviewPaArchived(false);
      return;
    }
    void isPaymentAccountOptionActive(aid).then((a) => setPreviewPaArchived(!a));
  }, [expense?.paymentAccountId, expense?.id]);

  React.useEffect(() => {
    if (!expense || !open || mode !== "edit") return;
    const pm = (expense.paymentMethod ?? "").trim();
    if (pm) return;
    let cancelled = false;
    void defaultPaymentMethodName().then((d) => {
      if (!cancelled && d) setPaymentMethod(d);
    });
    return () => {
      cancelled = true;
    };
  }, [expense, open, mode]);

  React.useEffect(() => {
    setPreviewThumbErrorByKey({});
    setPreviewThumbSignedByDedupeKey({});
  }, [expenseId]);

  const receiptItems = React.useMemo(() => {
    if (!expense) return [];
    return getExpenseReceiptItemsFromParts({
      receiptUrl: expense.receiptUrl,
      attachments,
    });
  }, [expense, attachments]);

  React.useEffect(() => {
    if (!open || !expense) {
      setSecureReceiptItems([]);
      setThumbById({});
      setPreviewThumbSignedByDedupeKey({});
      return;
    }
    let alive = true;
    void fetchExpenseReceiptManifest(expense.id)
      .then((manifest) => {
        if (!alive) return;
        const secure = manifest.items.map(receiptApiItemToExpenseReceiptItem);
        setSecureReceiptItems(secure);

        const previewThumbs: Record<string, string | null> = {};
        receiptItems.forEach((item, index) => {
          previewThumbs[expenseAttachmentStorageDedupeKey(item.url)] = secure[index]?.url ?? null;
        });
        setPreviewThumbSignedByDedupeKey(previewThumbs);

        const attachmentThumbs: Record<string, string | null> = {};
        for (const attachment of attachments) {
          const itemIndex = receiptItems.findIndex(
            (item) =>
              expenseAttachmentStorageDedupeKey(item.url) ===
              expenseAttachmentStorageDedupeKey(attachment.url)
          );
          attachmentThumbs[attachment.id] =
            itemIndex >= 0 ? (secure[itemIndex]?.url ?? null) : null;
        }
        setThumbById(attachmentThumbs);
      })
      .catch(() => {
        if (!alive) return;
        setSecureReceiptItems([]);
        setThumbById({});
        setPreviewThumbSignedByDedupeKey({});
      });
    return () => {
      alive = false;
    };
  }, [attachments, expense, open, receiptItems]);

  const receiptItemsRef = React.useRef(
    secureReceiptItems.length > 0 ? secureReceiptItems : receiptItems
  );
  React.useEffect(() => {
    receiptItemsRef.current = secureReceiptItems.length > 0 ? secureReceiptItems : receiptItems;
  }, [receiptItems, secureReceiptItems]);

  const refreshSecureReceiptItems = React.useCallback(async () => {
    const currentExpense = expensePreviewRef.current;
    if (!currentExpense) return [];
    const manifest = await fetchExpenseReceiptManifest(currentExpense.id);
    const secure = manifest.items.map(receiptApiItemToExpenseReceiptItem);
    receiptItemsRef.current = secure;
    setSecureReceiptItems(secure);
    return secure;
  }, []);

  const openAttachmentPreview = React.useCallback(
    (att: ExpenseAttachment) => {
      if (!expense) {
        toast({
          title: "Preview unavailable",
          description: "No expense loaded.",
          variant: "error",
        });
        return;
      }
      const items = receiptItemsRef.current;
      if (items.length === 0) {
        toast({
          title: "Nothing to preview",
          description: "This expense has no receipt or attachment files yet.",
          variant: "default",
        });
        return;
      }
      const shellFiles = buildReceiptPreviewShellFiles(items);
      const initialIndex = Math.max(
        0,
        receiptItems.findIndex(
          (x) =>
            expenseAttachmentStorageDedupeKey(x.url) === expenseAttachmentStorageDedupeKey(att.url)
        )
      );
      const session = ++inboxPreviewSessionRef.current;
      inboxPreviewIndexRef.current = initialIndex;
      const needsResolve = shellFiles.some((f) => f.pendingSignedUrl);

      const resolveAndPatch = () => {
        void refreshSecureReceiptItems()
          .then((resolved) => {
            if (inboxPreviewSessionRef.current !== session) return;
            patchPreviewRef.current({
              files: receiptLineItemsToPreviewFiles(resolved),
            });
          })
          .catch(() => {
            if (inboxPreviewSessionRef.current !== session) return;
            patchPreviewRef.current({
              files: buildReceiptPreviewShellFiles(receiptItemsRef.current).map((f) => ({
                ...f,
                pendingSignedUrl: false,
                signedUrlResolveFailed: true,
              })),
            });
          });
      };

      openPreview({
        files: shellFiles,
        initialIndex,
        isLoading: false,
        onRetrySignedUrlResolve: () => {
          patchPreviewRef.current({
            files: buildReceiptPreviewShellFiles(receiptItemsRef.current).map((f) => ({
              ...f,
              pendingSignedUrl: needsResolve,
              signedUrlResolveFailed: false,
            })),
          });
          resolveAndPatch();
        },
        onIndexChange: (i) => {
          inboxPreviewIndexRef.current = i;
        },
        onRefreshPreviewUrl: async () => {
          if (inboxPreviewSessionRef.current !== session) return null;
          const resolved = await refreshSecureReceiptItems();
          patchPreviewRef.current({ files: receiptLineItemsToPreviewFiles(resolved) });
          const idx = inboxPreviewIndexRef.current;
          return (resolved[idx]?.url ?? "").trim() || null;
        },
      });

      if (needsResolve) resolveAndPatch();
    },
    [expense, openPreview, receiptItems, refreshSecureReceiptItems, toast]
  );

  const openReceiptItemPreview = React.useCallback(
    (item: { url: string; fileName: string }) => {
      if (!expense) {
        toast({
          title: "Preview unavailable",
          description: "No expense loaded.",
          variant: "error",
        });
        return;
      }
      const items = receiptItemsRef.current;
      if (items.length === 0) return;
      const shellFiles = buildReceiptPreviewShellFiles(items);
      const initialIndex = Math.max(
        0,
        receiptItems.findIndex(
          (x) =>
            expenseAttachmentStorageDedupeKey(x.url) === expenseAttachmentStorageDedupeKey(item.url)
        )
      );
      const session = ++inboxPreviewSessionRef.current;
      inboxPreviewIndexRef.current = initialIndex;
      const needsResolve = shellFiles.some((f) => f.pendingSignedUrl);

      const resolveAndPatch = () => {
        void refreshSecureReceiptItems()
          .then((resolved) => {
            if (inboxPreviewSessionRef.current !== session) return;
            patchPreviewRef.current({
              files: receiptLineItemsToPreviewFiles(resolved),
            });
          })
          .catch(() => {
            if (inboxPreviewSessionRef.current !== session) return;
            patchPreviewRef.current({
              files: buildReceiptPreviewShellFiles(receiptItemsRef.current).map((f) => ({
                ...f,
                pendingSignedUrl: false,
                signedUrlResolveFailed: true,
              })),
            });
          });
      };

      openPreview({
        files: shellFiles,
        initialIndex,
        isLoading: false,
        onRetrySignedUrlResolve: () => {
          patchPreviewRef.current({
            files: buildReceiptPreviewShellFiles(receiptItemsRef.current).map((f) => ({
              ...f,
              pendingSignedUrl: needsResolve,
              signedUrlResolveFailed: false,
            })),
          });
          resolveAndPatch();
        },
        onIndexChange: (i) => {
          inboxPreviewIndexRef.current = i;
        },
        onRefreshPreviewUrl: async () => {
          if (inboxPreviewSessionRef.current !== session) return null;
          const resolved = await refreshSecureReceiptItems();
          patchPreviewRef.current({ files: receiptLineItemsToPreviewFiles(resolved) });
          const idx = inboxPreviewIndexRef.current;
          return (resolved[idx]?.url ?? "").trim() || null;
        },
      });

      if (needsResolve) resolveAndPatch();
    },
    [expense, openPreview, receiptItems, refreshSecureReceiptItems, toast]
  );

  const handleSave = async () => {
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
    try {
      const paId = paymentAccountId.trim() || null;
      const paName = paId
        ? (paymentAccountsLocal.find((a) => a.id === paId)?.name ??
          expense.paymentAccountName ??
          null)
        : null;
      const pm = paymentMethod.trim() || (await defaultPaymentMethodName()) || "Cash";
      let workflowStatus = preserveConfirmedExpenseStatusOnCompleteSave(
        expense.status,
        deriveExpenseWorkflowStatus(projectId, category || "Other", costAllocation)
      );
      /* INBOX-UP drafts must stay in the Inbox pool until explicit Approve — DB `reviewed` removes them from Inbox. */
      if (
        isInboxUploadExpenseReference(expense.referenceNo) &&
        workflowStatus === "reviewed" &&
        expenseNeedsReviewFromDb(expense.status)
      ) {
        workflowStatus = "needs_review";
      }
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
      if (saved) {
        setMode("preview");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
    if (!expense || markBusy) return;
    if (isInboxUploadExpenseReference(expense.referenceNo)) {
      const gate = validateApproveInboxUploadDraft(expense, costAllocation);
      if (gate === "project") {
        toast({
          title: "Choose a project first",
          description: "Tap Edit, set project, then save — then you can approve.",
          variant: "default",
        });
        return;
      }
      if (gate === "category") {
        toast({
          title: "Choose a category first",
          description: "Tap Edit, set category, then save — then you can approve.",
          variant: "default",
        });
        return;
      }
      if (gate === "payment") {
        toast({
          title: "Choose a payment account first",
          description: "Tap Edit, set payment account, then save — then you can approve.",
          variant: "default",
        });
        return;
      }
      if (gate === "worker") {
        toast({
          title: "Choose a worker first",
          description: "Tap Edit, set worker, then save — then you can approve.",
          variant: "default",
        });
        return;
      }
    }
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
    setMode("preview");
  };

  if (!expense) return null;

  const showMarkDone = expenseNeedsReviewFromDb(expense.status);
  const inboxUploadPreview = isInboxUploadExpenseReference(expense.referenceNo);
  const missingProject = !expenseHasRequiredProjectForWorkflow(expense);
  const missingCategory = !expenseHasCategoryForWorkflow(expense);
  const missingReceipt = receiptItems.length === 0;
  const missingWorker =
    expenseSourceTypeIsWorkerReimbursement(expense.sourceType) && !expense.workerId;
  const headerLineMismatch = getExpenseHeaderLineMismatch(
    expense,
    issueContext?.expenseId === expense.id ? issueContext.issue : null
  );

  const projectRadixValue =
    projectId && String(projectId).trim() !== "" ? projectId : EXPENSE_PROJECT_SELECT_NONE;
  const workerRadixValue =
    workerId && String(workerId).trim() !== "" ? workerId : EXPENSE_WORKER_SELECT_NONE;
  const previewDivide = "divide-y divide-[var(--neo-border)]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => {
          if (eventTargetsAttachmentPreviewModal(e)) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (eventTargetsAttachmentPreviewModal(e)) e.preventDefault();
        }}
        className="expenses-ui-dialog flex max-h-[min(92vh,820px)] w-full max-w-[560px] flex-col gap-0 overflow-hidden border-[var(--neo-border)] bg-[var(--neo-surface-base)] p-0 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-[var(--neo-text-primary)]">
            {mode === "preview" ? "Expense" : "Edit expense"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {mode === "preview" ? (
            <div className="space-y-6">
              {possibleDuplicate ? (
                <p
                  className="rounded-md border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-2 py-1.5 text-xs text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]"
                  role="status"
                >
                  This transaction may be a duplicate.
                </p>
              ) : null}
              {(missingProject || missingCategory || missingReceipt) && (
                <div className="flex flex-wrap gap-1">
                  {missingProject ? (
                    <span className={PREVIEW_WARNING_CHIP}>Missing project</span>
                  ) : null}
                  {missingCategory ? (
                    <span className={PREVIEW_WARNING_CHIP}>Missing category</span>
                  ) : null}
                  {missingWorker ? (
                    <span className={PREVIEW_WARNING_CHIP}>Missing worker</span>
                  ) : null}
                  {missingReceipt ? (
                    <span className={PREVIEW_WARNING_CHIP}>Missing receipt</span>
                  ) : null}
                </div>
              )}
              {headerLineMismatch ? (
                <HeaderLineMismatchPanel
                  mismatch={headerLineMismatch}
                  hasReceipt={receiptItems.length > 0}
                  onViewReceipt={() => {
                    const firstReceipt = receiptItems[0];
                    if (firstReceipt) openReceiptItemPreview(firstReceipt);
                  }}
                />
              ) : null}
              <ModalSection title="Basic info">
                <div className={previewDivide}>
                  <PreviewRow label="Vendor">
                    {(expense.vendorName ?? "").trim() !== "" ? expense.vendorName : "Needs Review"}
                  </PreviewRow>
                  <PreviewRow label="Amount">
                    <span className="tabular-nums font-semibold tracking-normal text-rose-300">
                      {formatCurrency(-getExpenseTotal(expense))}
                    </span>
                  </PreviewRow>
                  <PreviewRow label="Date">{formatDate(expense.date)}</PreviewRow>
                  <PreviewRow label="Description">
                    {(() => {
                      const n = stripInboxUploadNoiseFromText((expense.notes ?? "").trim());
                      return n !== "" ? n : "—";
                    })()}
                  </PreviewRow>
                </div>
              </ModalSection>

              <ModalSection title="Classification">
                <div className={previewDivide}>
                  <PreviewRow label="Project">
                    {projectLabelFromExpense(expense, projectNameById)}
                  </PreviewRow>
                  <PreviewRow label="Category">
                    {expense.lines[0]?.category?.trim()
                      ? `${expense.lines[0].category}${previewCatArchived ? " (Archived)" : ""}`
                      : "—"}
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
                    {(() => {
                      const raw = paymentMethodLabel(expense.paymentMethod);
                      if (raw === "—") return "—";
                      return `${raw}${previewPmArchived ? " (Archived)" : ""}`;
                    })()}
                  </PreviewRow>
                  <PreviewRow label="Payment account">
                    {expense.paymentAccountName?.trim()
                      ? `${expense.paymentAccountName}${previewPaArchived ? " (Archived)" : ""}`
                      : "—"}
                  </PreviewRow>
                </div>
              </ModalSection>

              <ModalSection title="Attachments">
                <div className="pt-1" data-testid="expense-preview-attachments">
                  {receiptItems.length === 0 ? (
                    <span className="text-sm text-[var(--neo-text-secondary)]">—</span>
                  ) : (
                    <ul className="space-y-3">
                      {receiptItems.map((item, idx) => {
                        const match = findAttachmentForReceiptItem(item, attachments);
                        const isImg = receiptItemIsImage(item, match);
                        const dedupeKey = expenseAttachmentStorageDedupeKey(item.url);
                        const thumbState =
                          isImg && dedupeKey !== ""
                            ? previewThumbSignedByDedupeKey[dedupeKey]
                            : undefined;
                        const loadFailed = previewThumbErrorByKey[dedupeKey] ?? false;

                        if (!isImg) {
                          return (
                            <li key={`${item.url}-${idx}`}>
                              <button
                                type="button"
                                className="text-left text-sm text-[var(--neo-text-primary)] underline-offset-2 hover:text-[var(--neo-gold-soft)] hover:underline"
                                onClick={() => void openReceiptItemPreview(item)}
                              >
                                {item.fileName}
                              </button>
                            </li>
                          );
                        }

                        const ariaPreview =
                          receiptItems.length > 1
                            ? `Preview receipt attachment ${idx + 1} of ${receiptItems.length}`
                            : "Preview receipt attachment";

                        if (thumbState === undefined) {
                          return (
                            <li key={`${item.url}-${idx}`}>
                              <Skeleton className="h-[200px] max-h-[240px] w-full rounded-lg bg-[var(--neo-surface-muted)]" />
                            </li>
                          );
                        }

                        if (thumbState === null || loadFailed) {
                          return (
                            <li key={`${item.url}-${idx}`}>
                              <div className="flex flex-col gap-1 border-b border-[var(--neo-border)] py-2.5 last:border-b-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-[var(--neo-text-primary)]">
                                      {item.fileName}
                                    </p>
                                    <p className="text-xs text-[var(--neo-text-secondary)]">
                                      Preview unavailable
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={cn(PREVIEW_SECONDARY_BUTTON, "h-8 shrink-0")}
                                    onClick={() => void openReceiptItemPreview(item)}
                                  >
                                    Open
                                  </Button>
                                </div>
                              </div>
                            </li>
                          );
                        }

                        return (
                          <li key={`${item.url}-${idx}`}>
                            <button
                              type="button"
                              className="block w-full max-w-full overflow-hidden rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                              onClick={() => void openReceiptItemPreview(item)}
                              aria-label={ariaPreview}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- temporary URL from authenticated receipt API */}
                              <img
                                src={thumbState}
                                alt=""
                                className="max-h-[240px] w-full object-contain"
                                onError={() =>
                                  setPreviewThumbErrorByKey((prev) => ({
                                    ...prev,
                                    [dedupeKey]: true,
                                  }))
                                }
                              />
                            </button>
                          </li>
                        );
                      })}
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
                    <ExpenseDatePicker
                      id="inbox-preview-expense-date"
                      value={expenseDate}
                      onChange={setExpenseDate}
                      className={INPUT_CLASS}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={FIELD_LABEL}>Description</label>
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
                    <label className={FIELD_LABEL}>Classification</label>
                    <ExpenseSearchableSelect
                      id="edit-expense-cost-allocation-select"
                      value={costAllocation}
                      disabled={saving}
                      className={SELECT_TRIGGER_CLASS}
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
                      className={SELECT_TRIGGER_CLASS}
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
                      onCategoriesUpdated={(names) => setCategoriesList(names)}
                      className={SELECT_TRIGGER_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>Worker</label>
                    <ExpenseSearchableSelect
                      id="edit-expense-worker-select"
                      value={workerRadixValue}
                      disabled={saving}
                      className={SELECT_TRIGGER_CLASS}
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
                      className={SELECT_TRIGGER_CLASS}
                    />
                  </div>
                </div>
              </ModalSection>

              <ModalSection title="Subcontract deduction">
                <ExpenseSubcontractDeductionFields
                  idPrefix="inbox-preview-subcontract-deduction"
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
                  triggerClassName={SELECT_TRIGGER_CLASS}
                  inputClassName={INPUT_CLASS}
                />
              </ModalSection>

              <ModalSection title="Payment">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      className={SELECT_TRIGGER_CLASS}
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
                <ExpenseEditAttachmentsSection
                  expense={expense}
                  supabase={supabase}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  thumbById={thumbById}
                  disabled={saving}
                  onExpenseUpdated={onAttachmentsUpdated}
                  onPreviewAttachment={(att) => void openAttachmentPreview(att)}
                  showDelete
                />
              </ModalSection>
            </div>
          )}
        </div>

        {mode === "preview" ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-wrap gap-1">
              {previewNav ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(PREVIEW_SECONDARY_BUTTON, "h-9")}
                    disabled={!previewNav.canPrev}
                    onClick={() => previewNav.onPrev()}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(PREVIEW_SECONDARY_BUTTON, "h-9")}
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
                className={cn(PREVIEW_SECONDARY_BUTTON, "h-9")}
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn(PREVIEW_PRIMARY_BUTTON, "h-9")}
                onClick={() => setMode("edit")}
              >
                Edit
              </Button>
              {showMarkDone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(PREVIEW_SECONDARY_BUTTON, "h-9")}
                  disabled={markBusy}
                  onClick={() => void handleMarkReviewed()}
                >
                  <SubmitSpinner loading={markBusy} className="mr-2" />
                  {inboxUploadPreview ? "Approve" : "Mark Done"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(PREVIEW_SECONDARY_BUTTON, "h-10")}
              disabled={saving}
              onClick={cancelEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(PREVIEW_PRIMARY_BUTTON, "h-10 px-5")}
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
