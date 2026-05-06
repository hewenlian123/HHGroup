"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getExpenseTotal, type Expense, type PaymentAccountRow } from "@/lib/data";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  AlertTriangle,
  Banknote,
  Building2,
  ChevronRight,
  Copy,
  Fuel,
  HelpCircle,
  MoreHorizontal,
  Paperclip,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

/**
 * Under description: receipt preview or missing receipt (own line, aligned with text block); other signals below.
 */
const chipWarn =
  "inline-flex items-center rounded-md border border-amber-500/18 bg-amber-500/[0.07] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-950/78 dark:border-amber-500/14 dark:bg-amber-500/[0.09] dark:text-amber-100/78";

const chipDup =
  "inline-flex items-center gap-0.5 rounded-md border border-violet-400/15 bg-violet-500/[0.06] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-violet-800/75 dark:border-violet-500/12 dark:bg-violet-500/[0.08] dark:text-violet-200/75";

function InboxDescriptionSignals({
  row,
  onReceiptPreview,
  onReceiptPrefetch,
  missingProject,
  missingCategory,
  duplicate,
  triageLayout,
}: {
  row: Expense;
  /** Same handler as historically wired: resolves URLs and opens global attachment preview. */
  onReceiptPreview: () => void;
  /** Optional: prefetch signed URLs before click (hover / touch). */
  onReceiptPrefetch?: () => void;
  missingProject: boolean;
  missingCategory: boolean;
  duplicate: boolean;
  /** `/financial/inbox` review queue — Linear-style chips + clearer receipt signal. */
  triageLayout?: boolean;
}) {
  const items = React.useMemo(() => getExpenseReceiptItems(row), [row]);
  const hasReceipt = items.length > 0;
  const extraSignals = missingCategory || duplicate;
  const touchPrimedRef = React.useRef(false);
  React.useEffect(() => {
    touchPrimedRef.current = false;
  }, [row.id]);

  const receiptBtnShared =
    "inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 font-medium transition-colors duration-200 focus-visible:outline focus-visible:ring-1 focus-visible:ring-ring md:min-h-[32px]";

  if (triageLayout) {
    const chipRow = missingProject || missingCategory || duplicate;
    return (
      <div className="mt-2 min-w-0 space-y-2">
        <div className="text-[11px] leading-snug">
          {hasReceipt ? (
            <button
              type="button"
              className={cn(
                receiptBtnShared,
                "bg-emerald-500/[0.08] text-emerald-900 hover:border-emerald-500/22 hover:bg-emerald-500/[0.12] dark:text-emerald-200/95 dark:hover:border-emerald-500/28 dark:hover:bg-emerald-500/[0.15]"
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
              <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
              <span>
                Receipt attached
                {items.length > 1 ? (
                  <span className="ml-1 tabular-nums font-semibold opacity-90">
                    ({items.length})
                  </span>
                ) : null}
              </span>
            </button>
          ) : (
            <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-amber-500/14 bg-amber-500/[0.05] px-1.5 py-1 text-muted-foreground dark:border-amber-500/12 dark:bg-amber-500/[0.07] md:min-h-[32px]">
              <span
                className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/65 dark:bg-amber-400/65"
                aria-hidden
              />
              <span className="font-medium text-amber-950/72 dark:text-amber-100/72">
                No receipt
              </span>
            </span>
          )}
        </div>
        {chipRow ? (
          <div className="flex flex-wrap gap-1.5">
            {missingProject ? <span className={chipWarn}>Missing project</span> : null}
            {missingCategory ? <span className={chipWarn}>Missing category</span> : null}
            {duplicate ? (
              <span className={chipDup}>
                <Copy className="h-2.5 w-2.5 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                Duplicate
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-1.5 min-w-0 space-y-1">
      <div className="text-[11px] leading-snug">
        {hasReceipt ? (
          <button
            type="button"
            className={cn(
              receiptBtnShared,
              "bg-emerald-500/[0.07] text-emerald-800 hover:border-emerald-500/20 hover:bg-emerald-500/[0.11] dark:text-emerald-300/95 dark:hover:border-emerald-500/25 dark:hover:bg-emerald-500/[0.14]"
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
              items.length > 1 ? `Preview receipts, ${items.length} files` : "Preview receipt"
            }
            title="Preview receipt"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            <span>
              Receipt
              {items.length > 1 ? (
                <span className="ml-1 tabular-nums font-semibold text-emerald-900/80 dark:text-emerald-200/90">
                  ({items.length})
                </span>
              ) : null}
            </span>
          </button>
        ) : (
          <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-amber-500/15 bg-amber-500/[0.06] px-1.5 py-1 text-muted-foreground dark:border-amber-500/12 dark:bg-amber-500/[0.08]">
            <span
              className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/70 dark:bg-amber-400/75"
              aria-hidden
            />
            <span className="font-medium text-amber-950/75 dark:text-amber-100/75">No receipt</span>
          </span>
        )}
      </div>
      {missingProject ? (
        <div className="flex items-start gap-1 text-[11px] leading-snug text-amber-800/85 dark:text-amber-200/80">
          <AlertTriangle
            className="mt-0.5 h-3 w-3 shrink-0 opacity-80"
            strokeWidth={2}
            aria-hidden
          />
          Missing project
        </div>
      ) : null}
      {extraSignals ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-snug text-muted-foreground">
          {missingCategory ? (
            <span className="inline-flex items-center gap-1 text-amber-900/75 dark:text-amber-200/75">
              <AlertTriangle className="h-3 w-3 shrink-0 opacity-75" strokeWidth={2} aria-hidden />
              Missing category
            </span>
          ) : null}
          {duplicate ? (
            <span className="inline-flex items-center gap-1 text-violet-700/80 dark:text-violet-300/85">
              <Copy className="h-3 w-3 shrink-0 opacity-75" strokeWidth={2} aria-hidden />
              Duplicate
            </span>
          ) : null}
        </div>
      ) : null}
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

/** Single secondary line: Date · Payment · Source. Technical refs stay out of display. */
function inboxSecondaryMetaLine(e: Expense): string {
  const dateSeg = inboxSubtitleDate(e.date);
  const paySeg = paymentMethodDisplayLabel(e.paymentMethod);
  const srcSeg = sourceTypeLabel(e.sourceType);
  return `${dateSeg} · ${paySeg} · ${srcSeg}`;
}

function sourceTypeLabel(t: Expense["sourceType"]): string {
  if (t === "reimbursement") return "Worker reimbursement";
  if (t === "receipt_upload") return "Receipt upload";
  if (t === "bank_import") return "Bank import";
  return "Manual";
}

function paymentMethodDisplayLabel(pm: string | undefined): string {
  const v = (pm ?? "").trim();
  return v !== "" ? v : "—";
}

function primaryCategory(e: Expense): string {
  const c = e.lines[0]?.category;
  return c && c.trim() !== "" ? c : "—";
}

function inboxSubtitleDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

type AvatarKind = "unknown" | "amazon" | "gas" | "cash" | "hardware" | "default";

function inboxVendorAvatarKind(vendor: string): AvatarKind {
  const v = (vendor ?? "").trim().toLowerCase();
  if (!v || v === "unknown" || looksLikeTestOrSyntheticVendor(vendor)) return "unknown";
  if (/\bamazon\b/.test(v)) return "amazon";
  if (/\b(shell|chevron|exxon|mobil|bp\b|fuel|gas station|gasoline|petrol)\b/.test(v)) {
    return "gas";
  }
  if (/\b(cash|withdrawal|atm)\b/.test(v)) return "cash";
  if (/\b(home depot|homedepot|home-depot)\b/.test(v)) return "hardware";
  return "default";
}

function VendorAvatar({ vendor }: { vendor: string }) {
  const kind = inboxVendorAvatarKind(vendor);
  const wrap =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500";
  const iconSm = "h-3 w-3";
  switch (kind) {
    case "unknown":
      return (
        <span className={wrap} aria-hidden>
          <HelpCircle className={iconSm} strokeWidth={1.75} />
        </span>
      );
    case "amazon":
      return (
        <span className={wrap} aria-hidden>
          <ShoppingBag className={iconSm} strokeWidth={1.75} />
        </span>
      );
    case "gas":
      return (
        <span className={wrap} aria-hidden>
          <Fuel className={iconSm} strokeWidth={1.75} />
        </span>
      );
    case "cash":
      return (
        <span className={wrap} aria-hidden>
          <Banknote className={iconSm} strokeWidth={1.75} />
        </span>
      );
    case "hardware":
      return (
        <span className={wrap} aria-hidden>
          <Building2 className={iconSm} strokeWidth={1.75} />
        </span>
      );
    default:
      return (
        <span
          className={cn(wrap, "text-[10px] font-medium text-gray-500 dark:text-gray-400")}
          aria-hidden
        >
          {(vendor ?? "").trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      );
  }
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

function inboxStatusBadgeStyle(status: string | undefined): { dot: string; label: string } {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (s === "draft") {
    return { dot: "bg-slate-400", label: "Draft" };
  }
  if (s === "approved") {
    return { dot: "bg-emerald-500", label: "Approved" };
  }
  if (expenseNeedsReviewFromDb(status)) {
    return {
      dot: "bg-orange-500",
      label: "Needs Review",
    };
  }
  return {
    dot: "bg-emerald-500",
    label: "Done",
  };
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="exp-icon-btn h-11 min-h-11 w-11 shrink-0 rounded-md text-muted-foreground transition-colors duration-200 hover:bg-zinc-100 hover:text-foreground dark:hover:bg-muted md:h-8 md:min-h-0 md:w-8"
          aria-label="Row actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => a.openExpensePreview(row, { mode: "edit" })}
        >
          Edit
        </DropdownMenuItem>
        {showMarkDone ? (
          <DropdownMenuItem className="cursor-pointer" onClick={() => a.toggleStatus(row)}>
            {inboxUploadRow ? "Approve" : "Mark Done"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/30 dark:focus:text-red-400"
          disabled={a.deletingExpenseId === row.id}
          onClick={() => a.handleDelete(row)}
        >
          <SubmitSpinner loading={a.deletingExpenseId === row.id} className="shrink-0" />
          {a.deletingExpenseId !== row.id ? (
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const COL_COUNT = 6;

function formatGroupMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    <tr className="border-b border-zinc-100/80 bg-zinc-50/45 dark:border-border/50 dark:bg-muted/10">
      <td colSpan={COL_COUNT} className="p-0 align-middle">
        <div className="flex min-w-0 items-stretch">
          {groupSelect?.show ? (
            <div className="flex shrink-0 items-center border-r border-border/50 px-2 dark:border-border/40">
              <input
                ref={groupCbRef}
                type="checkbox"
                checked={groupSelect.checked}
                onChange={groupSelect.onToggleGroup}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-foreground dark:border-gray-600"
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
              "hover:bg-muted/25 disabled:cursor-default disabled:hover:bg-transparent"
            )}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
                expanded && "rotate-90"
              )}
              aria-hidden
            />
            <span className="font-medium text-foreground">{chunk.dateLabel}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground">
              <span className="tabular-nums">{chunk.itemCount}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums text-red-600 dark:text-red-500/90">
                −${formatGroupMoney(chunk.totalAmount)}
              </span>
              {chunk.missingReceiptCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-amber-800/70 dark:text-amber-400/65">
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

  const projectBadgeClass =
    "inline-flex h-6 max-h-6 max-w-[10rem] items-center gap-1 truncate rounded-md border border-zinc-200/85 bg-zinc-50/95 px-1.5 py-0 text-[11px] font-medium text-zinc-800 shadow-none transition-colors duration-200 dark:border-border/55 dark:bg-muted/30 dark:text-zinc-200";
  const categoryBadgeClass =
    "inline-flex h-6 max-h-6 max-w-[6.5rem] items-center truncate rounded-md border border-zinc-200/85 bg-white px-1.5 py-0 text-[11px] font-normal text-zinc-700 shadow-none transition-colors duration-200 dark:border-border/55 dark:bg-muted/20 dark:text-zinc-300";

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
                  const inboxSt = inboxStatusBadgeStyle(status);
                  const catLabel = primaryCategory(row);
                  const missingProject = !expenseHasProjectForWorkflow(row);
                  const missingCategory = !expenseHasCategoryForWorkflow(row);
                  const showDupHint = dupIds.has(row.id);
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
                        "exp-row group min-h-[52px] cursor-pointer border-b border-zinc-100/90 bg-white transition-[background-color,box-shadow] duration-200 ease-out hover:bg-zinc-50/95 [&>td]:align-middle [&>td]:px-3 [&>td]:py-3 dark:border-border/50 dark:bg-card dark:hover:bg-muted/25",
                        a.deletingExpenseId === row.id &&
                          "pointer-events-none opacity-0 duration-300 ease-out",
                        uploadHighlight &&
                          "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                        a.listView === "unreviewed" &&
                          a.activeExpenseId === row.id &&
                          "ring-1 ring-inset ring-orange-400/35 dark:ring-orange-500/30",
                        rowSelected &&
                          (triageLayout
                            ? "bg-zinc-100 shadow-[inset_3px_0_0_0_rgba(113,113,122,0.65)] ring-1 ring-inset ring-zinc-400/50 dark:bg-zinc-900/60 dark:shadow-[inset_3px_0_0_0_rgba(161,161,170,0.45)] dark:ring-zinc-600/55"
                            : "bg-zinc-100/95 ring-1 ring-inset ring-zinc-300/65 dark:bg-zinc-900/50 dark:ring-zinc-600/55")
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
                      <td className="min-w-0 max-w-[min(36rem,52vw)]">
                        <div className="flex items-start gap-2">
                          {!selectionEnabled ? null : showSelectionUi ? (
                            <input
                              type="checkbox"
                              checked={rowSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelected(row.id, e.target.checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-foreground dark:border-gray-600"
                              aria-label={`Select ${vendorTitle}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-transparent hover:border-border/80 focus-visible:outline focus-visible:ring-1 focus-visible:ring-ring"
                              aria-label={`Select ${vendorTitle}`}
                              title="Select"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGutterSelect(row.id);
                              }}
                            />
                          )}
                          <VendorAvatar vendor={vendorClean} />
                          <div className="min-w-0 flex-1">
                            <p
                              className="line-clamp-2 min-w-0 max-w-full break-words text-sm font-semibold leading-snug text-zinc-900 md:line-clamp-none md:truncate md:font-medium dark:text-zinc-100"
                              title={vendorClean || vendorTitle}
                            >
                              {vendorTitle}
                            </p>
                            <p className="mt-1 truncate text-[11px] leading-snug text-muted-foreground">
                              {secondaryLine}
                            </p>
                            <InboxDescriptionSignals
                              row={row}
                              onReceiptPreview={() => a.openReceiptPreview(row)}
                              onReceiptPrefetch={() => a.prefetchReceiptUrls?.(row)}
                              missingProject={missingProject}
                              missingCategory={missingCategory}
                              duplicate={showDupHint}
                              triageLayout={triageLayout}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="w-[148px] shrink-0">
                        <span className={cn(projectBadgeClass, "max-w-[9rem]")} title={projLabel}>
                          <Building2 className="h-2.5 w-2.5 shrink-0 text-gray-400" aria-hidden />
                          {projLabel}
                        </span>
                      </td>
                      <td className="w-[104px] shrink-0">
                        <span className={cn(categoryBadgeClass, "max-w-full")} title={catLabel}>
                          {catLabel}
                        </span>
                      </td>
                      <td className="w-[128px] shrink-0 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex h-6 max-h-6 items-center gap-1 rounded-full border px-2 py-0 text-[11px] font-medium shadow-none",
                            expenseNeedsReviewFromDb(status)
                              ? "border-orange-200/60 bg-orange-50/80 text-orange-900/90 dark:border-orange-500/20 dark:bg-orange-950/30 dark:text-orange-100"
                              : "border-emerald-200/60 bg-emerald-50/80 text-emerald-900/90 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-100"
                          )}
                        >
                          <span
                            className={cn("h-1 w-1 shrink-0 rounded-full", inboxSt.dot)}
                            aria-hidden
                          />
                          {inboxSt.label}
                        </span>
                      </td>
                      <td className="w-[96px] shrink-0 whitespace-nowrap text-right tabular-nums">
                        <span
                          className={cn(
                            "font-semibold text-red-600 dark:text-red-500/90",
                            triageLayout ? "text-[15px] leading-none tracking-tight" : "text-sm"
                          )}
                        >
                          −$
                          {rowTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="w-10 shrink-0 text-right">
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
    <li className="list-none border-b border-zinc-100/80 bg-zinc-50/40 p-0 dark:border-border/50 dark:bg-muted/10">
      <div className="flex min-w-0 items-stretch">
        {groupSelect?.show ? (
          <div className="flex shrink-0 items-center border-r border-border/50 px-2 dark:border-border/40">
            <input
              ref={groupCbRef}
              type="checkbox"
              checked={groupSelect.checked}
              onChange={groupSelect.onToggleGroup}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 shrink-0 rounded border-gray-300 text-foreground dark:border-gray-600"
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
            "hover:bg-muted/30 disabled:cursor-default disabled:hover:bg-transparent"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium text-foreground">{chunk.dateLabel}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="tabular-nums">{chunk.itemCount} items</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums text-red-600 dark:text-red-500/90">
                −${formatGroupMoney(chunk.totalAmount)}
              </span>
              {chunk.missingReceiptCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-amber-800/70 dark:text-amber-400/65">
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
  const projectBadgeClass =
    "inline-flex h-6 max-h-6 max-w-full items-center truncate rounded-md border border-zinc-200/85 bg-zinc-50/95 px-1.5 py-0 text-[11px] font-medium text-zinc-800 shadow-none transition-colors duration-200 dark:border-border/55 dark:bg-muted/30 dark:text-zinc-200";
  const categoryBadgeClass =
    "inline-flex h-6 max-h-6 max-w-full items-center truncate rounded-md border border-zinc-200/85 bg-white px-1.5 py-0 text-[11px] font-normal text-zinc-700 shadow-none transition-colors duration-200 dark:border-border/55 dark:bg-muted/20 dark:text-zinc-300";

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
                  const inboxSt = inboxStatusBadgeStyle(status);
                  const catLabel = primaryCategory(row);
                  const missingProject = !expenseHasProjectForWorkflow(row);
                  const missingCategory = !expenseHasCategoryForWorkflow(row);
                  const showDupHint = dupIds.has(row.id);
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
                    <li
                      key={row.id}
                      data-expense-id={row.id}
                      data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                      ref={(el) => {
                        a.rowElsRef.current[row.id] = el;
                      }}
                      className={cn(
                        "exp-row group list-none cursor-pointer border-b border-zinc-100/90 bg-white px-3 py-3.5 transition-[background-color,box-shadow] duration-200 ease-out hover:bg-zinc-50/95 dark:border-border/50 dark:bg-card dark:hover:bg-muted/25",
                        "min-h-[52px]",
                        a.deletingExpenseId === row.id &&
                          "pointer-events-none opacity-0 duration-300 ease-out",
                        uploadHighlight &&
                          "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                        a.listView === "unreviewed" &&
                          a.activeExpenseId === row.id &&
                          "ring-1 ring-inset ring-orange-400/35 dark:ring-orange-500/30",
                        rowSelected &&
                          (triageLayout
                            ? "bg-zinc-100 shadow-[inset_3px_0_0_0_rgba(113,113,122,0.65)] ring-1 ring-inset ring-zinc-400/50 dark:bg-zinc-900/60 dark:shadow-[inset_3px_0_0_0_rgba(161,161,170,0.45)] dark:ring-zinc-600/55"
                            : "bg-zinc-100/95 ring-1 ring-inset ring-zinc-300/65 dark:bg-zinc-900/50 dark:ring-zinc-600/55")
                      )}
                      onTouchStart={
                        selectionEnabled && !showSelectionUi ? lp.onTouchStart : undefined
                      }
                      onTouchEnd={selectionEnabled && !showSelectionUi ? lp.onTouchEnd : undefined}
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
                      <div className="flex gap-2">
                        {!selectionEnabled ? null : showSelectionUi ? (
                          <input
                            type="checkbox"
                            checked={rowSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelected(row.id, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-border dark:border-gray-600"
                            aria-label={`Select ${vendorTitle}`}
                          />
                        ) : (
                          <button
                            type="button"
                            className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-transparent hover:border-border/80 focus-visible:outline focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label={`Select ${vendorTitle}`}
                            title="Select (long-press row)"
                            onClick={(e) => {
                              e.stopPropagation();
                              onGutterSelect(row.id);
                            }}
                          />
                        )}
                        <VendorAvatar vendor={vendorClean} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100"
                                title={vendorClean || vendorTitle}
                              >
                                {vendorTitle}
                              </p>
                              <p className="mt-1 truncate text-[11px] leading-snug text-muted-foreground">
                                {secondaryLine}
                              </p>
                              <InboxDescriptionSignals
                                row={row}
                                onReceiptPreview={() => a.openReceiptPreview(row)}
                                onReceiptPrefetch={() => a.prefetchReceiptUrls?.(row)}
                                missingProject={missingProject}
                                missingCategory={missingCategory}
                                duplicate={showDupHint}
                                triageLayout={triageLayout}
                              />
                            </div>
                            <div className="flex max-w-[42%] shrink-0 flex-col items-end gap-1">
                              <span
                                className={cn(
                                  "font-semibold tabular-nums text-red-600 dark:text-red-500/90",
                                  triageLayout ? "text-base leading-none tracking-tight" : "text-sm"
                                )}
                              >
                                −$
                                {rowTotal.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={projectBadgeClass}>{projLabel}</span>
                            <span className={categoryBadgeClass}>{catLabel}</span>
                            <span
                              className={cn(
                                "inline-flex h-6 max-h-6 items-center gap-1 rounded-full border px-2 py-0 text-[11px] font-medium shadow-none",
                                expenseNeedsReviewFromDb(status)
                                  ? "border-orange-200/60 bg-orange-50/80 text-orange-900/90 dark:border-orange-500/20 dark:bg-orange-950/30 dark:text-orange-100"
                                  : "border-emerald-200/60 bg-emerald-50/80 text-emerald-900/90 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-100"
                              )}
                            >
                              <span
                                className={cn("h-1 w-1 rounded-full", inboxSt.dot)}
                                aria-hidden
                              />
                              {inboxSt.label}
                            </span>
                            <RowActionsMenu row={row} />
                          </div>
                        </div>
                      </div>
                    </li>
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
          <div className="overflow-x-auto bg-white dark:bg-card">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/55 dark:border-border/50 dark:bg-muted/15">
                  <th className="h-9 px-3 align-middle text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {api.dateGroupPool === "inbox" ? "Review item" : "Description"}
                  </th>
                  <th className="h-9 w-[148px] shrink-0 px-3 align-middle text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Project
                  </th>
                  <th className="h-9 w-[104px] shrink-0 px-3 align-middle text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Category
                  </th>
                  <th className="h-9 w-[128px] shrink-0 px-3 align-middle text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="h-9 w-[96px] shrink-0 px-3 align-middle text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Amount
                  </th>
                  <th className="h-9 w-10 shrink-0 px-2 align-middle text-right" aria-hidden />
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
            </table>
          </div>
        ) : (
          <ul className="exp-divide flex flex-col border-y border-zinc-100/90 dark:border-border/50">
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
