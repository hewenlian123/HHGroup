"use client";

import * as React from "react";
import { motion as m, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/base";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { cn } from "@/lib/utils";
import { InlineLoading } from "@/components/ui/skeleton";
import type { ReceiptQueueRow } from "@/lib/receipt-queue";
import { Check, Trash2 } from "lucide-react";
import type { RqLayout } from "./use-rq-layout";

export type RowMotionPhase = "success_check" | "fade" | "collapse";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };

const RQ_BTN =
  "transition-[background-color_transform_color] duration-rq ease-out active:scale-[0.95] active:duration-90 active:ease-spring-out";

function fieldClass(layout: RqLayout, extra?: string): string {
  return cn(
    "w-full min-w-0 rounded-hh-standard border border-[var(--hh-border-default)] bg-[var(--hh-surface-workspace)] text-[var(--hh-text-primary)] shadow-none transition-[border-color,box-shadow,background-color] duration-150 ease-out",
    "hover:border-[var(--hh-border-input)] hover:bg-[var(--hh-surface-hover)] focus-visible:border-[var(--hh-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]",
    layout === "desktop" ? "h-9 px-2 text-xs" : "min-h-11 px-3 py-2 text-base leading-snug",
    extra
  );
}

export type ReceiptQueueRowCardProps = {
  layout: RqLayout;
  row: ReceiptQueueRow;
  previewUrl?: string;
  projects: ProjectRow[];
  workers: WorkerRow[];
  statusLabel: string;
  statusVariant: "default" | "success" | "warning" | "danger" | "muted";
  motion?: RowMotionPhase;
  rowLocked: boolean;
  activeQueueRowId: string | null;
  needsHighlight: boolean;
  newRowHighlight: boolean;
  vendorMissing: boolean;
  showAmountHint: boolean;
  vendorShake: boolean;
  amountShake: boolean;
  dup: string | null;
  bulkAdding: boolean;
  captureUploading: boolean;
  registerVendorRef: (id: string, el: HTMLInputElement | null) => void;
  registerAmountRef: (id: string, el: HTMLInputElement | null) => void;
  registerDateRef: (id: string, el: HTMLInputElement | null) => void;
  setActiveQueueRowId: (id: string | null) => void;
  onVendorChange: (id: string, v: string) => void;
  onAmountChange: (id: string, v: string) => void;
  onDateChange: (id: string, v: string) => void;
  onProjectChange: (id: string, v: string | null) => void;
  onCategoryChange: (id: string, v: string) => void;
  onPaymentChange: (id: string, v: string | null) => void;
  onWorkerChange: (id: string, v: string | null) => void;
  onPreview: (id: string) => void;
  onReplace: (id: string) => void;
  onConfirm: (row: ReceiptQueueRow) => void;
  onRemove: (id: string) => void;
  onEditableKeyDown: React.KeyboardEventHandler<HTMLInputElement | HTMLSelectElement>;
  onRetryOcr?: (id: string) => void;
};

function rowSnapshotEqual(a: ReceiptQueueRow, b: ReceiptQueueRow): boolean {
  return (
    a.id === b.id &&
    a.vendor_name === b.vendor_name &&
    a.amount === b.amount &&
    a.expense_date === b.expense_date &&
    a.project_id === b.project_id &&
    a.category === b.category &&
    a.payment_account_id === b.payment_account_id &&
    a.worker_id === b.worker_id &&
    a.status === b.status &&
    a.file_name === b.file_name &&
    a.mime_type === b.mime_type &&
    a.error_message === b.error_message &&
    a.ocr_source === b.ocr_source
  );
}

function propsEqual(prev: ReceiptQueueRowCardProps, next: ReceiptQueueRowCardProps): boolean {
  if (prev.layout !== next.layout) return false;
  if (!rowSnapshotEqual(prev.row, next.row)) return false;
  if (prev.previewUrl !== next.previewUrl) return false;
  if (prev.motion !== next.motion) return false;
  if (prev.rowLocked !== next.rowLocked) return false;
  if (prev.activeQueueRowId !== next.activeQueueRowId) return false;
  if (prev.needsHighlight !== next.needsHighlight) return false;
  if (prev.newRowHighlight !== next.newRowHighlight) return false;
  if (prev.vendorMissing !== next.vendorMissing) return false;
  if (prev.showAmountHint !== next.showAmountHint) return false;
  if (prev.vendorShake !== next.vendorShake) return false;
  if (prev.amountShake !== next.amountShake) return false;
  if (prev.dup !== next.dup) return false;
  if (prev.statusLabel !== next.statusLabel) return false;
  if (prev.statusVariant !== next.statusVariant) return false;
  if (prev.bulkAdding !== next.bulkAdding) return false;
  if (prev.captureUploading !== next.captureUploading) return false;
  if (prev.onRetryOcr !== next.onRetryOcr) return false;
  if (prev.projects !== next.projects) return false;
  if (prev.workers !== next.workers) return false;
  return true;
}

const DESKTOP_GRID =
  "grid w-full min-w-0 items-center gap-x-3 gap-y-2 [grid-template-columns:60px_72px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_88px]";

export const ReceiptQueueRowCard = React.memo(function ReceiptQueueRowCard({
  layout,
  row,
  previewUrl: prev,
  projects,
  workers,
  statusLabel,
  statusVariant,
  motion,
  rowLocked,
  activeQueueRowId,
  needsHighlight,
  newRowHighlight,
  vendorMissing,
  showAmountHint,
  vendorShake,
  amountShake,
  dup,
  bulkAdding,
  captureUploading,
  registerVendorRef,
  registerAmountRef,
  registerDateRef,
  setActiveQueueRowId,
  onVendorChange,
  onAmountChange,
  onDateChange,
  onProjectChange,
  onCategoryChange,
  onPaymentChange,
  onWorkerChange,
  onPreview,
  onReplace,
  onConfirm,
  onRemove,
  onEditableKeyDown,
  onRetryOcr,
}: ReceiptQueueRowCardProps) {
  const busy = row.status === "processing";
  const id = row.id;
  const compact = layout !== "desktop";
  const prefersReducedMotion = useReducedMotion();
  const fc = (e?: string) => fieldClass(layout, e);

  const thumbSize = compact
    ? "h-16 w-16 shrink-0 rounded-hh-panel"
    : "h-[52px] w-[52px] shrink-0 rounded-hh-standard";

  const thumbButton = (
    <button
      type="button"
      disabled={busy || !prev || rowLocked}
      aria-label="Preview receipt"
      data-queue-row-id={id}
      className={cn(
        "relative overflow-hidden border border-[var(--hh-border-default)] bg-[var(--hh-surface-subtle)] text-left transition-[opacity,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]",
        thumbSize,
        busy || !prev ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-95"
      )}
      onClick={() => onPreview(id)}
    >
      {row.mime_type === "application/pdf" || row.file_name.toLowerCase().endsWith(".pdf") ? (
        <div className="flex h-full w-full items-center justify-center bg-[var(--hh-surface-workspace)] text-[9px] font-medium text-[var(--hh-text-tertiary)]">
          PDF
        </div>
      ) : prev ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={prev} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--hh-text-tertiary)]">
          —
        </div>
      )}
      {busy ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--hh-surface-workspace)]/80">
          <InlineLoading className="h-4 w-4" size="md" aria-label="Processing" />
        </div>
      ) : null}
    </button>
  );

  const vendorInput = (
    <Input
      ref={(el) => registerVendorRef(id, el)}
      placeholder="Vendor"
      aria-label="Vendor"
      value={row.vendor_name}
      disabled={busy || rowLocked}
      data-queue-row-id={id}
      data-queue-field="vendor"
      onFocus={() => setActiveQueueRowId(id)}
      onChange={(e) => onVendorChange(id, e.target.value)}
      onKeyDown={onEditableKeyDown}
      className={cn(
        fc(),
        (vendorMissing || vendorShake) &&
          "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] focus-visible:border-[var(--hh-danger)] focus-visible:ring-[var(--hh-danger-border)]",
        vendorShake && !prefersReducedMotion && "animate-rq-confirm-shake"
      )}
      autoComplete="off"
    />
  );

  const vendorHintRow = (
    <div className="min-h-[18px] text-[11px] leading-tight text-[var(--hh-danger)]">
      {vendorMissing ? <span role="status">Vendor required</span> : <span aria-hidden>&nbsp;</span>}
    </div>
  );

  const amountInput = (
    <Input
      ref={(el) => registerAmountRef(id, el)}
      placeholder="Amount"
      aria-label="Amount"
      inputMode="decimal"
      value={row.amount}
      disabled={busy || rowLocked}
      data-queue-row-id={id}
      data-queue-field="amount"
      onFocus={() => setActiveQueueRowId(id)}
      onChange={(e) => onAmountChange(id, e.target.value)}
      onKeyDown={onEditableKeyDown}
      className={cn(
        fc(),
        "tabular-nums",
        (showAmountHint || amountShake) &&
          "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] focus-visible:border-[var(--hh-danger)] focus-visible:ring-[var(--hh-danger-border)]",
        amountShake && !prefersReducedMotion && "animate-rq-confirm-shake"
      )}
      autoComplete="off"
    />
  );

  const amountHintRow = (
    <div className="min-h-[18px] text-[11px] leading-tight text-[var(--hh-danger)]">
      {showAmountHint ? (
        <span role="status">Amount required</span>
      ) : (
        <span aria-hidden>&nbsp;</span>
      )}
    </div>
  );

  const dateInput = (
    <Input
      ref={(el) => registerDateRef(id, el)}
      type="date"
      aria-label="Expense date"
      value={row.expense_date.slice(0, 10)}
      disabled={busy || rowLocked}
      data-queue-row-id={id}
      data-queue-field="date"
      onFocus={() => setActiveQueueRowId(id)}
      onChange={(e) => onDateChange(id, e.target.value)}
      onKeyDown={onEditableKeyDown}
      className={fc()}
    />
  );

  const projectSelect = (
    <select
      aria-label="Project"
      className={fc()}
      value={row.project_id ?? ""}
      disabled={busy || rowLocked}
      data-queue-row-id={id}
      data-queue-field="project"
      onChange={(e) => onProjectChange(id, e.target.value || null)}
      onKeyDown={onEditableKeyDown}
    >
      <option value="">Project…</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name ?? p.id}
        </option>
      ))}
    </select>
  );

  const categorySelect = (
    <ExpenseCategorySelect
      value={row.category}
      disabled={busy || rowLocked}
      onValueChange={(v) => onCategoryChange(id, v)}
      className={fc()}
      onKeyDown={onEditableKeyDown}
      data-queue-row-id={id}
      data-queue-field="category"
    />
  );

  const paymentSelect = (
    <PaymentAccountSelect
      value={row.payment_account_id ?? ""}
      disabled={busy || rowLocked}
      onValueChange={(pid) => onPaymentChange(id, pid.trim() ? pid : null)}
      className={fc()}
      onKeyDown={onEditableKeyDown}
      data-queue-row-id={id}
      data-queue-field="payment"
    />
  );

  const workerSelect =
    workers.length > 0 ? (
      <select
        aria-label="Worker"
        className={cn(fc(), layout === "desktop" && "text-[11px]")}
        value={row.worker_id ?? ""}
        disabled={busy || rowLocked}
        data-queue-row-id={id}
        data-queue-field="worker"
        onChange={(e) => onWorkerChange(id, e.target.value || null)}
        onKeyDown={onEditableKeyDown}
      >
        <option value="">Company</option>
        {workers.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    ) : null;

  const confirmBtn = (
    <Button
      type="button"
      size="sm"
      className={cn(
        compact
          ? "h-11 min-h-11 w-full flex-1 rounded-hh-standard border border-transparent bg-[var(--hh-accent-primary)] px-4 text-sm font-semibold text-white shadow-none transition-transform duration-150 ease-out hover:bg-[var(--hh-accent-hover)] active:scale-[0.98]"
          : "h-9 w-full min-w-0 rounded-hh-standard border border-transparent bg-[var(--hh-accent-primary)] px-2 text-xs font-medium text-white shadow-none transition-transform duration-150 ease-out hover:bg-[var(--hh-accent-hover)] active:scale-[0.98]",
        RQ_BTN
      )}
      disabled={busy || bulkAdding || captureUploading || rowLocked}
      onClick={() => onConfirm(row)}
    >
      Confirm
    </Button>
  );

  const deleteBtn = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        compact
          ? "h-11 min-h-11 min-w-11 shrink-0 rounded-hh-standard border-[var(--hh-border-default)] px-3 text-[var(--hh-text-secondary)] transition-[background-color,transform,color,box-shadow] duration-150 ease-out hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] active:scale-[0.96]"
          : "h-9 min-w-9 shrink-0 rounded-hh-standard border-[var(--hh-border-default)] px-2 text-[var(--hh-text-secondary)] transition-[background-color,transform,color,box-shadow] duration-rq ease-out hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] active:scale-[0.96] active:duration-90 active:ease-spring-out",
        RQ_BTN
      )}
      disabled={busy || rowLocked}
      onClick={() => void onRemove(id)}
      aria-label="Remove"
    >
      <Trash2 className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />
    </Button>
  );

  const metaBlock = (
    <>
      {row.error_message ? (
        <p className="text-[10px] text-[var(--hh-danger)] md:text-[10px]">{row.error_message}</p>
      ) : null}
      {dup ? <p className="text-[10px] text-[var(--hh-text-tertiary)]">{dup}</p> : null}
      {row.status === "failed" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "btn-outline-ghost px-1.5",
            compact ? "h-11 min-h-11 text-xs" : "h-7 text-[10px]"
          )}
          onClick={() => onReplace(id)}
        >
          Re-upload
        </Button>
      ) : null}
      {onRetryOcr &&
      row.status === "pending" &&
      row.mime_type.startsWith("image/") &&
      row.receipt_public_url ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "btn-outline-ghost px-1.5",
            compact ? "h-11 min-h-11 text-xs" : "h-7 text-[10px]"
          )}
          data-testid="receipt-queue-retry-ocr"
          disabled={busy || rowLocked}
          onClick={() => onRetryOcr(id)}
        >
          Retry OCR
        </Button>
      ) : null}
    </>
  );

  const outerClass = cn(
    "relative shrink-0 overflow-hidden border border-[var(--hh-border-default)] bg-[var(--hh-surface-workspace)]",
    compact ? "max-h-none rounded-hh-panel" : "max-h-[520px] rounded-hh-panel",
    !!motion && "pointer-events-none",
    !!motion && !prefersReducedMotion && "will-change-[opacity,transform]",
    motion &&
      (prefersReducedMotion
        ? "transition-opacity duration-150 ease-out"
        : "transition-[transform,opacity,background-color,box-shadow] duration-200 ease-material-standard"),
    !motion && "transition-[background-color,box-shadow] duration-150 ease-out",
    !motion && !rowLocked && "hover:bg-[var(--hh-surface-hover)]",
    motion === "success_check" &&
      "bg-[var(--hh-success-soft-fill)] ring-1 ring-[var(--hh-success-border)]",
    motion === "fade" &&
      cn(
        "opacity-0",
        !prefersReducedMotion && "translate-x-2 !duration-200 !ease-material-standard"
      ),
    motion === "collapse" &&
      cn(
        "opacity-0",
        !prefersReducedMotion && "translate-x-2 !duration-200 !ease-material-standard"
      ),
    activeQueueRowId === id && "z-[1] ring-1 ring-inset ring-[var(--hh-accent-primary)]/30",
    activeQueueRowId === id && !needsHighlight && !motion && "bg-[var(--hh-accent-soft)]",
    newRowHighlight && "animate-receipt-queue-row-new",
    needsHighlight &&
      !motion &&
      "bg-[var(--hh-warning-soft-fill)] ring-1 ring-inset ring-[var(--hh-warning-border)]"
  );

  const successOverlayRounded = "rounded-hh-panel";

  if (compact) {
    return (
      <div
        data-testid="receipt-queue-row"
        data-receipt-queue-row={id}
        data-queue-file-name={row.file_name}
        className={outerClass}
      >
        {motion === "success_check" ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--hh-success-soft-fill)] animate-in fade-in duration-200",
              !prefersReducedMotion && "zoom-in-95",
              successOverlayRounded
            )}
            aria-hidden
          >
            <m.div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--hh-success)] text-white"
              initial={{
                transform: prefersReducedMotion ? "scale(1)" : "scale(0.95)",
                opacity: 0,
              }}
              animate={{ transform: "scale(1)", opacity: 1 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.15, ease: "easeOut" }
                  : { type: "spring", duration: 0.5, bounce: 0.2 }
              }
            >
              <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            </m.div>
          </div>
        ) : null}
        <div className="flex touch-manipulation flex-col gap-4 p-4">
          <div className="flex gap-3">
            {thumbButton}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <StatusBadge label={statusLabel} variant={statusVariant} />
              {vendorInput}
              {vendorHintRow}
              <p
                className="truncate text-[11px] font-medium text-[var(--hh-text-secondary)]"
                title={row.file_name}
              >
                {row.file_name || "—"}
              </p>
              {metaBlock}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              {amountInput}
              {amountHintRow}
            </div>
            <div className="min-w-0">{dateInput}</div>
          </div>

          <div className="flex flex-col gap-3">
            {projectSelect}
            {categorySelect}
            {paymentSelect}
            {workerSelect}
          </div>

          <div className="flex items-stretch gap-2 border-t border-[var(--hh-border-subtle)] pt-4">
            {confirmBtn}
            {deleteBtn}
          </div>
        </div>
      </div>
    );
  }

  const gridTable = (
    <>
      <div className="min-w-0 space-y-1">
        {thumbButton}
        <p
          className="truncate text-[10px] font-medium text-[var(--hh-text-secondary)]"
          title={row.file_name}
        >
          {row.file_name || "—"}
        </p>
        {metaBlock}
      </div>

      <div className="flex items-center pt-1">
        <StatusBadge label={statusLabel} variant={statusVariant} />
      </div>

      <div className="min-w-0">
        {vendorInput}
        {vendorHintRow}
      </div>

      <div className="min-w-0">
        {amountInput}
        {amountHintRow}
      </div>

      <div className="min-w-0">{dateInput}</div>

      <div className="min-w-0">{projectSelect}</div>

      <div className="min-w-0">{categorySelect}</div>

      <div className="min-w-0">{paymentSelect}</div>

      <div className="flex min-w-0 flex-col items-stretch justify-start gap-2">
        {workerSelect}
        <div className="flex items-center gap-1">
          {confirmBtn}
          {deleteBtn}
        </div>
      </div>
    </>
  );

  return (
    <div
      data-testid="receipt-queue-row"
      data-receipt-queue-row={id}
      data-queue-file-name={row.file_name}
      className={outerClass}
    >
      {motion === "success_check" ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--hh-success-soft-fill)] animate-in fade-in duration-200",
            !prefersReducedMotion && "zoom-in-95",
            successOverlayRounded
          )}
          aria-hidden
        >
          <m.div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--hh-success)] text-white"
            initial={{
              transform: prefersReducedMotion ? "scale(1)" : "scale(0.95)",
              opacity: 0,
            }}
            animate={{ transform: "scale(1)", opacity: 1 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.15, ease: "easeOut" }
                : { type: "spring", duration: 0.5, bounce: 0.2 }
            }
          >
            <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </m.div>
        </div>
      ) : null}
      <div className="px-3 py-3 lg:px-4">
        <div className={DESKTOP_GRID}>{gridTable}</div>
      </div>
    </div>
  );
}, propsEqual);
