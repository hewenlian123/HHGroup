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
  Banknote,
  Building2,
  ChevronRight,
  Fuel,
  HelpCircle,
  MoreHorizontal,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  expenseHasCategoryForWorkflow,
  expenseHasProjectForWorkflow,
  expenseNeedsReviewFromDb,
} from "@/lib/expense-workflow-status";
import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";
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
function InboxDescriptionSignals({
  row,
  onReceiptPreview,
  missingProject,
  missingCategory,
  duplicate,
}: {
  row: Expense;
  /** Same handler as historically wired: resolves URLs and opens global attachment preview. */
  onReceiptPreview: () => void;
  missingProject: boolean;
  missingCategory: boolean;
  duplicate: boolean;
}) {
  const items = React.useMemo(() => getExpenseReceiptItems(row), [row]);
  const hasReceipt = items.length > 0;
  const extraSignals = missingCategory || duplicate;

  return (
    <div className="mt-1 min-w-0 space-y-0.5">
      <div className="text-xs leading-snug">
        {hasReceipt ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 font-normal text-muted-foreground hover:text-foreground hover:underline focus-visible:outline focus-visible:ring-1 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              onReceiptPreview();
            }}
            aria-label={
              items.length > 1 ? `Preview receipts, ${items.length} files` : "Preview receipt"
            }
            title="Preview receipt"
          >
            <span aria-hidden className="select-none">
              👁
            </span>
            Receipt
            {items.length > 1 ? (
              <span className="tabular-nums text-muted-foreground/80">({items.length})</span>
            ) : null}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-orange-500/90 dark:text-orange-400/80">
            <span aria-hidden className="select-none">
              ⚠
            </span>
            Missing receipt
          </span>
        )}
      </div>
      {missingProject ? (
        <div className="text-xs leading-snug text-orange-600 dark:text-orange-400">
          <span aria-hidden className="select-none">
            ⚠{" "}
          </span>
          Missing project
        </div>
      ) : null}
      {extraSignals ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-snug text-muted-foreground">
          {missingCategory ? (
            <span className="inline-flex items-center gap-1 text-yellow-700/85 dark:text-yellow-400/85">
              <span aria-hidden className="select-none">
                ⚠
              </span>
              Missing category
            </span>
          ) : null}
          {duplicate ? (
            <span className="inline-flex items-center gap-1 text-violet-600/90 dark:text-violet-400/85">
              <span aria-hidden className="select-none">
                ⚠
              </span>
              Duplicate
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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

function inboxDescriptionIdSegment(e: Expense, vendorRaw: string, synthetic: boolean): string {
  if (synthetic) {
    const v = vendorRaw.trim();
    if (v) return v.length > 48 ? `${v.slice(0, 45)}…` : v;
  }
  return inboxSubtitleIdPart(e);
}

/** Single secondary line: ID · Date · Payment · Source */
function inboxSecondaryMetaLine(e: Expense, vendorRaw: string, synthetic: boolean): string {
  const idSeg = inboxDescriptionIdSegment(e, vendorRaw, synthetic);
  const dateSeg = inboxSubtitleDate(e.date);
  const paySeg = paymentMethodDisplayLabel(e.paymentMethod);
  const srcSeg = sourceTypeLabel(e.sourceType);
  return `${idSeg} · ${dateSeg} · ${paySeg} · ${srcSeg}`;
}

function sourceTypeLabel(t: Expense["sourceType"]): string {
  if (t === "reimbursement") return "Reimbursement";
  if (t === "receipt_upload") return "Receipt";
  return "Company";
}

function paymentMethodDisplayLabel(pm: string | undefined): string {
  const v = (pm ?? "").trim();
  return v !== "" ? v : "—";
}

function primaryCategory(e: Expense): string {
  const c = e.lines[0]?.category;
  return c && c.trim() !== "" ? c : "—";
}

/** Line 2: ID / description snippet · date · payment · source */
function inboxSubtitleIdPart(e: Expense): string {
  const ref = (e.referenceNo ?? "").trim();
  if (ref) return ref.length > 36 ? `${ref.slice(0, 33)}…` : ref;
  const notes = (e.notes ?? "").trim();
  if (notes) return notes.length > 36 ? `${notes.slice(0, 33)}…` : notes;
  const compact = e.id.replace(/-/g, "");
  if (compact.length <= 14) return compact || "—";
  return `${compact.slice(0, 14)}…`;
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
          className="exp-icon-btn h-8 w-8 shrink-0 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
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
    <tr className="border-b border-border/60 bg-muted/10 dark:bg-muted/5">
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
              "flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              "hover:bg-muted/20 disabled:cursor-default disabled:hover:bg-transparent"
            )}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
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
                  <span className="text-amber-700/90 dark:text-amber-400/85">
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
  const dupIds = possibleDuplicateIds;

  const projectBadgeClass =
    "inline-flex h-6 max-h-6 max-w-[10rem] items-center gap-1 truncate rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0 text-[11px] font-medium text-gray-700 shadow-none dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200";
  const categoryBadgeClass =
    "inline-flex h-6 max-h-6 max-w-[6.5rem] items-center truncate rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0 text-[11px] font-normal text-gray-700 shadow-none dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300";

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
                  const syntheticVendor = looksLikeTestOrSyntheticVendor(vendorRaw);
                  const vendorTitle = inboxPrimaryVendorTitle(vendorRaw);
                  const secondaryLine = inboxSecondaryMetaLine(row, vendorRaw, syntheticVendor);
                  const rowSelected = selectedIds.has(row.id);
                  const uploadHighlight =
                    !!row.referenceNo && (a.highlightReferenceNos?.has(row.referenceNo) ?? false);
                  const isInboxUploadDraft = isInboxUploadExpenseReference(row.referenceNo);

                  return (
                    <tr
                      key={`desk-${row.id}`}
                      data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                      ref={(el) => {
                        a.rowElsRef.current[row.id] = el;
                      }}
                      className={cn(
                        "exp-row group min-h-[62px] cursor-pointer border-b border-gray-100 bg-white transition-colors duration-700 ease-out hover:bg-gray-50/70 [&>td]:align-middle [&>td]:px-3 [&>td]:py-2.5 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900/70",
                        a.deletingExpenseId === row.id &&
                          "pointer-events-none opacity-0 duration-300 ease-out",
                        uploadHighlight &&
                          "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                        a.listView === "unreviewed" &&
                          a.activeExpenseId === row.id &&
                          "ring-1 ring-inset ring-orange-200 dark:ring-orange-900/50",
                        rowSelected && "bg-muted/25 dark:bg-muted/15"
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
                          <VendorAvatar vendor={vendorRaw} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-950">
                              {vendorTitle}
                            </p>
                            <p className="mt-0.5 truncate text-xs leading-snug text-gray-500 dark:text-gray-500">
                              {secondaryLine}
                            </p>
                            <InboxDescriptionSignals
                              row={row}
                              onReceiptPreview={() => a.openReceiptPreview(row)}
                              missingProject={missingProject}
                              missingCategory={missingCategory}
                              duplicate={showDupHint}
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
                        <span className="text-sm font-medium text-red-600 dark:text-red-500/90">
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
    <li className="list-none border-b border-border/60 bg-muted/10 p-0 dark:bg-muted/5">
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
            "flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
            "hover:bg-muted/20 disabled:cursor-default disabled:hover:bg-transparent"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
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
                  <span className="text-amber-700/90 dark:text-amber-400/85">
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
  const dupIds = possibleDuplicateIds;
  const projectBadgeClass =
    "inline-flex h-6 max-h-6 max-w-full items-center truncate rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0 text-[11px] font-medium text-gray-700 shadow-none dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200";
  const categoryBadgeClass =
    "inline-flex h-6 max-h-6 max-w-full items-center truncate rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0 text-[11px] font-normal text-gray-700 shadow-none dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300";

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
                  const syntheticVendor = looksLikeTestOrSyntheticVendor(vendorRaw);
                  const vendorTitle = inboxPrimaryVendorTitle(vendorRaw);
                  const secondaryLine = inboxSecondaryMetaLine(row, vendorRaw, syntheticVendor);
                  const rowSelected = selectedIds.has(row.id);
                  const lp = longPressHandlers(row.id);
                  const uploadHighlight =
                    !!row.referenceNo && (a.highlightReferenceNos?.has(row.referenceNo) ?? false);
                  const isInboxUploadDraft = isInboxUploadExpenseReference(row.referenceNo);

                  return (
                    <li
                      key={row.id}
                      data-inbox-upload-draft={isInboxUploadDraft ? "" : undefined}
                      ref={(el) => {
                        a.rowElsRef.current[row.id] = el;
                      }}
                      className={cn(
                        "exp-row group list-none cursor-pointer border-b border-gray-100 bg-white px-3 py-2.5 transition-colors duration-700 ease-out hover:bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900/70",
                        "min-h-[62px]",
                        a.deletingExpenseId === row.id &&
                          "pointer-events-none opacity-0 duration-300 ease-out",
                        uploadHighlight &&
                          "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)] dark:bg-emerald-500/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]",
                        a.listView === "unreviewed" &&
                          a.activeExpenseId === row.id &&
                          "ring-1 ring-inset ring-orange-200 dark:ring-orange-900/50",
                        rowSelected && "bg-muted/25 dark:bg-muted/15"
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
                        <VendorAvatar vendor={vendorRaw} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-100">
                                {vendorTitle}
                              </p>
                              <p className="mt-0.5 truncate text-xs leading-snug text-gray-500 dark:text-gray-500">
                                {secondaryLine}
                              </p>
                              <InboxDescriptionSignals
                                row={row}
                                onReceiptPreview={() => a.openReceiptPreview(row)}
                                missingProject={missingProject}
                                missingCategory={missingCategory}
                                duplicate={showDupHint}
                              />
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="text-sm font-medium tabular-nums text-red-600 dark:text-red-500/90">
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
      <div className="flex min-w-0 flex-col">
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
          <div className="overflow-x-auto bg-white dark:bg-gray-950">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">
                  <th className="h-9 px-3 align-middle text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Description
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
          <ul className="exp-divide flex flex-col border-y border-border/60">
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
