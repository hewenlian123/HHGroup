"use client";

import * as React from "react";
import {
  NeoAmount,
  NeoMobileCard,
  NeoStatus,
  NeoTable,
  RowActionsMenu as BaseRowActionsMenu,
  type StatusBadgeVariant,
} from "@/components/base";
import { getExpenseTotal, type Expense, type PaymentAccountRow } from "@/lib/data";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronRight, Copy, Paperclip, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { tableRawThClass } from "@/components/ui/table";
import {
  expenseHasCategoryForWorkflow,
  expenseHasRequiredProjectForWorkflow,
  expenseNeedsReviewFromDb,
  expenseSourceTypeIsWorkerReimbursement,
} from "@/lib/expense-workflow-status";
import {
  isInboxUploadExpenseReference,
  stripInboxUploadNoiseFromText,
} from "@/lib/inbox-upload-constants";
import { getExpenseReceiptItems } from "@/lib/expense-receipt-items";
import {
  readDateGroupExpandedMap,
  writeDateGroupExpandedMap,
  type ExpenseDateGroup,
} from "@/lib/expense-list-date-groups";
import {
  getExpenseHeaderLineMismatch,
  type ExpenseHeaderLineMismatch,
  type ExpenseIssueFocus,
} from "@/lib/expense-header-line-mismatch";
import { ExpenseBulkActionBar } from "./expense-bulk-action-bar";
import { formatCurrency, formatDate } from "@/lib/formatters";

type InboxIssueId = "receipt" | "project" | "category" | "worker" | "duplicate";

type InboxIssue = {
  id: InboxIssueId;
  label: string;
  detail: string;
};

const EXPENSE_INBOX_DISMISSED_ISSUE_PREFIX = "hh.expenseInbox.dismissedIssue";
const EXPENSE_ISSUE_POPOVER_CLOSE_DELAY_MS = 140;

let activeExpenseIssuePopover: { id: symbol; close: () => void } | null = null;

function expenseInboxDismissedIssueKey(expenseId: string, issueId: InboxIssueId): string {
  return `${EXPENSE_INBOX_DISMISSED_ISSUE_PREFIX}.${expenseId}.${issueId}`;
}

function readDismissedIssueIds(
  expenseId: string,
  issueIds: readonly InboxIssueId[]
): Set<InboxIssueId> {
  const dismissed = new Set<InboxIssueId>();
  if (typeof window === "undefined") return dismissed;
  for (const issueId of issueIds) {
    try {
      if (window.localStorage.getItem(expenseInboxDismissedIssueKey(expenseId, issueId)) === "1") {
        dismissed.add(issueId);
      }
    } catch {
      return dismissed;
    }
  }
  return dismissed;
}

function ExpenseReceiptCell({
  row,
  onReceiptPreview,
  onReceiptPrefetch,
  onMissingReceipt,
  touch = false,
}: {
  row: Expense;
  onReceiptPreview: () => void;
  onReceiptPrefetch?: () => void;
  onMissingReceipt: () => void;
  touch?: boolean;
}) {
  const items = React.useMemo(() => getExpenseReceiptItems(row), [row]);
  const hasReceipt = items.length > 0;
  const touchPrimedRef = React.useRef(false);
  React.useEffect(() => {
    touchPrimedRef.current = false;
  }, [row.id]);

  if (!hasReceipt) {
    return (
      <button
        type="button"
        data-expense-receipt-state="missing"
        data-expense-issue-indicator="missing-receipt"
        className={cn(
          "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium text-[var(--eo-warning)] outline-none transition-colors hover:bg-[var(--eo-warning-soft)] focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]",
          touch && "h-11 min-h-11 px-2 md:h-7 md:min-h-0"
        )}
        onClick={(event) => {
          event.stopPropagation();
          onMissingReceipt();
        }}
        aria-label="Missing receipt. Open expense to attach receipt"
        title="Missing receipt · Add in expense details"
      >
        <Paperclip className="h-3 w-3 shrink-0 opacity-70" strokeWidth={1.8} aria-hidden />
        <span>Missing</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-expense-receipt-state="attached"
      className={cn(
        "inline-flex h-7 max-h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none text-[var(--neo-text-primary)] outline-none transition-colors hover:bg-emerald-500/[0.08] hover:text-[var(--neo-emerald)] focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]",
        touch && "h-11 max-h-none min-h-11 md:h-7 md:max-h-7 md:min-h-0"
      )}
      onMouseEnter={() => onReceiptPrefetch?.()}
      onTouchStart={() => {
        if (touchPrimedRef.current) return;
        touchPrimedRef.current = true;
        onReceiptPrefetch?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onReceiptPreview();
      }}
      aria-label={
        items.length > 1
          ? `Receipt attached. Preview ${items.length} files`
          : "Receipt attached. Preview receipt"
      }
      title="Receipt attached · Preview"
    >
      <Paperclip className="h-3 w-3 shrink-0 opacity-75" strokeWidth={2} aria-hidden />
      <span>{items.length > 1 ? `${items.length} files` : "Receipt"}</span>
    </button>
  );
}

function inboxProjectIssueRequired(expense: Expense): boolean {
  return !expenseHasRequiredProjectForWorkflow(expense);
}

function inboxWorkerIssueRequired(expense: Expense): boolean {
  return expenseSourceTypeIsWorkerReimbursement(expense.sourceType) && !expense.workerId;
}

function buildInboxIssues({
  missingReceipt,
  missingProject,
  missingCategory,
  missingWorker,
  duplicate,
  rowTotal,
}: {
  missingReceipt: boolean;
  missingProject: boolean;
  missingCategory: boolean;
  missingWorker: boolean;
  duplicate: boolean;
  rowTotal: number;
}): InboxIssue[] {
  const issues: InboxIssue[] = [];
  if (missingReceipt) {
    issues.push({
      id: "receipt",
      label: "Missing receipt",
      detail: "Attach or confirm a receipt before completing this expense review.",
    });
  }
  if (missingProject) {
    issues.push({
      id: "project",
      label: "Missing project",
      detail: "Assign a project before moving this expense out of review.",
    });
  }
  if (missingCategory) {
    issues.push({
      id: "category",
      label: "Missing category",
      detail: "Choose a category so the expense can be classified.",
    });
  }
  if (missingWorker) {
    issues.push({
      id: "worker",
      label: "Missing worker",
      detail: "Select a worker before approving this reimbursement expense.",
    });
  }
  if (duplicate) {
    issues.push({
      id: "duplicate",
      label: "Possible duplicate amount",
      detail: `Possible duplicate amount: ${formatCurrency(rowTotal)}. Another loaded expense has a similar vendor, date, and amount.`,
    });
  }
  return issues;
}

function ExpenseIssuesCell({
  expenseId,
  issues,
  touch = false,
  informational = false,
}: {
  expenseId: string;
  issues: InboxIssue[];
  touch?: boolean;
  informational?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [dismissedIssueIds, setDismissedIssueIds] = React.useState<Set<InboxIssueId>>(
    () => new Set()
  );
  const instanceIdRef = React.useRef(Symbol("expense-issue-popover"));
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const previewAnchorRef = React.useRef<HTMLSpanElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInsideTriggerRef = React.useRef(false);
  const pointerInsideContentRef = React.useRef(false);
  const lastPointerTypeRef = React.useRef<string | null>(null);
  const openSourceRef = React.useRef<"pointer" | "focus" | "touch">("pointer");
  const restoreFocusOnCloseRef = React.useRef(false);
  const suppressFocusOpenRef = React.useRef(false);
  const issueIdsKey = issues.map((issue) => issue.id).join("|");

  React.useEffect(() => {
    const issueIds = issueIdsKey.split("|").filter(Boolean) as InboxIssueId[];
    setDismissedIssueIds(readDismissedIssueIds(expenseId, issueIds));
  }, [expenseId, issueIdsKey]);

  const visibleIssues = issues.filter((issue) => !dismissedIssueIds.has(issue.id));
  const issueCountLabel = `${visibleIssues.length} ${visibleIssues.length === 1 ? "issue" : "issues"}`;

  const clearPendingClose = React.useCallback(() => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closePopover = React.useCallback(() => {
    clearPendingClose();
    pointerInsideTriggerRef.current = false;
    pointerInsideContentRef.current = false;
    if (activeExpenseIssuePopover?.id === instanceIdRef.current) {
      activeExpenseIssuePopover = null;
    }
    setOpen(false);
  }, [clearPendingClose]);

  const openPopover = React.useCallback(
    (source: "pointer" | "focus" | "touch") => {
      clearPendingClose();
      if (activeExpenseIssuePopover && activeExpenseIssuePopover.id !== instanceIdRef.current) {
        activeExpenseIssuePopover.close();
      }
      activeExpenseIssuePopover = {
        id: instanceIdRef.current,
        close: closePopover,
      };
      openSourceRef.current = source;
      restoreFocusOnCloseRef.current = false;
      setOpen(true);
    },
    [clearPendingClose, closePopover]
  );

  const focusRemainsInside = React.useCallback(() => {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    return Boolean(
      triggerRef.current?.contains(activeElement) ||
      previewAnchorRef.current?.contains(activeElement) ||
      contentRef.current?.contains(activeElement)
    );
  }, []);

  const scheduleClose = React.useCallback(() => {
    clearPendingClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (
        pointerInsideTriggerRef.current ||
        pointerInsideContentRef.current ||
        focusRemainsInside()
      ) {
        return;
      }
      closePopover();
    }, EXPENSE_ISSUE_POPOVER_CLOSE_DELAY_MS);
  }, [clearPendingClose, closePopover, focusRemainsInside]);

  React.useEffect(
    () => () => {
      clearPendingClose();
      if (activeExpenseIssuePopover?.id === instanceIdRef.current) {
        activeExpenseIssuePopover = null;
      }
    },
    [clearPendingClose]
  );

  React.useEffect(() => {
    if (visibleIssues.length === 0 && open) closePopover();
  }, [closePopover, open, visibleIssues.length]);

  const dismissIssue = React.useCallback(
    (issue: InboxIssue) => {
      setDismissedIssueIds((prev) => new Set(prev).add(issue.id));
      try {
        window.localStorage.setItem(expenseInboxDismissedIssueKey(expenseId, issue.id), "1");
      } catch {
        /* localStorage may be unavailable; in-memory dismissal still applies for this render. */
      }
    },
    [expenseId]
  );

  if (visibleIssues.length === 0) {
    return (
      <span
        data-testid="expense-inbox-issues"
        data-expense-issue-state="clear"
        className={cn(
          "inline-flex h-6 items-center justify-center text-[11px] font-medium text-[var(--neo-text-tertiary)]",
          !touch && "min-w-6"
        )}
        aria-label="No issues"
      >
        Clear
      </span>
    );
  }

  return (
    <span
      data-testid="expense-inbox-issues"
      data-expense-issue-state="attention"
      className="inline-flex max-w-full justify-center"
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        pointerInsideTriggerRef.current = true;
        openPopover("pointer");
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        pointerInsideTriggerRef.current = false;
        scheduleClose();
      }}
    >
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            if (!informational) openPopover("focus");
            return;
          }
          closePopover();
        }}
      >
        {informational ? (
          <PopoverAnchor asChild>
            <span
              ref={previewAnchorRef}
              tabIndex={0}
              data-expense-issue-indicator="count"
              data-expense-row-passive
              className={cn(
                "inline-flex h-6 max-h-6 min-w-6 items-center justify-center gap-1 px-1 text-[11px] font-semibold leading-none text-[var(--eo-warning)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]",
                touch &&
                  "h-11 max-h-none min-h-11 min-w-11 px-2 md:h-6 md:max-h-6 md:min-h-0 md:min-w-6"
              )}
              aria-label={`${issueCountLabel}: ${visibleIssues.map((issue) => issue.label).join(", ")}`}
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onFocus={() => {
                if (suppressFocusOpenRef.current) return;
                openPopover("focus");
              }}
              onBlur={scheduleClose}
            >
              <span className="text-[10px] leading-none" aria-hidden>
                ⚠
              </span>
              <span className="tabular-nums">{visibleIssues.length}</span>
            </span>
          </PopoverAnchor>
        ) : (
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              data-expense-issue-indicator="count"
              className={cn(
                "inline-flex h-6 max-h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold leading-none text-[var(--eo-warning)] transition-colors hover:bg-[var(--neo-surface-muted)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]",
                touch &&
                  "h-11 max-h-none min-h-11 min-w-11 px-2 md:h-6 md:max-h-6 md:min-h-0 md:min-w-6"
              )}
              aria-label={`${issueCountLabel}: ${visibleIssues.map((issue) => issue.label).join(", ")}`}
              onPointerDown={(event) => {
                lastPointerTypeRef.current = event.pointerType;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  lastPointerTypeRef.current = null;
                }
              }}
              onFocus={() => {
                if (suppressFocusOpenRef.current) return;
                const pointerType = lastPointerTypeRef.current;
                openPopover(pointerType === "touch" ? "touch" : pointerType ? "pointer" : "focus");
              }}
              onBlur={scheduleClose}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const pointerType = lastPointerTypeRef.current;
                lastPointerTypeRef.current = null;
                openPopover(pointerType === "touch" ? "touch" : "focus");
              }}
            >
              <span className="text-[10px] leading-none" aria-hidden>
                ⚠
              </span>
              <span className="tabular-nums">{visibleIssues.length}</span>
            </button>
          </PopoverTrigger>
        )}
        <PopoverContent
          ref={contentRef}
          data-testid="expense-inbox-issue-popover"
          data-expense-component-surface="issue"
          className="expenses-ui-dialog w-72 p-2"
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            pointerInsideContentRef.current = true;
            clearPendingClose();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "touch") return;
            pointerInsideContentRef.current = false;
            scheduleClose();
          }}
          onFocusCapture={() => {
            clearPendingClose();
          }}
          onBlurCapture={scheduleClose}
          onOpenAutoFocus={(event) => {
            if (openSourceRef.current !== "focus") event.preventDefault();
          }}
          onEscapeKeyDown={() => {
            restoreFocusOnCloseRef.current = true;
          }}
          onPointerDownOutside={(event) => {
            const outsideTarget = event.detail.originalEvent.target;
            if (
              informational &&
              outsideTarget instanceof Node &&
              previewAnchorRef.current?.contains(outsideTarget)
            ) {
              event.preventDefault();
              return;
            }
            restoreFocusOnCloseRef.current = false;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!restoreFocusOnCloseRef.current) return;
            restoreFocusOnCloseRef.current = false;
            suppressFocusOpenRef.current = true;
            (informational ? previewAnchorRef.current : triggerRef.current)?.focus();
            window.setTimeout(() => {
              suppressFocusOpenRef.current = false;
            }, 0);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1.5">
            {visibleIssues.map((issue) => (
              <div key={issue.id} className="flex gap-2 rounded-md px-1.5 py-1.5">
                {issue.id === "duplicate" ? (
                  <Copy
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--neo-text-tertiary)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="mt-[-1px] inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] font-semibold leading-none text-[var(--eo-warning)]"
                    aria-hidden
                  >
                    ⚠
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium leading-tight text-[var(--neo-text-primary)]">
                    {issue.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--neo-text-secondary)]">
                    {issue.detail}
                  </p>
                </div>
                <button
                  type="button"
                  className="ml-1 inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[11px] font-medium text-[var(--neo-text-tertiary)] transition-colors duration-150 hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]"
                  aria-label={`Dismiss ${issue.label}`}
                  title="Hide this issue"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissIssue(issue);
                  }}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

function ExpenseHeaderLineMismatchIssueCell({
  mismatch,
  onReviewIssue,
  touch = false,
}: {
  mismatch: ExpenseHeaderLineMismatch;
  onReviewIssue: (event: React.MouseEvent<HTMLButtonElement>) => void;
  touch?: boolean;
}) {
  return (
    <div
      data-testid="expense-header-line-mismatch-issue"
      className={cn(
        "w-full rounded-lg border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] px-2 py-1.5 text-left shadow-[inset_2px_0_0_var(--eo-warning)]",
        touch && "px-2.5 py-2"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-[var(--neo-text-secondary)]">
        <span className="font-semibold text-[var(--eo-warning)]">
          Header: <span className="tabular-nums">{formatCurrency(mismatch.headerTotal)}</span>
        </span>
        <span className="tabular-nums">Lines: {formatCurrency(mismatch.linesTotal)}</span>
        <span className="tabular-nums">Diff: {formatCurrency(mismatch.absDifference)}</span>
      </div>
      <button
        type="button"
        data-testid="expense-review-issue-button"
        className={cn(
          "mt-1 inline-flex h-7 items-center rounded-md border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] px-2 text-[11px] font-medium text-[var(--eo-warning)] transition-colors duration-150 hover:bg-[var(--eo-warning-soft)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]",
          touch && "h-11 min-h-11"
        )}
        onClick={onReviewIssue}
      >
        Review issue
      </button>
    </div>
  );
}

/** Strip inbox dedupe tokens / noise from vendor strings for display only (does not change stored data). */
function expenseVendorDisplayRaw(raw: string | undefined | null): string {
  return stripInboxUploadNoiseFromText(String(raw ?? "")).trim();
}

/** Strip E2E test prefix from project display names (e.g. "E2E-PM-HH Unified" → "HH Unified"). */
function stripE2EProjectPrefix(name: string): string {
  const s = name.trim();
  const stripped = s
    .replace(/^\s*E2E(?:-\w+)+-\s*/i, "")
    .replace(/^\s*E2E[\s_-]+/i, "")
    .trim();
  return stripped !== "" ? stripped : s;
}

function projectLabel(expense: Expense, projectNameById: Map<string, string>): string {
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
    const raw = projectNameById.get(id) ?? id;
    return stripE2EProjectPrefix(String(raw));
  }
  return "Multiple";
}

/** E2E / smoke / empty → treat as synthetic; show “Unknown Vendor” + raw id on line 2. */
function looksLikeTestOrSyntheticVendor(vendor: string): boolean {
  const v = (vendor ?? "").trim();
  if (!v) return true;
  if (/^unknown$/i.test(v)) return true;
  if (/^smokevendor/i.test(v)) return true;
  if (/^E2E[-_]?/i.test(v)) return true;
  if (/^test[-_]/i.test(v)) return true;
  if (/^rq[-_]/i.test(v)) return true;
  return false;
}

function inboxPrimaryVendorTitle(vendor: string): string {
  if (looksLikeTestOrSyntheticVendor(vendor)) return "Unknown Vendor";
  return (vendor ?? "").trim() || "Unknown Vendor";
}

function expenseDescriptionDisplayLabel(e: Expense): string {
  return stripInboxUploadNoiseFromText(e.notes ?? "").trim();
}

function isInternalPaymentDisplayValue(value: string): boolean {
  return /\b[A-Z]{2,}-PM-(?:[A-Z0-9]+)(?:[-_]|$)/i.test(value.trim());
}

function cleanPaymentDisplayValue(value: string | undefined | null): string {
  const cleaned = stripInboxUploadNoiseFromText(value ?? "").trim();
  if (!cleaned || isInternalPaymentDisplayValue(cleaned)) return "";
  return cleaned;
}

function expensePaymentSourceDisplayLabel(e: Expense): string {
  const account = cleanPaymentDisplayValue(e.paymentAccountName);
  if (account) return account;
  const card = cleanPaymentDisplayValue(e.cardName);
  if (card) return card;
  return paymentMethodDisplayLabel(e.paymentMethod);
}

/** Merchant context stays descriptive; payment source has its own explicit column/context line. */
function inboxSecondaryMetaLine(e: Expense): string {
  const description = expenseDescriptionDisplayLabel(e);
  if (description) return description;
  return "No description";
}

function paymentMethodDisplayLabel(pm: string | undefined): string {
  const v = cleanPaymentDisplayValue(pm);
  return v !== "" ? v : "—";
}

function primaryCategory(e: Expense): string {
  const c = e.lines[0]?.category;
  return c && c.trim() !== "" ? c : "—";
}

function inboxSubtitleDate(iso: string | undefined): string {
  return formatDate(iso, "compact");
}

/** Row opens preview unless the click started on an interactive control. */
function inboxRowActivateIgnored(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(
    el.closest(
      "button, a, input, textarea, select, [role='checkbox'], [role='combobox'], [role='menuitem'], [data-radix-collection-item], [data-expense-row-passive]"
    )
  );
}

function inboxStatusMeta(status: string | undefined): {
  label: string;
  variant: StatusBadgeVariant;
} {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (s === "draft") {
    return { label: "Draft", variant: "muted" };
  }
  if (s === "rejected") {
    return { label: "Rejected", variant: "danger" };
  }
  if (s === "approved") {
    return { label: "Approved", variant: "success" };
  }
  if (expenseNeedsReviewFromDb(status)) {
    return {
      label: "Needs Review",
      variant: "warning",
    };
  }
  return {
    label: "Done",
    variant: "success",
  };
}

function ExpenseStatusCell({
  status,
  className,
}: {
  status: string | undefined;
  className?: string;
}) {
  const inboxSt = inboxStatusMeta(status);
  const shouldUsePill =
    inboxSt.label === "Draft" || inboxSt.label === "Needs Review" || inboxSt.label === "Rejected";

  if (shouldUsePill) {
    return (
      <NeoStatus
        label={inboxSt.label}
        variant={inboxSt.variant}
        className={cn("h-6 max-h-6 px-1.5 text-[10px]", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap text-[11px] font-medium leading-none",
        className
      )}
      title={inboxSt.label}
    >
      <span
        data-testid="expense-status-inline-dot"
        className="inline-block text-[9px] leading-none text-[rgb(79_175_124_/_0.58)]"
        aria-hidden
      >
        ●
      </span>{" "}
      <span data-testid="expense-status-inline-label" className="text-[rgb(79_175_124_/_0.82)]">
        {inboxSt.label}
      </span>
    </span>
  );
}

export type ExpenseInboxApi = {
  listView: "all" | "unreviewed";
  /** localStorage pool for date-section expand preferences */
  dateGroupPool: "inbox" | "expenses";
  /** Expand every date group (search / filters active) */
  autoExpandDateGroups: boolean;
  /** Date keys that must stay expanded for a System Health focus target. */
  forceExpandedDateKeys?: ReadonlySet<string> | null;
  /** System Health issue context for one focused expense row. */
  expenseIssueFocus?: ExpenseIssueFocus | null;
  /** Expense row id focused from System Health. */
  focusedExpenseId?: string | null;
  activeExpenseId: string | null;
  setActiveExpenseId: (id: string | null) => void;
  rowElsRef: React.MutableRefObject<Record<string, HTMLTableRowElement | HTMLLIElement | null>>;
  projectNameById: Map<string, string>;
  deletingExpenseId: string | null;
  toggleStatus: (expense: Expense) => void;
  openReceiptPreview: (row: Expense) => void;
  /** Warm signed receipt URLs on hover / first touch (desktop / mobile). */
  prefetchReceiptUrls?: (row: Expense) => void;
  openExpensePreview: (row: Expense, opts?: { mode?: "preview" | "edit" }) => void;
  handleDelete: (expense: Expense) => void;
  /** `INBOX-UP-*` `referenceNo` values to flash after upload deep-link. */
  highlightReferenceNos?: ReadonlySet<string> | null;
};

/** Bulk operations: parent runs sequential API calls + cache updates. */
export type ExpenseListBulkActionsApi = {
  pool: "inbox" | "expenses";
  busy: boolean;
  projects: { id: string; name: string | null }[];
  categories: string[];
  paymentAccounts: PaymentAccountRow[];
  runMarkDone: (ids: string[]) => Promise<void>;
  runSetProject: (ids: string[], projectId: string | null) => Promise<void>;
  runSetCategory: (ids: string[], category: string) => Promise<void>;
  runSetPayment: (ids: string[], paymentAccountId: string | null) => Promise<void>;
  /** Return `false` on cancel or hard failure — selection is kept. Otherwise clear selection. */
  runDeleteMany: (ids: string[]) => Promise<boolean | void>;
};

const InboxCtx = React.createContext<ExpenseInboxApi | null>(null);

const DESKTOP_TABLE_MIN_WIDTH_PX = 960;

/** Avoid duplicate row refs: desktop table vs mobile list only one mounts. */
function useDesktopTableLayout(containerRef: React.RefObject<HTMLElement | null>): boolean {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => {
    const apply = () => {
      const width = containerRef.current?.clientWidth ?? 0;
      setDesktop(width >= DESKTOP_TABLE_MIN_WIDTH_PX);
    };
    apply();
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", apply);
      return () => window.removeEventListener("resize", apply);
    }
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);
  return desktop;
}

function useInbox(): ExpenseInboxApi {
  const v = React.useContext(InboxCtx);
  if (!v) throw new Error("ExpenseInboxTransactionList: missing provider");
  return v;
}

function RowActionsMenu({ row }: { row: Expense }) {
  const a = useInbox();
  const status = row.status ?? "pending";
  const showMarkDone = expenseNeedsReviewFromDb(status);
  const inboxUploadRow = isInboxUploadExpenseReference(row.referenceNo);

  return (
    <BaseRowActionsMenu
      ariaLabel="Row actions"
      appearance="list"
      className="h-11 min-h-11 w-11 min-w-11 opacity-100 md:h-8 md:min-h-0 md:w-8 md:min-w-0 md:opacity-0 md:p-1.5 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
      contentClassName="expenses-ui-dialog w-44"
      destructiveItemClassName="mt-1 border-t border-[var(--neo-border)] pt-2 text-rose-600 focus:text-rose-600 hover:bg-rose-600 hover:text-white dark:text-rose-400 dark:focus:text-rose-400"
      actions={[
        {
          label: "Edit",
          onClick: () => a.openExpensePreview(row, { mode: "edit" }),
        },
        ...(showMarkDone
          ? [
              {
                label: inboxUploadRow ? "Approve" : "Mark Done",
                onClick: () => a.toggleStatus(row),
              },
            ]
          : []),
        {
          label: (
            <span className="inline-flex items-center gap-2">
              <SubmitSpinner loading={a.deletingExpenseId === row.id} className="shrink-0" />
              {a.deletingExpenseId !== row.id ? (
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : null}
              Delete
            </span>
          ),
          destructive: true,
          disabled: a.deletingExpenseId === row.id,
          onClick: () => a.handleDelete(row),
        },
      ]}
    />
  );
}

const COL_COUNT = 10;

function DateGroupDesktopHeader({
  chunk,
  expanded,
  autoExpand,
  onToggle,
  groupSelect,
  ledgerMode,
}: {
  chunk: ExpenseDateGroup;
  expanded: boolean;
  autoExpand: boolean;
  onToggle: () => void;
  ledgerMode: boolean;
  groupSelect?: {
    show: boolean;
    checked: boolean;
    indeterminate: boolean;
    onToggleGroup: () => void;
  };
}) {
  const groupCbRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const el = groupCbRef.current;
    if (el) el.indeterminate = Boolean(groupSelect?.indeterminate);
  }, [groupSelect?.indeterminate, groupSelect?.show]);

  return (
    <tr
      data-expense-date-group={ledgerMode ? "desktop" : undefined}
      className={cn(
        "border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)]",
        ledgerMode && "expense-ledger-date-group"
      )}
    >
      <td colSpan={COL_COUNT} className="p-0 align-middle">
        <div className="flex min-w-0 items-stretch">
          {groupSelect?.show ? (
            <div className="flex shrink-0 items-center border-r border-[var(--neo-border)] px-2">
              <input
                ref={groupCbRef}
                type="checkbox"
                checked={groupSelect.checked}
                onChange={groupSelect.onToggleGroup}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 shrink-0 rounded border-[var(--neo-border)] text-[var(--neo-gold)]"
                aria-label={`Select all for ${chunk.dateLabel}`}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            disabled={autoExpand}
            aria-expanded={expanded}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-200 ease-out md:min-h-0",
              "hover:bg-[var(--neo-surface-raised)] disabled:cursor-default disabled:hover:bg-transparent"
            )}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-[var(--neo-text-secondary)] transition-transform duration-200 ease-out",
                expanded && "rotate-90"
              )}
              aria-hidden
            />
            <span className="font-medium text-[var(--neo-text-primary)]">{chunk.dateLabel}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[var(--neo-text-secondary)]">
              <span className="tabular-nums">{chunk.itemCount}</span>
              <span aria-hidden>·</span>
              <NeoAmount tone="expense" className="text-[12px]">
                {formatCurrency(-chunk.totalAmount)}
              </NeoAmount>
              {chunk.missingReceiptCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-[var(--eo-warning)]">
                    {chunk.missingReceiptCount} missing receipt
                    {chunk.missingReceiptCount !== 1 ? "s" : ""}
                  </span>
                </>
              ) : null}
            </span>
          </button>
        </div>
      </td>
    </tr>
  );
}

function DesktopRows({
  dateChunks,
  expandedByDate,
  autoExpandDateGroups,
  onToggleDateKey,
  possibleDuplicateIds,
  selectedIds,
  selectionEnabled,
  showSelectionUi,
  toggleSelected,
  onGutterSelect,
  onModifierRowClick,
  onToggleDateGroupRows,
}: {
  dateChunks: ExpenseDateGroup[];
  expandedByDate: Record<string, boolean>;
  autoExpandDateGroups: boolean;
  onToggleDateKey: (dateKey: string, chunkIndex: number) => void;
  possibleDuplicateIds: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  selectionEnabled: boolean;
  showSelectionUi: boolean;
  toggleSelected: (id: string, checked: boolean) => void;
  onGutterSelect: (id: string) => void;
  onModifierRowClick: (id: string, shiftKey: boolean) => void;
  onToggleDateGroupRows: (rowIds: string[]) => void;
}) {
  const a = useInbox();
  const triageLayout = a.dateGroupPool === "inbox";
  const ledgerMode = !triageLayout;
  const dupIds = possibleDuplicateIds;

  const projectTextClass = cn(
    "block max-w-[10.5rem] truncate text-[13px] leading-tight text-[var(--neo-text-secondary)]",
    ledgerMode ? "font-medium opacity-90" : "font-normal opacity-75"
  );
  const categoryTextClass = cn(
    "block max-w-[6.5rem] truncate text-[12px] leading-tight text-[var(--neo-text-secondary)]",
    "font-normal"
  );
  const sourceClass = cn(
    "block max-w-[6.5rem] truncate text-[11px] leading-tight text-[var(--neo-text-secondary)]",
    ledgerMode ? "font-normal opacity-85" : "font-medium"
  );

  return (
    <>
      {dateChunks.map((chunk, chunkIdx) => {
        const forceExpanded = a.forceExpandedDateKeys?.has(chunk.dateKey) ?? false;
        const expanded =
          forceExpanded ||
          autoExpandDateGroups ||
          (expandedByDate[chunk.dateKey] !== undefined
            ? expandedByDate[chunk.dateKey]
            : chunkIdx === 0);
        const rowIds = chunk.rows.map((r) => r.id);
        const selIn = rowIds.filter((id) => selectedIds.has(id)).length;
        const groupSelect =
          selectionEnabled && showSelectionUi
            ? {
                show: true as const,
                checked: selIn === rowIds.length && rowIds.length > 0,
                indeterminate: selIn > 0 && selIn < rowIds.length,
                onToggleGroup: () => onToggleDateGroupRows(rowIds),
              }
            : undefined;
        return (
          <React.Fragment key={`dgrp-${chunk.dateKey}-${chunkIdx}`}>
            <DateGroupDesktopHeader
              chunk={chunk}
              expanded={expanded}
              autoExpand={autoExpandDateGroups || forceExpanded}
              onToggle={() => onToggleDateKey(chunk.dateKey, chunkIdx)}
              groupSelect={groupSelect}
              ledgerMode={ledgerMode}
            />
            {expanded
              ? chunk.rows.map((row) => {
                  const rowTotal = getExpenseTotal(row);
                  const projLabel = projectLabel(row, a.projectNameById);
                  const status = row.status ?? "pending";
                  const catLabel = primaryCategory(row);
                  const missingReceipt = getExpenseReceiptItems(row).length === 0;
                  const missingProject = inboxProjectIssueRequired(row);
                  const missingCategory = !expenseHasCategoryForWorkflow(row);
                  const missingWorker = inboxWorkerIssueRequired(row);
                  const showDupHint = dupIds.has(row.id);
                  const issues = buildInboxIssues({
                    missingReceipt,
                    missingProject,
                    missingCategory,
                    missingWorker,
                    duplicate: showDupHint,
                    rowTotal,
                  });
                  const headerLineMismatch = getExpenseHeaderLineMismatch(
                    row,
                    a.expenseIssueFocus?.expenseId === row.id ? a.expenseIssueFocus.issue : null
                  );
                  const vendorRaw = row.vendorName ?? "";
                  const vendorClean = expenseVendorDisplayRaw(vendorRaw);
                  const vendorTitle = inboxPrimaryVendorTitle(vendorClean);
                  const secondaryLine = inboxSecondaryMetaLine(row);
                  const rowSelected = selectedIds.has(row.id);
                  const uploadHighlight =
                    !!row.referenceNo && (a.highlightReferenceNos?.has(row.referenceNo) ?? false);
                  const isInboxUploadDraft = isInboxUploadExpenseReference(row.referenceNo);
                  const systemHealthFocused = a.focusedExpenseId === row.id;
                  const hasException =
                    missingReceipt || issues.length > 0 || Boolean(headerLineMismatch);

                  return (
                    <tr
                      key={`desk-${row.id}`}
                      data-expense-id={row.id}
                      data-expense-active={a.activeExpenseId === row.id ? "true" : "false"}
                      data-expense-has-exception={ledgerMode && hasException ? "true" : undefined}
                      data-system-health-focus={systemHealthFocused ? "true" : undefined}
                      data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                      aria-selected={ledgerMode && selectionEnabled ? rowSelected : undefined}
                      ref={(el) => {
                        a.rowElsRef.current[row.id] = el;
                      }}
                      className={cn(
                        "expense-row-continuity exp-row group h-12 cursor-pointer bg-[var(--neo-surface-raised)] transition-[background-color,box-shadow] duration-150 ease-out hover:bg-[var(--neo-surface-muted)] [&>td]:align-middle [&>td]:px-2.5 [&>td]:py-1",
                        ledgerMode ? "border-b-0" : "border-b border-[var(--neo-border)]",
                        a.deletingExpenseId === row.id &&
                          "pointer-events-none opacity-0 duration-300 ease-out",
                        uploadHighlight &&
                          "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                        a.listView === "unreviewed" &&
                          a.activeExpenseId === row.id &&
                          "ring-1 ring-inset ring-[var(--eo-border-strong)]",
                        systemHealthFocused && "expense-ledger-row-high-attention",
                        ledgerMode && hasException && "expense-ledger-row-exception",
                        ledgerMode && a.activeExpenseId === row.id && "expense-ledger-row-active",
                        rowSelected &&
                          (triageLayout
                            ? "bg-[var(--eo-surface-selected)] shadow-[inset_3px_0_0_0_var(--eo-text-primary)] ring-1 ring-inset ring-[var(--eo-border-strong)]"
                            : "bg-[var(--eo-surface-selected)]")
                      )}
                      onClick={(e) => {
                        if (selectionEnabled && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                          e.preventDefault();
                          onModifierRowClick(row.id, e.shiftKey);
                          return;
                        }
                        if (inboxRowActivateIgnored(e.target)) return;
                        a.setActiveExpenseId(row.id);
                        a.openExpensePreview(row);
                      }}
                    >
                      <td className="w-[82px] shrink-0 whitespace-nowrap text-[12px] font-medium text-[var(--neo-text-secondary)]">
                        {inboxSubtitleDate(row.date)}
                      </td>
                      <td className="min-w-0 max-w-[min(28rem,34vw)]">
                        <div className="flex items-center gap-2">
                          {!selectionEnabled ? null : showSelectionUi ? (
                            <input
                              type="checkbox"
                              checked={rowSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelected(row.id, e.target.checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--neo-border)] text-[var(--neo-gold)]"
                              aria-label={`Select ${vendorTitle}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-transparent hover:border-[var(--neo-border-strong)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]"
                              aria-label={`Select ${vendorTitle}`}
                              title="Select"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGutterSelect(row.id);
                              }}
                            />
                          )}
                          <div
                            data-expense-merchant={ledgerMode ? "" : undefined}
                            className="min-w-0 flex-1"
                          >
                            <p
                              className={cn(
                                "min-w-0 max-w-full truncate text-[13px] leading-tight text-[var(--neo-text-primary)]",
                                ledgerMode ? "font-semibold" : "font-semibold md:font-medium"
                              )}
                              title={vendorClean || vendorTitle}
                            >
                              {vendorTitle}
                            </p>
                            <p
                              className="mt-0.5 truncate text-[10px] leading-tight text-[var(--neo-text-tertiary)]"
                              title={secondaryLine}
                            >
                              {secondaryLine}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td
                        data-expense-context={ledgerMode ? "project" : undefined}
                        className="w-36 shrink-0"
                      >
                        <span className={projectTextClass} title={projLabel}>
                          {projLabel}
                        </span>
                      </td>
                      <td
                        data-expense-context={ledgerMode ? "category" : undefined}
                        className="w-24 shrink-0"
                      >
                        <span className={categoryTextClass} title={catLabel}>
                          {catLabel}
                        </span>
                      </td>
                      <td
                        data-expense-context={ledgerMode ? "source" : undefined}
                        className="w-24 shrink-0"
                      >
                        <span className={sourceClass} title={expensePaymentSourceDisplayLabel(row)}>
                          {expensePaymentSourceDisplayLabel(row)}
                        </span>
                      </td>
                      <td
                        data-expense-signals={ledgerMode ? "receipt" : undefined}
                        className="w-[82px] shrink-0 whitespace-nowrap"
                      >
                        <ExpenseReceiptCell
                          row={row}
                          onReceiptPreview={() => a.openReceiptPreview(row)}
                          onReceiptPrefetch={() => a.prefetchReceiptUrls?.(row)}
                          onMissingReceipt={() => a.openExpensePreview(row, { mode: "edit" })}
                        />
                      </td>
                      <td
                        data-expense-signals={ledgerMode ? "issues" : undefined}
                        className={cn(
                          "w-[190px] shrink-0",
                          headerLineMismatch ? "text-left" : "text-center"
                        )}
                      >
                        {headerLineMismatch ? (
                          <ExpenseHeaderLineMismatchIssueCell
                            mismatch={headerLineMismatch}
                            onReviewIssue={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              a.openExpensePreview(row);
                            }}
                          />
                        ) : (
                          <ExpenseIssuesCell
                            expenseId={row.id}
                            issues={issues}
                            informational={ledgerMode}
                          />
                        )}
                      </td>
                      <td
                        data-expense-signals={ledgerMode ? "status" : undefined}
                        className="w-[104px] shrink-0 whitespace-nowrap"
                      >
                        <ExpenseStatusCell status={status} />
                      </td>
                      <td
                        data-expense-amount={ledgerMode ? "" : undefined}
                        className="w-[90px] shrink-0 whitespace-nowrap text-right tabular-nums"
                      >
                        <NeoAmount
                          tone="expense"
                          className={cn(
                            triageLayout
                              ? "text-[15px] leading-none"
                              : "text-[15px] font-semibold leading-none"
                          )}
                        >
                          {formatCurrency(-rowTotal)}
                        </NeoAmount>
                      </td>
                      <td className="w-10 shrink-0 !px-1 text-right">
                        <RowActionsMenu row={row} />
                      </td>
                    </tr>
                  );
                })
              : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

function DateGroupMobileHeader({
  chunk,
  expanded,
  autoExpand,
  onToggle,
  groupSelect,
  ledgerMode,
}: {
  chunk: ExpenseDateGroup;
  expanded: boolean;
  autoExpand: boolean;
  onToggle: () => void;
  ledgerMode: boolean;
  groupSelect?: {
    show: boolean;
    checked: boolean;
    indeterminate: boolean;
    onToggleGroup: () => void;
  };
}) {
  const groupCbRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const el = groupCbRef.current;
    if (el) el.indeterminate = Boolean(groupSelect?.indeterminate);
  }, [groupSelect?.indeterminate, groupSelect?.show]);

  return (
    <li
      data-expense-date-group={ledgerMode ? "mobile" : undefined}
      className={cn(
        "list-none border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-0",
        ledgerMode && "expense-ledger-date-group"
      )}
    >
      <div className="flex min-w-0 items-stretch">
        {groupSelect?.show ? (
          <div className="flex shrink-0 items-center border-r border-[var(--neo-border)] px-2">
            <input
              ref={groupCbRef}
              type="checkbox"
              checked={groupSelect.checked}
              onChange={groupSelect.onToggleGroup}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 shrink-0 rounded border-[var(--neo-border)] text-[var(--neo-gold)]"
              aria-label={`Select all for ${chunk.dateLabel}`}
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          disabled={autoExpand}
          aria-expanded={expanded}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors duration-200 ease-out",
            "hover:bg-[var(--neo-surface-raised)] disabled:cursor-default disabled:hover:bg-transparent"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-[var(--neo-text-secondary)] transition-transform duration-200 ease-out",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium text-[var(--neo-text-primary)]">{chunk.dateLabel}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--neo-text-secondary)]">
              <span className="tabular-nums">{chunk.itemCount} items</span>
              <span aria-hidden>·</span>
              <NeoAmount tone="expense" className="text-[12px]">
                {formatCurrency(-chunk.totalAmount)}
              </NeoAmount>
              {chunk.missingReceiptCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-[var(--eo-warning)]">
                    {chunk.missingReceiptCount} missing receipt
                    {chunk.missingReceiptCount !== 1 ? "s" : ""}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </button>
      </div>
    </li>
  );
}

function MobileRows({
  dateChunks,
  expandedByDate,
  autoExpandDateGroups,
  onToggleDateKey,
  possibleDuplicateIds,
  selectedIds,
  selectionEnabled,
  showSelectionUi,
  toggleSelected,
  onGutterSelect,
  onModifierRowClick,
  onToggleDateGroupRows,
  longPressHandlers,
}: {
  dateChunks: ExpenseDateGroup[];
  expandedByDate: Record<string, boolean>;
  autoExpandDateGroups: boolean;
  onToggleDateKey: (dateKey: string, chunkIndex: number) => void;
  possibleDuplicateIds: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  selectionEnabled: boolean;
  showSelectionUi: boolean;
  toggleSelected: (id: string, checked: boolean) => void;
  onGutterSelect: (id: string) => void;
  onModifierRowClick: (id: string, shiftKey: boolean) => void;
  onToggleDateGroupRows: (rowIds: string[]) => void;
  longPressHandlers: (rowId: string) => {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onTouchMove: (e: React.TouchEvent) => void;
  };
}) {
  const a = useInbox();
  const triageLayout = a.dateGroupPool === "inbox";
  const ledgerMode = !triageLayout;
  const dupIds = possibleDuplicateIds;
  return (
    <>
      {dateChunks.map((chunk, chunkIdx) => {
        const forceExpanded = a.forceExpandedDateKeys?.has(chunk.dateKey) ?? false;
        const expanded =
          forceExpanded ||
          autoExpandDateGroups ||
          (expandedByDate[chunk.dateKey] !== undefined
            ? expandedByDate[chunk.dateKey]
            : chunkIdx === 0);
        const rowIds = chunk.rows.map((r) => r.id);
        const selIn = rowIds.filter((id) => selectedIds.has(id)).length;
        const groupSelect =
          selectionEnabled && showSelectionUi
            ? {
                show: true as const,
                checked: selIn === rowIds.length && rowIds.length > 0,
                indeterminate: selIn > 0 && selIn < rowIds.length,
                onToggleGroup: () => onToggleDateGroupRows(rowIds),
              }
            : undefined;
        return (
          <React.Fragment key={`mgrp-${chunk.dateKey}-${chunkIdx}`}>
            <DateGroupMobileHeader
              chunk={chunk}
              expanded={expanded}
              autoExpand={autoExpandDateGroups || forceExpanded}
              onToggle={() => onToggleDateKey(chunk.dateKey, chunkIdx)}
              groupSelect={groupSelect}
              ledgerMode={ledgerMode}
            />
            {expanded
              ? chunk.rows.map((row) => {
                  const rowTotal = getExpenseTotal(row);
                  const projLabel = projectLabel(row, a.projectNameById);
                  const status = row.status ?? "pending";
                  const catLabel = primaryCategory(row);
                  const missingReceipt = getExpenseReceiptItems(row).length === 0;
                  const missingProject = inboxProjectIssueRequired(row);
                  const missingCategory = !expenseHasCategoryForWorkflow(row);
                  const missingWorker = inboxWorkerIssueRequired(row);
                  const showDupHint = dupIds.has(row.id);
                  const issues = buildInboxIssues({
                    missingReceipt,
                    missingProject,
                    missingCategory,
                    missingWorker,
                    duplicate: showDupHint,
                    rowTotal,
                  });
                  const headerLineMismatch = getExpenseHeaderLineMismatch(
                    row,
                    a.expenseIssueFocus?.expenseId === row.id ? a.expenseIssueFocus.issue : null
                  );
                  const vendorRaw = row.vendorName ?? "";
                  const vendorClean = expenseVendorDisplayRaw(vendorRaw);
                  const vendorTitle = inboxPrimaryVendorTitle(vendorClean);
                  const secondaryLine = inboxSecondaryMetaLine(row);
                  const rowSelected = selectedIds.has(row.id);
                  const lp = longPressHandlers(row.id);
                  const uploadHighlight =
                    !!row.referenceNo && (a.highlightReferenceNos?.has(row.referenceNo) ?? false);
                  const isInboxUploadDraft = isInboxUploadExpenseReference(row.referenceNo);
                  const systemHealthFocused = a.focusedExpenseId === row.id;
                  const hasException =
                    missingReceipt || issues.length > 0 || Boolean(headerLineMismatch);
                  const statusMeta = inboxStatusMeta(status);
                  const hasOperationalStatus =
                    statusMeta.label === "Draft" ||
                    statusMeta.label === "Needs Review" ||
                    statusMeta.label === "Rejected";

                  return (
                    <NeoMobileCard asChild selected={rowSelected} key={row.id}>
                      <li
                        data-expense-id={row.id}
                        data-expense-active={a.activeExpenseId === row.id ? "true" : "false"}
                        data-expense-has-exception={ledgerMode && hasException ? "true" : undefined}
                        data-system-health-focus={systemHealthFocused ? "true" : undefined}
                        data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                        data-expense-selected={
                          ledgerMode && selectionEnabled ? String(rowSelected) : undefined
                        }
                        ref={(el) => {
                          a.rowElsRef.current[row.id] = el;
                        }}
                        className={cn(
                          "expense-row-continuity exp-row group list-none cursor-pointer rounded-none border-x-0 border-t-0 px-3 py-2.5 shadow-none",
                          ledgerMode ? "border-b-0" : "border-b border-[var(--neo-border)]",
                          "min-h-[52px] hover:bg-[var(--neo-surface-muted)]",
                          a.deletingExpenseId === row.id &&
                            "pointer-events-none opacity-0 duration-300 ease-out",
                          uploadHighlight &&
                            "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                          a.listView === "unreviewed" &&
                            a.activeExpenseId === row.id &&
                            "ring-1 ring-inset ring-[var(--eo-border-strong)]",
                          systemHealthFocused && "expense-ledger-row-high-attention",
                          ledgerMode && hasException && "expense-ledger-row-exception",
                          ledgerMode && a.activeExpenseId === row.id && "expense-ledger-row-active",
                          rowSelected &&
                            (triageLayout
                              ? "bg-[var(--eo-surface-selected)] shadow-[inset_3px_0_0_0_var(--eo-text-primary)]"
                              : "bg-[var(--eo-surface-selected)]")
                        )}
                        onTouchStart={
                          selectionEnabled && !showSelectionUi ? lp.onTouchStart : undefined
                        }
                        onTouchEnd={
                          selectionEnabled && !showSelectionUi ? lp.onTouchEnd : undefined
                        }
                        onTouchCancel={
                          selectionEnabled && !showSelectionUi ? lp.onTouchCancel : undefined
                        }
                        onTouchMove={
                          selectionEnabled && !showSelectionUi ? lp.onTouchMove : undefined
                        }
                        onClick={(e) => {
                          if (selectionEnabled && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                            e.preventDefault();
                            onModifierRowClick(row.id, e.shiftKey);
                            return;
                          }
                          if (inboxRowActivateIgnored(e.target)) return;
                          a.setActiveExpenseId(row.id);
                          a.openExpensePreview(row);
                        }}
                      >
                        <div className="flex min-w-0 gap-2">
                          {!selectionEnabled ? null : showSelectionUi ? (
                            <input
                              type="checkbox"
                              checked={rowSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelected(row.id, e.target.checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--neo-border)] text-[var(--neo-gold)]"
                              aria-label={`Select ${vendorTitle}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-transparent hover:border-[var(--neo-border-strong)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]"
                              aria-label={`Select ${vendorTitle}`}
                              title="Select (long-press row)"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGutterSelect(row.id);
                              }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div
                              data-expense-row-primary={ledgerMode ? "" : undefined}
                              className="flex items-start justify-between gap-2"
                            >
                              <div
                                data-expense-merchant={ledgerMode ? "" : undefined}
                                className="min-w-0 flex-1"
                              >
                                <p
                                  className="line-clamp-1 min-w-0 break-words text-sm font-semibold leading-tight text-[var(--neo-text-primary)]"
                                  title={vendorClean || vendorTitle}
                                >
                                  {vendorTitle}
                                </p>
                                <p
                                  data-expense-row-description={ledgerMode ? "" : undefined}
                                  className="mt-0.5 truncate text-[11px] leading-tight text-[var(--neo-text-secondary)]"
                                  title={secondaryLine}
                                >
                                  {secondaryLine}
                                </p>
                                <p
                                  data-expense-context={ledgerMode ? "" : undefined}
                                  data-expense-mobile-context
                                  data-expense-row-metadata={ledgerMode ? "" : undefined}
                                  className="mt-1 line-clamp-1 text-[11px] leading-tight text-[var(--neo-text-tertiary)]"
                                  aria-label={`Project ${projLabel}, category ${catLabel}, source ${expensePaymentSourceDisplayLabel(row)}`}
                                  title={`${projLabel} · ${catLabel} · ${expensePaymentSourceDisplayLabel(row)}`}
                                >
                                  <span
                                    data-expense-context-part="project"
                                    className="font-medium text-[var(--neo-text-secondary)]"
                                  >
                                    {projLabel}
                                  </span>{" "}
                                  <span aria-hidden>·</span>{" "}
                                  <span data-expense-context-part="category">{catLabel}</span>{" "}
                                  <span aria-hidden>·</span>{" "}
                                  <span data-expense-context-part="source">
                                    {expensePaymentSourceDisplayLabel(row)}
                                  </span>
                                </p>
                              </div>
                              <div
                                data-expense-amount={ledgerMode ? "" : undefined}
                                className="flex max-w-[42%] shrink-0 flex-col items-end gap-1 whitespace-nowrap text-right tabular-nums"
                              >
                                <NeoAmount
                                  tone="expense"
                                  className={cn(
                                    triageLayout ? "text-base leading-none" : "text-sm"
                                  )}
                                >
                                  {formatCurrency(-rowTotal)}
                                </NeoAmount>
                              </div>
                              {ledgerMode ? (
                                <div
                                  data-expense-compact-row-actions
                                  className="hidden shrink-0 items-center"
                                >
                                  <RowActionsMenu row={row} />
                                </div>
                              ) : null}
                            </div>
                            <div
                              data-expense-signals={ledgerMode ? "" : undefined}
                              data-expense-signal-row={
                                ledgerMode
                                  ? hasException || hasOperationalStatus
                                    ? "attention"
                                    : "quiet"
                                  : undefined
                              }
                              className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1"
                            >
                              <ExpenseReceiptCell
                                row={row}
                                onReceiptPreview={() => a.openReceiptPreview(row)}
                                onReceiptPrefetch={() => a.prefetchReceiptUrls?.(row)}
                                onMissingReceipt={() => a.openExpensePreview(row, { mode: "edit" })}
                                touch
                              />
                              {headerLineMismatch ? null : (
                                <ExpenseIssuesCell
                                  expenseId={row.id}
                                  issues={issues}
                                  touch
                                  informational={ledgerMode}
                                />
                              )}
                              <span
                                data-expense-status-signal={
                                  ledgerMode && !hasOperationalStatus ? "complete" : "attention"
                                }
                              >
                                <ExpenseStatusCell status={status} />
                              </span>
                              <span data-expense-mobile-row-actions>
                                <RowActionsMenu row={row} />
                              </span>
                            </div>
                            {headerLineMismatch ? (
                              <div data-expense-header-mismatch-row className="mt-2">
                                <ExpenseHeaderLineMismatchIssueCell
                                  mismatch={headerLineMismatch}
                                  touch
                                  onReviewIssue={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    a.openExpensePreview(row);
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    </NeoMobileCard>
                  );
                })
              : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

export function ExpenseInboxTransactionList({
  dateChunks,
  possibleDuplicateIds,
  api,
  bulkActions,
}: {
  /** Date groups to render (already built from the full filtered list; parent may paginate groups). */
  dateChunks: ExpenseDateGroup[];
  /** Duplicate hint for the full filtered list (or broader scope). */
  possibleDuplicateIds?: ReadonlySet<string>;
  api: ExpenseInboxApi;
  /** When set, bulk bar + selection mode are enabled. */
  bulkActions?: ExpenseListBulkActionsApi;
}) {
  const dupIds = possibleDuplicateIds ?? new Set<string>();
  const ledgerMode = api.dateGroupPool === "expenses";
  const rootRef = React.useRef<HTMLDivElement>(null);
  const desktopLayout = useDesktopTableLayout(rootRef);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const selectionAnchorRef = React.useRef<string | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const visibleOrderedIds = React.useMemo(
    () => dateChunks.flatMap((c) => c.rows.map((r) => r.id)),
    [dateChunks]
  );
  const showSelectionUi = selectedIds.size > 0;
  const selectionEnabled = Boolean(bulkActions);

  const clearBulkSelection = React.useCallback(() => {
    setSelectedIds(new Set());
    selectionAnchorRef.current = null;
  }, []);

  React.useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearBulkSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds.size, clearBulkSelection]);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const onGutterSelect = React.useCallback((id: string) => {
    setSelectedIds(new Set([id]));
    selectionAnchorRef.current = id;
  }, []);

  const onModifierRowClick = React.useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && selectionAnchorRef.current) {
        const anchor = selectionAnchorRef.current;
        const ids = visibleOrderedIds;
        const i1 = ids.indexOf(anchor);
        const i2 = ids.indexOf(id);
        if (i1 >= 0 && i2 >= 0) {
          const lo = Math.min(i1, i2);
          const hi = Math.max(i1, i2);
          setSelectedIds(new Set(ids.slice(lo, hi + 1)));
        }
        return;
      }
      if (!shiftKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        selectionAnchorRef.current = id;
      }
    },
    [visibleOrderedIds]
  );

  const onToggleDateGroupRows = React.useCallback((rowIds: string[]) => {
    setSelectedIds((prev) => {
      const allOn = rowIds.length > 0 && rowIds.every((rid) => prev.has(rid));
      const next = new Set(prev);
      if (allOn) rowIds.forEach((rid) => next.delete(rid));
      else rowIds.forEach((rid) => next.add(rid));
      return next;
    });
    selectionAnchorRef.current = rowIds[0] ?? null;
  }, []);

  const longPressHandlers = React.useCallback(
    (rowId: string) => ({
      onTouchStart: (e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        clearLongPressTimer();
        const t = e.touches[0];
        longPressStartRef.current = { x: t.clientX, y: t.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          onGutterSelect(rowId);
        }, 520);
      },
      onTouchEnd: clearLongPressTimer,
      onTouchCancel: clearLongPressTimer,
      onTouchMove: (e: React.TouchEvent) => {
        if (!longPressStartRef.current || !e.touches[0]) return;
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - longPressStartRef.current.x);
        const dy = Math.abs(t.clientY - longPressStartRef.current.y);
        if (dx > 12 || dy > 12) clearLongPressTimer();
      },
    }),
    [clearLongPressTimer, onGutterSelect]
  );

  const dateChunksIdentity = React.useMemo(
    () => dateChunks.map((c) => `${c.dateKey}:${c.rows.map((r) => r.id).join(",")}`).join("|"),
    [dateChunks]
  );
  const forceExpandedDateKeysIdentity = React.useMemo(
    () => [...(api.forceExpandedDateKeys ?? [])].sort().join("|"),
    [api.forceExpandedDateKeys]
  );
  const [expandedByDate, setExpandedByDate] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    clearBulkSelection();
  }, [dateChunksIdentity, clearBulkSelection]);

  React.useEffect(() => {
    if (api.autoExpandDateGroups) {
      setExpandedByDate(Object.fromEntries(dateChunks.map((c) => [c.dateKey, true])));
      return;
    }
    const fromLs = readDateGroupExpandedMap(api.dateGroupPool);
    setExpandedByDate(() => {
      const next: Record<string, boolean> = {};
      dateChunks.forEach((c, i) => {
        if (api.forceExpandedDateKeys?.has(c.dateKey)) next[c.dateKey] = true;
        else if (fromLs[c.dateKey] !== undefined) next[c.dateKey] = fromLs[c.dateKey];
        else next[c.dateKey] = i === 0;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateChunks mirrored by dateChunksIdentity
  }, [
    dateChunksIdentity,
    api.autoExpandDateGroups,
    api.dateGroupPool,
    forceExpandedDateKeysIdentity,
  ]);

  const onToggleDateKey = React.useCallback(
    (dateKey: string, chunkIndex: number) => {
      if (api.autoExpandDateGroups || api.forceExpandedDateKeys?.has(dateKey)) return;
      setExpandedByDate((prev) => {
        const current = prev[dateKey] !== undefined ? prev[dateKey]! : chunkIndex === 0;
        const nextVal = !current;
        writeDateGroupExpandedMap(api.dateGroupPool, { [dateKey]: nextVal });
        return { ...prev, [dateKey]: nextVal };
      });
    },
    [api.autoExpandDateGroups, api.dateGroupPool, api.forceExpandedDateKeys]
  );

  const toggleSelected = React.useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const runBulk = React.useCallback(
    async (fn: (ids: string[]) => Promise<boolean | void>) => {
      if (!bulkActions) return;
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      const result = await fn(ids);
      if (result !== false) clearBulkSelection();
    },
    [bulkActions, selectedIds, clearBulkSelection]
  );

  return (
    <InboxCtx.Provider value={api}>
      <div
        ref={rootRef}
        data-expense-ledger-content
        className="flex min-h-0 min-w-0 flex-1 flex-col pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]"
      >
        {bulkActions && showSelectionUi ? (
          <ExpenseBulkActionBar
            selectedCount={selectedIds.size}
            busy={bulkActions.busy}
            pool={bulkActions.pool}
            projects={bulkActions.projects}
            categories={bulkActions.categories}
            paymentAccounts={bulkActions.paymentAccounts}
            onClear={clearBulkSelection}
            onMarkDone={() => void runBulk(bulkActions.runMarkDone)}
            onAssignProject={(projectId) =>
              void runBulk((ids) => bulkActions.runSetProject(ids, projectId))
            }
            onSetCategory={(category) =>
              void runBulk((ids) => bulkActions.runSetCategory(ids, category))
            }
            onSetPayment={(paymentAccountId) =>
              void runBulk((ids) => bulkActions.runSetPayment(ids, paymentAccountId))
            }
            onDeleteMany={() => void runBulk(bulkActions.runDeleteMany)}
          />
        ) : null}
        {desktopLayout ? (
          <NeoTable
            className="rounded-none border-0 shadow-none"
            scrollClassName="expense-compact-table-scroll bg-[var(--neo-surface-raised)]"
            tableClassName="min-w-[1100px] table-fixed text-sm"
          >
            <colgroup>
              <col className="w-[82px]" />
              <col />
              <col className="w-36" />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-[82px]" />
              <col className="w-[190px]" />
              <col className="w-[104px]" />
              <col className="w-[90px]" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr>
                <th className={cn(tableRawThClass, "w-[82px] shrink-0")}>Date</th>
                <th className={tableRawThClass}>Merchant</th>
                <th className={cn(tableRawThClass, "w-36 shrink-0")}>Project</th>
                <th className={cn(tableRawThClass, "w-24 shrink-0")}>Category</th>
                <th className={cn(tableRawThClass, "w-24 shrink-0")}>Source</th>
                <th className={cn(tableRawThClass, "w-[82px] shrink-0")}>Receipt</th>
                <th className={cn(tableRawThClass, "w-[190px] shrink-0")}>Issues</th>
                <th className={cn(tableRawThClass, "w-[104px] shrink-0")}>Status</th>
                <th className={cn(tableRawThClass, "w-[90px] shrink-0 text-right tabular-nums")}>
                  Amount
                </th>
                <th
                  className={cn(tableRawThClass, "w-10 shrink-0 overflow-hidden px-1 text-right")}
                >
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <DesktopRows
                dateChunks={dateChunks}
                expandedByDate={expandedByDate}
                autoExpandDateGroups={api.autoExpandDateGroups}
                onToggleDateKey={onToggleDateKey}
                possibleDuplicateIds={dupIds}
                selectedIds={selectedIds}
                selectionEnabled={selectionEnabled}
                showSelectionUi={selectionEnabled && showSelectionUi}
                toggleSelected={toggleSelected}
                onGutterSelect={onGutterSelect}
                onModifierRowClick={onModifierRowClick}
                onToggleDateGroupRows={onToggleDateGroupRows}
              />
            </tbody>
          </NeoTable>
        ) : (
          <ul
            data-expense-mobile-ledger={ledgerMode ? "" : undefined}
            className="exp-divide flex flex-col border-y border-[var(--neo-border)]"
          >
            <MobileRows
              dateChunks={dateChunks}
              expandedByDate={expandedByDate}
              autoExpandDateGroups={api.autoExpandDateGroups}
              onToggleDateKey={onToggleDateKey}
              possibleDuplicateIds={dupIds}
              selectedIds={selectedIds}
              selectionEnabled={selectionEnabled}
              showSelectionUi={selectionEnabled && showSelectionUi}
              toggleSelected={toggleSelected}
              onGutterSelect={onGutterSelect}
              onModifierRowClick={onModifierRowClick}
              onToggleDateGroupRows={onToggleDateGroupRows}
              longPressHandlers={longPressHandlers}
            />
          </ul>
        )}
      </div>
    </InboxCtx.Provider>
  );
}
