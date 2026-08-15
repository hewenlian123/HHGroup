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
import { ExpenseItemsField } from "@/components/expense-items-field";
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
import {
  EXPENSE_FORM_FIELDS,
  composeExpenseDescription,
  parseExpenseDescription,
} from "@/lib/expense-form-system";
import { ArrowLeft, ChevronDown, FileText, X } from "lucide-react";

type ProjectOption = { id: string; name: string | null };
type WorkerOption = { id: string; name: string };

const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--eo-text-tertiary,var(--neo-text-tertiary))]";
const INPUT_CLASS =
  "h-11 rounded-md border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-primary,var(--neo-surface-raised))] text-sm text-[var(--eo-text-primary,var(--neo-text-primary))] shadow-none placeholder:text-[var(--eo-text-tertiary,var(--neo-text-tertiary))] focus-visible:border-[var(--eo-focus,var(--neo-border-strong))] focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))] max-md:min-h-12 max-md:text-base";
const SELECT_TRIGGER_CLASS =
  "h-11 rounded-md border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-primary,var(--neo-surface-raised))] text-sm text-[var(--eo-text-primary,var(--neo-text-primary))] shadow-none focus-visible:border-[var(--eo-focus,var(--neo-border-strong))] focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))] max-md:min-h-12 max-md:text-base [&>span]:line-clamp-1";
const PREVIEW_SECONDARY_BUTTON =
  "rounded-md border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-primary,var(--neo-surface-raised))] text-[var(--eo-text-primary,var(--neo-text-primary))] shadow-none hover:bg-[var(--eo-surface-selected,var(--neo-surface-muted))] focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))]";
const PREVIEW_QUIET_BUTTON =
  "rounded-md border-transparent bg-transparent text-[var(--eo-text-secondary,var(--neo-text-secondary))] shadow-none hover:bg-[var(--eo-surface-secondary,var(--neo-surface-muted))] hover:text-[var(--eo-text-primary,var(--neo-text-primary))] focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))]";
const PREVIEW_PRIMARY_BUTTON =
  "rounded-md border-transparent bg-[var(--eo-action-primary,#171717)] text-[var(--eo-action-primary-text,#fff)] shadow-none hover:bg-[var(--eo-action-primary-hover,#2a2a2a)] focus-visible:ring-[var(--eo-focus-ring,rgb(23_23_23_/_0.24))]";
const PREVIEW_WARNING_CHIP =
  "rounded-md border border-[var(--eo-warning-border,rgb(180_83_9_/_0.22))] bg-[var(--eo-warning-soft,rgb(245_158_11_/_0.10))] px-1.5 py-0.5 text-[11px] font-medium text-[var(--eo-warning,#a16207)]";

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
      <h3 data-expense-detail-section-title className={FIELD_LABEL}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ProgressiveDisclosure({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <details className="expense-more-details group pt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-1.5 py-2 text-[13px] font-medium text-[var(--eo-text-primary,var(--neo-text-primary))] outline-none transition-colors duration-120 hover:bg-[var(--eo-surface-secondary,var(--neo-surface-muted))] focus-visible:ring-2 focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))]">
        More Details
        <ChevronDown
          className="h-4 w-4 transition-transform duration-180 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="expense-progressive-content space-y-5 pb-2 pt-4">{children}</div>
    </details>
  );
}

function WorkerEditField({
  value,
  workers,
  saving,
  onChange,
}: {
  value: string;
  workers: WorkerOption[];
  saving: boolean;
  onChange: (workerId: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.worker.label}</label>
      <ExpenseSearchableSelect
        id="edit-expense-worker-select"
        value={value}
        disabled={saving}
        className={SELECT_TRIGGER_CLASS}
        placeholder="Worker"
        searchPlaceholder="Search workers…"
        emptyText="No matching workers"
        options={[
          { value: EXPENSE_WORKER_SELECT_NONE, label: "—", searchText: "none no worker" },
          ...workers.map((worker) => ({
            value: worker.id,
            label: worker.name,
            searchText: worker.id,
          })),
        ]}
        onValueChange={(nextValue) =>
          onChange(nextValue === EXPENSE_WORKER_SELECT_NONE ? null : nextValue)
        }
      />
    </div>
  );
}

function PaymentSourceEditField({
  value,
  saving,
  onChange,
}: {
  value: Expense["sourceType"];
  saving: boolean;
  onChange: (sourceType: Expense["sourceType"]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.paymentSource.label}</label>
        <Link
          href="/settings/expenses"
          className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
        >
          Manage
        </Link>
      </div>
      <ExpensePaymentSourceSelect
        value={(value ?? "company") as NonNullable<Expense["sourceType"]>}
        onValueChange={onChange}
        disabled={saving}
        id="edit-expense-payment-source-select"
        className={SELECT_TRIGGER_CLASS}
      />
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
      className="rounded-xl border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] p-3 shadow-[inset_3px_0_0_var(--eo-warning)]"
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
  /** Workspace routes render the same canonical editor inline; legacy surfaces may retain Dialog. */
  presentation?: "dialog" | "panel";
  /** Invoked only after `onSave` confirms success and local/cache state is reconciled. */
  onSaveAndNext?: () => void;
  /** URL-restored request to open the contextual receipt evidence surface. */
  receiptEvidenceRequested?: boolean;
  /** Keep the workspace URL in sync with the contextual evidence surface. */
  onReceiptEvidenceChange?: (open: boolean) => void;
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
  presentation = "dialog",
  onSaveAndNext,
  receiptEvidenceRequested = false,
  onReceiptEvidenceChange,
}: Props) {
  const { toast } = useToast();
  const { openPreview, patchPreview } = useAttachmentPreview();
  const patchPreviewRef = React.useRef(patchPreview);
  patchPreviewRef.current = patchPreview;
  const inboxPreviewSessionRef = React.useRef(0);
  const inboxPreviewIndexRef = React.useRef(0);
  const restoredReceiptExpenseIdRef = React.useRef<string | null>(null);
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
  const [items, setItems] = React.useState<string[]>([]);
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
  const vendorInputRef = React.useRef<HTMLInputElement>(null);
  const editActionRef = React.useRef<HTMLButtonElement>(null);
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
    if (!open || mode !== "edit") return;
    const frame = window.requestAnimationFrame(() => vendorInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, mode]);

  React.useEffect(() => {
    if (!expense) return;
    setVendorName(expense.vendorName ?? "");
    setAmount(String(getExpenseTotal(expense)));
    const nextProjectId = expense.lines[0]?.projectId ?? expense.headerProjectId ?? null;
    setProjectId(nextProjectId);
    setCostAllocation(expenseCostAllocationFromProjectId(nextProjectId));
    setWorkerId(expense.workerId ?? null);
    setCategory(expense.lines[0]?.category ?? "Other");
    const parsedDescription = parseExpenseDescription(expense.notes ?? "");
    setNotes(stripInboxUploadNoiseFromText(parsedDescription.description));
    setItems(parsedDescription.items);
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
  const displayedDescription = React.useMemo(() => {
    const parsed = parseExpenseDescription(expense?.notes ?? "");
    return {
      ...parsed,
      description: stripInboxUploadNoiseFromText(parsed.description),
    };
  }, [expense?.notes]);

  React.useEffect(() => {
    if (!open || !expense || receiptItems.length === 0) {
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
  const receiptPreviewPresentation = React.useMemo(
    () =>
      expense
        ? {
            kind: "receipt" as const,
            metadata: {
              merchant: (expense.vendorName ?? "").trim() || "Needs Review",
              expenseDate: formatDate(expense.date),
              amount: formatCurrency(getExpenseTotal(expense)),
              project: projectLabelFromExpense(expense, projectNameById),
              category: expense.lines[0]?.category?.trim() ?? "",
              paymentSource: expense.paymentAccountName || expense.paymentMethod,
              status: expenseStatusUiLabel(expense.status),
            },
          }
        : undefined,
    [expense, projectNameById]
  );

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

      restoredReceiptExpenseIdRef.current = expense.id;
      onReceiptEvidenceChange?.(true);
      openPreview({
        files: shellFiles,
        initialIndex,
        isLoading: false,
        presentation: receiptPreviewPresentation,
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
        onClosed: () => onReceiptEvidenceChange?.(false),
      });

      if (needsResolve) resolveAndPatch();
    },
    [
      expense,
      onReceiptEvidenceChange,
      openPreview,
      receiptItems,
      receiptPreviewPresentation,
      refreshSecureReceiptItems,
      toast,
    ]
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

      restoredReceiptExpenseIdRef.current = expense.id;
      onReceiptEvidenceChange?.(true);
      openPreview({
        files: shellFiles,
        initialIndex,
        isLoading: false,
        presentation: receiptPreviewPresentation,
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
        onClosed: () => onReceiptEvidenceChange?.(false),
      });

      if (needsResolve) resolveAndPatch();
    },
    [
      expense,
      onReceiptEvidenceChange,
      openPreview,
      receiptItems,
      receiptPreviewPresentation,
      refreshSecureReceiptItems,
      toast,
    ]
  );

  React.useEffect(() => {
    if (!receiptEvidenceRequested) {
      restoredReceiptExpenseIdRef.current = null;
      return;
    }
    if (!open || !expense || receiptItems.length === 0) return;
    if (restoredReceiptExpenseIdRef.current === expense.id) return;
    restoredReceiptExpenseIdRef.current = expense.id;
    openReceiptItemPreview(receiptItems[0]!);
  }, [expense, open, openReceiptItemPreview, receiptEvidenceRequested, receiptItems]);

  const handleSave = async (advanceAfterSave = false) => {
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
        notes: composeExpenseDescription(notes, items),
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
        if (advanceAfterSave) {
          onSaveAndNext?.();
        } else {
          window.requestAnimationFrame(() => editActionRef.current?.focus());
        }
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
    const parsedDescription = parseExpenseDescription(expense.notes ?? "");
    setNotes(stripInboxUploadNoiseFromText(parsedDescription.description));
    setItems(parsedDescription.items);
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
    window.requestAnimationFrame(() => editActionRef.current?.focus());
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
  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || mode !== "edit") return;
    event.preventDefault();
    event.stopPropagation();
    if (window.confirm("Discard unsaved expense changes?")) cancelEdit();
  };
  const requestPanelClose = () => {
    if (mode === "edit" && !window.confirm("Discard unsaved expense changes?")) return;
    onOpenChange(false);
  };

  const detailSurface = (
    <>
      {presentation === "panel" ? (
        <div className="expense-detail-panel-header shrink-0 border-b border-[var(--eo-border,var(--neo-border))] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="expense-detail-back h-11 w-11 shrink-0 rounded-md text-[var(--eo-text-secondary,var(--neo-text-secondary))] lg:hidden"
              aria-label="Back to expense queue"
              onClick={() => onOpenChange(false)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary,var(--neo-text-tertiary))]">
                {mode === "preview" ? "Expense detail" : "Editing expense"}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--eo-text-secondary,var(--neo-text-secondary))]">
                {formatDate(expense.date)} · {expenseStatusUiLabel(expense.status)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-11 w-11 shrink-0 rounded-md text-[var(--eo-text-secondary,var(--neo-text-secondary))] hover:bg-[var(--eo-surface-selected,var(--neo-surface-muted))] hover:text-[var(--eo-text-primary,var(--neo-text-primary))] lg:inline-flex"
              aria-label="Close expense detail"
              title="Close expense detail"
              disabled={saving || markBusy}
              onClick={requestPanelClose}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <DialogHeader className="shrink-0 border-b border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-[var(--neo-text-primary)]">
            {mode === "preview" ? "Expense" : "Edit expense"}
          </DialogTitle>
        </DialogHeader>
      )}

      <div
        data-expense-detail-body
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-4",
          presentation === "panel" && "expense-detail-panel-body px-5 py-5"
        )}
      >
        {mode === "preview" ? (
          presentation === "panel" ? (
            <div className="expense-detail-view space-y-6">
              <section data-expense-detail-identity aria-label="Expense identity">
                <p
                  data-expense-detail-amount
                  className="financial-nums text-[34px] font-semibold leading-[1.1] tracking-normal text-[var(--eo-text-primary,var(--neo-text-primary))] sm:text-[40px]"
                >
                  {formatCurrency(-getExpenseTotal(expense))}
                </p>
                <h2 className="mt-3 text-xl font-semibold leading-6 tracking-normal text-[var(--eo-text-primary,var(--neo-text-primary))]">
                  <span data-expense-detail-merchant>
                    {(expense.vendorName ?? "").trim() || "Needs Review"}
                  </span>
                </h2>
                <p
                  data-expense-detail-project
                  className="mt-1 text-[13px] font-medium leading-[18px] text-[var(--eo-text-secondary,var(--neo-text-secondary))]"
                >
                  {projectLabelFromExpense(expense, projectNameById)}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
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
              </section>

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

              <dl
                data-expense-detail-facts
                className="expense-detail-facts grid grid-cols-2 gap-x-5 gap-y-4 py-1"
              >
                <div>
                  <dt className={FIELD_LABEL}>Date</dt>
                  <dd className="mt-1 text-[13px] text-[var(--eo-text-primary,var(--neo-text-primary))]">
                    {formatDate(expense.date)}
                  </dd>
                </div>
                <div>
                  <dt className={FIELD_LABEL}>Category</dt>
                  <dd className="mt-1 truncate text-[13px] text-[var(--eo-text-primary,var(--neo-text-primary))]">
                    {expense.lines[0]?.category?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={FIELD_LABEL}>Payment source</dt>
                  <dd className="mt-1 text-[13px] text-[var(--eo-text-primary,var(--neo-text-primary))]">
                    {sourceTypeLabel(expense.sourceType)}
                  </dd>
                </div>
              </dl>

              <section aria-labelledby="expense-receipt-evidence-title">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3
                      id="expense-receipt-evidence-title"
                      className="text-[13px] font-semibold text-[var(--eo-text-primary,var(--neo-text-primary))]"
                    >
                      Receipt Evidence
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[var(--eo-text-secondary,var(--neo-text-secondary))]">
                      {receiptItems.length > 0
                        ? `${receiptItems.length} attachment${receiptItems.length === 1 ? "" : "s"}`
                        : "No receipt attached"}
                    </p>
                  </div>
                  <FileText
                    className="h-4 w-4 text-[var(--eo-text-tertiary,var(--neo-text-tertiary))]"
                    aria-hidden
                  />
                </div>
                <button
                  type="button"
                  data-expense-receipt-evidence
                  className="expense-evidence-action mt-3 flex min-h-20 w-full items-center justify-between gap-3 rounded-[7px] border border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-primary,var(--neo-surface-raised))] px-4 py-3 text-left transition-colors duration-120 hover:bg-[var(--eo-surface-secondary,var(--neo-surface-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))]"
                  onClick={() => {
                    const firstReceipt = receiptItems[0];
                    if (firstReceipt) void openReceiptItemPreview(firstReceipt);
                    else setMode("edit");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[var(--eo-text-primary,var(--neo-text-primary))]">
                      {receiptItems.length > 0 ? "Open receipt preview" : "Add receipt evidence"}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-[var(--eo-text-secondary,var(--neo-text-secondary))]">
                      {receiptItems.length > 0
                        ? "View the secured source document in context."
                        : "Use the existing protected attachment path."}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-[var(--eo-text-secondary,var(--neo-text-secondary))]">
                    {receiptItems.length > 0 ? "View" : "Attach"}
                  </span>
                </button>
              </section>

              <section>
                <h3 className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.description.label}</h3>
                <p className="mt-2 text-[13px] leading-5 text-[var(--eo-text-primary,var(--neo-text-primary))]">
                  {displayedDescription.description || "—"}
                </p>
              </section>

              <details className="expense-more-details group pt-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-1.5 py-2 text-[13px] font-medium text-[var(--eo-text-primary,var(--neo-text-primary))] outline-none transition-colors duration-120 hover:bg-[var(--eo-surface-secondary,var(--neo-surface-muted))] focus-visible:ring-2 focus-visible:ring-[var(--eo-focus-ring,var(--neo-border-strong))]">
                  More Details
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-180 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <dl className="expense-progressive-content grid grid-cols-2 gap-x-5 gap-y-4 pb-2 pt-3">
                  {displayedDescription.items.length > 0 ? (
                    <div className="col-span-2">
                      <dt className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.items.label}</dt>
                      <dd className="mt-1 text-[13px]">{displayedDescription.items.join(", ")}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.worker.label}</dt>
                    <dd className="mt-1 text-[13px]">
                      {expense.workerId
                        ? (workers.find((worker) => worker.id === expense.workerId)?.name ??
                          expense.workerId)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.paymentMethod.label}</dt>
                    <dd className="mt-1 text-[13px]">
                      {paymentMethodLabel(expense.paymentMethod)}
                    </dd>
                  </div>
                  <div>
                    <dt className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.paymentAccount.label}</dt>
                    <dd className="mt-1 text-[13px]">
                      {expense.paymentAccountName?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className={FIELD_LABEL}>Record</dt>
                    <dd className="mt-1 truncate font-mono text-[11px] text-[var(--eo-text-secondary,var(--neo-text-secondary))]">
                      {expense.id}
                    </dd>
                  </div>
                </dl>
              </details>
            </div>
          ) : (
            <div className="space-y-6">
              {possibleDuplicate ? (
                <p
                  className="rounded-md border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] px-2 py-1.5 text-xs text-[var(--eo-warning)]"
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
          )
        ) : (
          <div className="space-y-5">
            {presentation === "panel" ? (
              <section data-expense-inline-identity aria-label="Editing expense identity">
                <p
                  data-expense-inline-amount
                  className="financial-nums text-[34px] font-semibold leading-[1.1] tracking-normal text-[var(--eo-text-primary,var(--neo-text-primary))] sm:text-[40px]"
                >
                  {formatCurrency(-getExpenseTotal(expense))}
                </p>
                <h2
                  data-expense-inline-merchant
                  className="mt-3 text-xl font-semibold leading-6 tracking-normal text-[var(--eo-text-primary,var(--neo-text-primary))]"
                >
                  {(expense.vendorName ?? "").trim() || "Needs Review"}
                </h2>
                <p
                  data-expense-inline-project
                  className="mt-1 text-[13px] font-medium leading-[18px] text-[var(--eo-text-secondary,var(--neo-text-secondary))]"
                >
                  {projectLabelFromExpense(expense, projectNameById)}
                </p>
              </section>
            ) : null}
            <ModalSection title="Expense fields">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.vendor.label}</label>
                  <Input
                    ref={vendorInputRef}
                    data-testid="edit-expense-vendor-input"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className={INPUT_CLASS}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.amount.label}</label>
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
                  <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.classification.label}</label>
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
                  <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.project.label}</label>
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
                    <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.category.label}</label>
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
                  <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.date.label}</label>
                  <ExpenseDatePicker
                    id="inbox-preview-expense-date"
                    value={expenseDate}
                    onChange={setExpenseDate}
                    className={INPUT_CLASS}
                    disabled={saving}
                  />
                </div>
                {presentation === "dialog" ? (
                  <>
                    <WorkerEditField
                      value={workerRadixValue}
                      workers={workers}
                      saving={saving}
                      onChange={setWorkerId}
                    />
                    <PaymentSourceEditField
                      value={sourceType}
                      saving={saving}
                      onChange={setSourceType}
                    />
                  </>
                ) : null}
              </div>
            </ModalSection>

            <ProgressiveDisclosure enabled={presentation === "panel"}>
              <ModalSection title="Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ExpenseItemsField
                    idPrefix="edit-expense"
                    items={items}
                    onItemsChange={setItems}
                    disabled={saving}
                    labelClassName={FIELD_LABEL}
                    inputClassName={INPUT_CLASS}
                    selectTriggerClassName={SELECT_TRIGGER_CLASS}
                  />
                  <div className="space-y-1.5">
                    <label className={FIELD_LABEL}>{EXPENSE_FORM_FIELDS.description.label}</label>
                    <Textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={cn(INPUT_CLASS, "min-h-[88px] resize-y py-2")}
                      placeholder="Optional"
                      disabled={saving}
                      rows={3}
                    />
                  </div>
                </div>
              </ModalSection>

              <ModalSection title="Additional">
                {presentation === "panel" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <WorkerEditField
                      value={workerRadixValue}
                      workers={workers}
                      saving={saving}
                      onChange={setWorkerId}
                    />
                    <PaymentSourceEditField
                      value={sourceType}
                      saving={saving}
                      onChange={setSourceType}
                    />
                  </div>
                ) : null}
                <div className={presentation === "panel" ? "mt-4" : undefined}>
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
                </div>
              </ModalSection>

              <ModalSection title="Payment">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className={FIELD_LABEL}>
                        {EXPENSE_FORM_FIELDS.paymentMethod.label}
                      </label>
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
                      <label className={FIELD_LABEL}>
                        {EXPENSE_FORM_FIELDS.paymentAccount.label}
                      </label>
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

              <ModalSection title={EXPENSE_FORM_FIELDS.attachments.label}>
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
            </ProgressiveDisclosure>
          </div>
        )}
      </div>

      {mode === "preview" ? (
        <div className="expense-detail-actions flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-elevated,var(--neo-surface-raised))] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-1">
            {previewNav ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(PREVIEW_QUIET_BUTTON, "h-9 px-2.5")}
                  disabled={!previewNav.canPrev}
                  onClick={() => previewNav.onPrev()}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(PREVIEW_QUIET_BUTTON, "h-9 px-2.5")}
                  disabled={!previewNav.canNext}
                  onClick={() => previewNav.onNext()}
                >
                  Next
                </Button>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {presentation === "dialog" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(PREVIEW_SECONDARY_BUTTON, "h-9")}
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            ) : null}
            <Button
              ref={editActionRef}
              type="button"
              variant="outline"
              size="sm"
              className={cn(PREVIEW_SECONDARY_BUTTON, "h-11 min-h-11 px-5")}
              onClick={() => setMode("edit")}
            >
              {presentation === "panel" ? "Edit Expense" : "Edit"}
            </Button>
            {showMarkDone ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(PREVIEW_SECONDARY_BUTTON, "h-9 min-w-[108px]")}
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
        <div className="expense-detail-actions flex shrink-0 items-center justify-end gap-2 border-t border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-elevated,var(--neo-surface-raised))] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(PREVIEW_SECONDARY_BUTTON, "h-11 min-h-11")}
            disabled={saving}
            onClick={cancelEdit}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(PREVIEW_SECONDARY_BUTTON, "h-11 min-h-11 min-w-[88px] px-4")}
            disabled={saving}
            onClick={() => void handleSave(false)}
          >
            <SubmitSpinner loading={saving} className="mr-2" />
            Save
          </Button>
          {presentation === "panel" && onSaveAndNext ? (
            <Button
              type="button"
              size="sm"
              data-expense-save-and-next
              className={cn(
                PREVIEW_PRIMARY_BUTTON,
                "h-11 min-h-11 min-w-[132px] justify-center px-5"
              )}
              disabled={saving}
              onClick={() => void handleSave(true)}
            >
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving…" : "Save & Next"}
            </Button>
          ) : null}
        </div>
      )}
    </>
  );

  if (presentation === "panel") {
    if (!open) return null;
    return (
      <aside
        data-expense-detail-panel
        data-expense-detail-mode={mode}
        aria-label={mode === "preview" ? "Expense detail" : "Edit expense"}
        className="expense-detail-panel expenses-ui-dialog flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--eo-border,var(--neo-border))] bg-[var(--eo-surface-elevated,var(--neo-surface-raised))] text-[var(--eo-text-primary,var(--neo-text-primary))]"
        onKeyDown={handlePanelKeyDown}
      >
        {detailSurface}
      </aside>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(event) => {
          if (eventTargetsAttachmentPreviewModal(event)) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (eventTargetsAttachmentPreviewModal(event)) event.preventDefault();
        }}
        className="expenses-ui-dialog flex max-h-[min(92vh,820px)] w-full max-w-[560px] flex-col gap-0 overflow-hidden border-[var(--neo-border)] bg-[var(--neo-surface-base)] p-0 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]"
      >
        {detailSurface}
      </DialogContent>
    </Dialog>
  );
}
