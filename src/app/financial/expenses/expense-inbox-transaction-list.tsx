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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronRight, Copy, Paperclip, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { tableRawThClass } from "@/components/ui/table";
import {
  expenseHasCategoryForWorkflow,
  expenseHasProjectForWorkflow,
  expenseNeedsReviewFromDb,
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
import { ExpenseBulkActionBar } from "./expense-bulk-action-bar";
import { formatCurrency, formatDate } from "@/lib/formatters";

type InboxIssueId = "receipt" | "project" | "category" | "duplicate";

type InboxIssue = {
  id: InboxIssueId;
  label: string;
  detail: string;
};

const EXPENSE_INBOX_DISMISSED_ISSUE_PREFIX = "hh.expenseInbox.dismissedIssue";

const compactTextPill =
  "inline-flex h-6 max-h-6 min-w-0 items-center truncate rounded-md border border-[var(--neo-border)] px-1.5 py-0 text-[11px] leading-none shadow-none";

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
  touch = false,
}: {
  row: Expense;
  onReceiptPreview: () => void;
  onReceiptPrefetch?: () => void;
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
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap text-[11px] font-medium text-[var(--neo-text-tertiary)]",
          touch && "min-h-6"
        )}
      >
        —
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 max-h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-2 text-[11px] font-medium leading-none text-[var(--neo-text-primary)] transition-colors duration-150 hover:border-emerald-500/25 hover:text-[var(--neo-emerald)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)]",
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
        items.length > 1 ? `Preview receipts, ${items.length} attached` : "Preview receipt"
      }
      title="Preview receipt"
    >
      <Paperclip className="h-3 w-3 shrink-0 opacity-75" strokeWidth={2} aria-hidden />
      <span>View</span>
      {items.length > 1 ? (
        <span className="tabular-nums text-[10px] text-[var(--neo-text-tertiary)]">
          {items.length}
        </span>
      ) : null}
    </button>
  );
}

function inboxProjectIssueRequired(expense: Expense, projLabel: string): boolean {
  if (projLabel === "Overhead") return false;
  return !expenseHasProjectForWorkflow(expense);
}

function buildInboxIssues({
  missingReceipt,
  missingProject,
  missingCategory,
  duplicate,
  rowTotal,
}: {
  missingReceipt: boolean;
  missingProject: boolean;
  missingCategory: boolean;
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
}: {
  expenseId: string;
  issues: InboxIssue[];
  touch?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [dismissedIssueIds, setDismissedIssueIds] = React.useState<Set<InboxIssueId>>(
    () => new Set()
  );
  const issueIdsKey = issues.map((issue) => issue.id).join("|");

  React.useEffect(() => {
    const issueIds = issueIdsKey.split("|").filter(Boolean) as InboxIssueId[];
    setDismissedIssueIds(readDismissedIssueIds(expenseId, issueIds));
  }, [expenseId, issueIdsKey]);

  const visibleIssues = issues.filter((issue) => !dismissedIssueIds.has(issue.id));

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
        className={cn(
          "inline-flex h-6 items-center justify-center text-[11px] text-[var(--neo-text-tertiary)]",
          !touch && "min-w-6"
        )}
        aria-label="No issues"
      >
        —
      </span>
    );
  }

  return (
    <span
      data-testid="expense-inbox-issues"
      className="inline-flex max-w-full justify-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-6 max-h-6 min-w-6 items-center justify-center rounded-md border border-transparent px-1 text-[13px] font-semibold leading-none text-[var(--neo-gold)] transition-colors duration-150 hover:border-[rgb(184_137_45_/_0.30)] hover:bg-[rgb(184_137_45_/_0.09)] focus-visible:outline focus-visible:ring-1 focus-visible:ring-[var(--neo-gold-ring)] dark:text-[var(--neo-gold-soft)]",
              touch &&
                "h-11 max-h-none min-h-11 min-w-11 px-2 md:h-6 md:max-h-6 md:min-h-0 md:min-w-6"
            )}
            aria-label={`${visibleIssues.length} issue${visibleIssues.length === 1 ? "" : "s"}: ${visibleIssues
              .map((issue) => issue.label)
              .join(", ")}`}
            onFocus={() => setOpen(true)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
          >
            <span aria-hidden>⚠</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          data-testid="expense-inbox-issue-popover"
          className="w-72 p-2"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
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
                    className="mt-[-1px] inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] font-semibold leading-none text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]"
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

/** Single secondary line: description, then payment source. Date already has its own column. */
function inboxSecondaryMetaLine(e: Expense): string {
  const description = expenseDescriptionDisplayLabel(e);
  if (description) return description;
  const sourceSeg = expensePaymentSourceDisplayLabel(e);
  return sourceSeg === "—" ? "—" : sourceSeg;
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
      "button, a, input, textarea, select, [role='checkbox'], [role='combobox'], [role='menuitem'], [data-radix-collection-item]"
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
  onDownloadComingSoon: () => void;
};

const InboxCtx = React.createContext<ExpenseInboxApi | null>(null);

/** Avoid duplicate row refs: desktop table vs mobile list only one mounts. */
function useDesktopTableLayout(): boolean {
  const [desktop, setDesktop] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
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
      contentClassName="w-44"
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
}: {
  chunk: ExpenseDateGroup;
  expanded: boolean;
  autoExpand: boolean;
  onToggle: () => void;
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
    <tr className="border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
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
                  <span className="text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]">
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
  const dupIds = possibleDuplicateIds;

  const projectTextClass =
    "block max-w-[10.5rem] truncate text-[13px] font-normal leading-tight text-[var(--neo-text-secondary)] opacity-75";
  const categoryTextClass =
    "block max-w-[6.5rem] truncate text-[12px] font-normal leading-tight text-[var(--neo-text-secondary)]";
  const sourceClass =
    "block max-w-[6.5rem] truncate text-[11px] font-medium leading-tight text-[var(--neo-text-secondary)]";

  return (
    <>
      {dateChunks.map((chunk, chunkIdx) => {
        const expanded =
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
              autoExpand={autoExpandDateGroups}
              onToggle={() => onToggleDateKey(chunk.dateKey, chunkIdx)}
              groupSelect={groupSelect}
            />
            {expanded
              ? chunk.rows.map((row) => {
                  const rowTotal = getExpenseTotal(row);
                  const projLabel = projectLabel(row, a.projectNameById);
                  const status = row.status ?? "pending";
                  const catLabel = primaryCategory(row);
                  const missingReceipt = getExpenseReceiptItems(row).length === 0;
                  const missingProject = inboxProjectIssueRequired(row, projLabel);
                  const missingCategory = !expenseHasCategoryForWorkflow(row);
                  const showDupHint = dupIds.has(row.id);
                  const issues = buildInboxIssues({
                    missingReceipt,
                    missingProject,
                    missingCategory,
                    duplicate: showDupHint,
                    rowTotal,
                  });
                  const vendorRaw = row.vendorName ?? "";
                  const vendorClean = expenseVendorDisplayRaw(vendorRaw);
                  const vendorTitle = inboxPrimaryVendorTitle(vendorClean);
                  const secondaryLine = inboxSecondaryMetaLine(row);
                  const rowSelected = selectedIds.has(row.id);
                  const uploadHighlight =
                    !!row.referenceNo && (a.highlightReferenceNos?.has(row.referenceNo) ?? false);
                  const isInboxUploadDraft = isInboxUploadExpenseReference(row.referenceNo);

                  return (
                    <tr
                      key={`desk-${row.id}`}
                      data-expense-id={row.id}
                      data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                      ref={(el) => {
                        a.rowElsRef.current[row.id] = el;
                      }}
                      className={cn(
                        "exp-row group h-12 cursor-pointer border-b border-[var(--neo-border)] bg-[var(--neo-surface-raised)] transition-[background-color,box-shadow] duration-150 ease-out hover:bg-[var(--neo-surface-muted)] [&>td]:align-middle [&>td]:px-2.5 [&>td]:py-1",
                        a.deletingExpenseId === row.id &&
                          "pointer-events-none opacity-0 duration-300 ease-out",
                        uploadHighlight &&
                          "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                        a.listView === "unreviewed" &&
                          a.activeExpenseId === row.id &&
                          "ring-1 ring-inset ring-amber-400/35 dark:ring-amber-500/30",
                        rowSelected &&
                          (triageLayout
                            ? "bg-[rgb(184_137_45_/_0.09)] shadow-[inset_3px_0_0_0_var(--neo-gold)] ring-1 ring-inset ring-[rgb(184_137_45_/_0.28)]"
                            : "bg-[rgb(184_137_45_/_0.08)] ring-1 ring-inset ring-[rgb(184_137_45_/_0.24)]")
                      )}
                      onClick={(e) => {
                        if (selectionEnabled && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                          e.preventDefault();
                          onModifierRowClick(row.id, e.shiftKey);
                          return;
                        }
                        if (inboxRowActivateIgnored(e.target)) return;
                        if (a.listView === "unreviewed") a.setActiveExpenseId(row.id);
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
                          <div className="min-w-0 flex-1">
                            <p
                              className="min-w-0 max-w-full truncate text-[13px] font-semibold leading-tight text-[var(--neo-text-primary)] md:font-medium"
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
                      <td className="w-[156px] shrink-0">
                        <span className={projectTextClass} title={projLabel}>
                          {projLabel}
                        </span>
                      </td>
                      <td className="w-[104px] shrink-0">
                        <span className={categoryTextClass} title={catLabel}>
                          {catLabel}
                        </span>
                      </td>
                      <td className="w-[108px] shrink-0">
                        <span className={sourceClass} title={expensePaymentSourceDisplayLabel(row)}>
                          {expensePaymentSourceDisplayLabel(row)}
                        </span>
                      </td>
                      <td className="w-[86px] shrink-0 whitespace-nowrap">
                        <ExpenseReceiptCell
                          row={row}
                          onReceiptPreview={() => a.openReceiptPreview(row)}
                          onReceiptPrefetch={() => a.prefetchReceiptUrls?.(row)}
                        />
                      </td>
                      <td className="w-16 shrink-0 text-center">
                        <ExpenseIssuesCell expenseId={row.id} issues={issues} />
                      </td>
                      <td className="w-[112px] shrink-0 whitespace-nowrap">
                        <ExpenseStatusCell status={status} />
                      </td>
                      <td className="w-[96px] shrink-0 whitespace-nowrap text-right tabular-nums">
                        <NeoAmount
                          tone="expense"
                          className={cn(triageLayout ? "text-[15px] leading-none" : "text-sm")}
                        >
                          {formatCurrency(-rowTotal)}
                        </NeoAmount>
                      </td>
                      <td className="w-11 shrink-0 text-right">
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
}: {
  chunk: ExpenseDateGroup;
  expanded: boolean;
  autoExpand: boolean;
  onToggle: () => void;
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
    <li className="list-none border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-0">
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
                  <span className="text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]">
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
  const dupIds = possibleDuplicateIds;
  const projectTextClass =
    "hidden max-w-full truncate text-[13px] font-normal leading-tight text-[var(--neo-text-secondary)] opacity-75 sm:inline-block";
  const categoryTextClass =
    "hidden max-w-full truncate text-[12px] font-normal leading-tight text-[var(--neo-text-secondary)] sm:inline-block";
  const sourceBadgeClass =
    "bg-[var(--neo-surface-muted)] font-normal text-[var(--neo-text-secondary)]";

  return (
    <>
      {dateChunks.map((chunk, chunkIdx) => {
        const expanded =
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
              autoExpand={autoExpandDateGroups}
              onToggle={() => onToggleDateKey(chunk.dateKey, chunkIdx)}
              groupSelect={groupSelect}
            />
            {expanded
              ? chunk.rows.map((row) => {
                  const rowTotal = getExpenseTotal(row);
                  const projLabel = projectLabel(row, a.projectNameById);
                  const status = row.status ?? "pending";
                  const catLabel = primaryCategory(row);
                  const missingReceipt = getExpenseReceiptItems(row).length === 0;
                  const missingProject = inboxProjectIssueRequired(row, projLabel);
                  const missingCategory = !expenseHasCategoryForWorkflow(row);
                  const showDupHint = dupIds.has(row.id);
                  const issues = buildInboxIssues({
                    missingReceipt,
                    missingProject,
                    missingCategory,
                    duplicate: showDupHint,
                    rowTotal,
                  });
                  const vendorRaw = row.vendorName ?? "";
                  const vendorClean = expenseVendorDisplayRaw(vendorRaw);
                  const vendorTitle = inboxPrimaryVendorTitle(vendorClean);
                  const secondaryLine = inboxSecondaryMetaLine(row);
                  const rowSelected = selectedIds.has(row.id);
                  const lp = longPressHandlers(row.id);
                  const uploadHighlight =
                    !!row.referenceNo && (a.highlightReferenceNos?.has(row.referenceNo) ?? false);
                  const isInboxUploadDraft = isInboxUploadExpenseReference(row.referenceNo);

                  return (
                    <NeoMobileCard asChild selected={rowSelected} key={row.id}>
                      <li
                        data-expense-id={row.id}
                        data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                        ref={(el) => {
                          a.rowElsRef.current[row.id] = el;
                        }}
                        className={cn(
                          "exp-row group list-none cursor-pointer rounded-none border-x-0 border-t-0 border-b border-[var(--neo-border)] px-3 py-2.5 shadow-none",
                          "min-h-[52px] hover:bg-[var(--neo-surface-muted)]",
                          a.deletingExpenseId === row.id &&
                            "pointer-events-none opacity-0 duration-300 ease-out",
                          uploadHighlight &&
                            "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                          a.listView === "unreviewed" &&
                            a.activeExpenseId === row.id &&
                            "ring-1 ring-inset ring-amber-400/35 dark:ring-amber-500/30",
                          rowSelected &&
                            (triageLayout
                              ? "shadow-[inset_3px_0_0_0_var(--neo-gold)]"
                              : "ring-1 ring-inset ring-[rgb(184_137_45_/_0.24)]")
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
                          if (a.listView === "unreviewed") a.setActiveExpenseId(row.id);
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
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p
                                  className="line-clamp-1 min-w-0 break-words text-sm font-semibold leading-tight text-[var(--neo-text-primary)]"
                                  title={vendorClean || vendorTitle}
                                >
                                  {vendorTitle}
                                </p>
                                <p
                                  className="mt-0.5 truncate text-[11px] leading-tight text-[var(--neo-text-secondary)]"
                                  title={secondaryLine}
                                >
                                  {secondaryLine}
                                </p>
                              </div>
                              <div className="flex max-w-[42%] shrink-0 flex-col items-end gap-1">
                                <NeoAmount
                                  tone="expense"
                                  className={cn(
                                    triageLayout ? "text-base leading-none" : "text-sm"
                                  )}
                                >
                                  {formatCurrency(-rowTotal)}
                                </NeoAmount>
                              </div>
                            </div>
                            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
                              <span className={projectTextClass} title={projLabel}>
                                {projLabel}
                              </span>
                              <span className={categoryTextClass} title={catLabel}>
                                {catLabel}
                              </span>
                              <span
                                className={cn(compactTextPill, sourceBadgeClass, "max-w-full")}
                                title={expensePaymentSourceDisplayLabel(row)}
                              >
                                {expensePaymentSourceDisplayLabel(row)}
                              </span>
                              <ExpenseReceiptCell
                                row={row}
                                onReceiptPreview={() => a.openReceiptPreview(row)}
                                onReceiptPrefetch={() => a.prefetchReceiptUrls?.(row)}
                                touch
                              />
                              <ExpenseIssuesCell expenseId={row.id} issues={issues} touch />
                              <ExpenseStatusCell status={status} />
                              <RowActionsMenu row={row} />
                            </div>
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
  const desktopLayout = useDesktopTableLayout();
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
        if (fromLs[c.dateKey] !== undefined) next[c.dateKey] = fromLs[c.dateKey];
        else next[c.dateKey] = i === 0;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateChunks mirrored by dateChunksIdentity
  }, [dateChunksIdentity, api.autoExpandDateGroups, api.dateGroupPool]);

  const onToggleDateKey = React.useCallback(
    (dateKey: string, chunkIndex: number) => {
      if (api.autoExpandDateGroups) return;
      setExpandedByDate((prev) => {
        const current = prev[dateKey] !== undefined ? prev[dateKey]! : chunkIndex === 0;
        const nextVal = !current;
        writeDateGroupExpandedMap(api.dateGroupPool, { [dateKey]: nextVal });
        return { ...prev, [dateKey]: nextVal };
      });
    },
    [api.autoExpandDateGroups, api.dateGroupPool]
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
      <div className="flex min-w-0 flex-col pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]">
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
            onDownload={bulkActions.onDownloadComingSoon}
          />
        ) : null}
        {desktopLayout ? (
          <NeoTable
            className="rounded-none border-0 shadow-none"
            scrollClassName="bg-[var(--neo-surface-raised)]"
            tableClassName="min-w-[1080px] table-fixed text-sm"
          >
            <colgroup>
              <col className="w-[82px]" />
              <col />
              <col className="w-[156px]" />
              <col className="w-[104px]" />
              <col className="w-[108px]" />
              <col className="w-[86px]" />
              <col className="w-[64px]" />
              <col className="w-[112px]" />
              <col className="w-[96px]" />
              <col className="w-11" />
            </colgroup>
            <thead>
              <tr>
                <th className={cn(tableRawThClass, "w-[82px] shrink-0")}>Date</th>
                <th className={tableRawThClass}>Merchant</th>
                <th className={cn(tableRawThClass, "w-[156px] shrink-0")}>Project</th>
                <th className={cn(tableRawThClass, "w-[104px] shrink-0")}>Category</th>
                <th className={cn(tableRawThClass, "w-[108px] shrink-0")}>Source</th>
                <th className={cn(tableRawThClass, "w-[86px] shrink-0")}>Receipt</th>
                <th className={cn(tableRawThClass, "w-16 shrink-0")}>Issues</th>
                <th className={cn(tableRawThClass, "w-[112px] shrink-0")}>Status</th>
                <th className={cn(tableRawThClass, "w-[96px] shrink-0 text-right tabular-nums")}>
                  Amount
                </th>
                <th className={cn(tableRawThClass, "w-11 shrink-0 px-1 text-right")}>Actions</th>
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
          <ul className="exp-divide flex flex-col border-y border-[var(--neo-border)]">
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
