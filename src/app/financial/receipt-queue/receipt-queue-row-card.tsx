"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/base";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { cn } from "@/lib/utils";
import type { ReceiptQueueRow } from "@/lib/receipt-queue";
import { Check, Loader2, Trash2 } from "lucide-react";
import type { RqLayout } from "./use-rq-layout";

export type RowMotionPhase = "success_check" | "fade" | "collapse";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };

const RQ_BTN =
  "transition-[background-color,transform,color] duration-[140ms] ease-out active:scale-[0.95] active:duration-90 active:ease-[cubic-bezier(0.34,1.56,0.64,1)]";

function fieldClass(layout: RqLayout, extra?: string): string {
  return cn(
    "w-full min-w-0 border border-gray-200 bg-white text-[#111827] shadow-none transition-[border-color,box-shadow,background-color] duration-150 ease-out",
    "hover:border-gray-300 focus-visible:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35",
    layout === "mobile"
      ? "min-h-10 rounded-xl px-3 py-2 text-base leading-snug"
      : "h-9 rounded-lg text-xs",
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
  if (prev.projects !== next.projects) return false;
  if (prev.workers !== next.workers) return false;
  return true;
}

const TABLET_GRID =
  "grid min-w-[700px] w-full items-center gap-x-2 gap-y-2 [grid-template-columns:52px_72px_minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_92px]";

const DESKTOP_GRID =
  "grid min-w-[920px] w-full items-center gap-x-3 gap-y-2 [grid-template-columns:60px_80px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px]";

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
}: ReceiptQueueRowCardProps) {
  const busy = row.status === "processing";
  const id = row.id;
  const fc = (e?: string) => fieldClass(layout, e);

  const thumbSize =
    layout === "mobile" ? "h-16 w-16 shrink-0 rounded-xl" : "h-[52px] w-[52px] shrink-0 rounded-lg";

  const thumbButton = (
    <button
      type="button"
      disabled={busy || !prev || rowLocked}
      aria-label="Preview receipt"
      data-queue-row-id={id}
      className={cn(
        "relative overflow-hidden border border-gray-200 text-left transition-[opacity,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35",
        thumbSize,
        busy || !prev
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:opacity-95 hover:shadow-sm"
      )}
      onClick={() => onPreview(id)}
    >
      {row.mime_type === "application/pdf" || row.file_name.toLowerCase().endsWith(".pdf") ? (
        <div className="flex h-full w-full items-center justify-center bg-white text-[9px] font-medium text-muted-foreground">
          PDF
        </div>
      ) : prev ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={prev} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
          —
        </div>
      )}
      {busy ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </button>
  );

  const vendorInput = (
    <Input
      ref={(el) => registerVendorRef(id, el)}
      placeholder="Vendor"
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
          "border-red-500 bg-red-50 focus-visible:border-red-500 focus-visible:ring-red-400/30",
        vendorShake && "animate-rq-confirm-shake"
      )}
      autoComplete="off"
    />
  );

  const vendorHintRow = (
    <div className="min-h-[18px] text-[11px] leading-tight text-red-600 dark:text-red-400">
      {vendorMissing ? <span role="status">Vendor required</span> : <span aria-hidden>&nbsp;</span>}
    </div>
  );

  const amountInput = (
    <Input
      ref={(el) => registerAmountRef(id, el)}
      placeholder="Amount"
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
          "border-red-500 bg-red-50 focus-visible:border-red-500 focus-visible:ring-red-400/30",
        amountShake && "animate-rq-confirm-shake"
      )}
      autoComplete="off"
    />
  );

  const amountHintRow = (
    <div className="min-h-[18px] text-[11px] leading-tight text-red-600 dark:text-red-400">
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
        className={cn(fc(), layout !== "mobile" && "text-[11px]")}
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
        layout === "mobile"
          ? "h-11 min-h-10 w-full flex-1 rounded-xl border border-transparent bg-black px-4 text-sm font-semibold text-white shadow-sm hover:border-gray-800 hover:bg-gray-900 hover:shadow-md"
          : "h-9 w-full min-w-0 rounded-lg border border-transparent bg-black px-2 text-xs font-medium text-white shadow-sm hover:border-gray-700 hover:bg-gray-900 hover:shadow",
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
        layout === "mobile"
          ? "h-11 min-h-10 min-w-[2.75rem] shrink-0 rounded-xl border-gray-200 px-3 text-muted-foreground transition-[background-color,transform,color,box-shadow] duration-150 ease-out hover:border-red-200/80 hover:bg-[#fef2f2] hover:text-[#ef4444] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35 active:scale-[0.96]"
          : "h-9 shrink-0 rounded-lg border-gray-200 px-2 text-muted-foreground transition-[background-color,transform,color,box-shadow] duration-[140ms] ease-out hover:scale-110 hover:border-red-200/80 hover:bg-[#fef2f2] hover:text-[#ef4444] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35 active:scale-[0.88] active:duration-90 active:ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        RQ_BTN
      )}
      disabled={busy || rowLocked}
      onClick={() => void onRemove(id)}
      aria-label="Remove"
    >
      <Trash2 className={layout === "mobile" ? "h-4 w-4" : "h-3.5 w-3.5"} />
    </Button>
  );

  const metaBlock = (
    <>
      {row.error_message ? (
        <p className="text-[10px] text-destructive md:text-[10px]">{row.error_message}</p>
      ) : null}
      {dup ? <p className="text-[10px] text-amber-700 dark:text-amber-300">{dup}</p> : null}
      {row.status === "failed" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "px-1.5",
            layout === "mobile" ? "h-10 min-h-10 text-xs" : "h-6 text-[10px]"
          )}
          onClick={() => onReplace(id)}
        >
          Re-upload
        </Button>
      ) : null}
    </>
  );

  const outerClass = cn(
    "relative shrink-0 overflow-hidden bg-white dark:bg-card",
    layout === "mobile"
      ? "max-h-none rounded-xl shadow-[0_2px_16px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04] dark:ring-white/10"
      : "max-h-[520px] rounded-lg shadow-[0_1px_3px_rgba(15,23,42,0.07)]",
    !!motion && "pointer-events-none will-change-[opacity,transform,max-height]",
    "transition-[transform,opacity,background-color,max-height,margin,padding,box-shadow] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
    !motion &&
      !rowLocked &&
      layout !== "mobile" &&
      "hover:-translate-y-px hover:bg-gray-50 hover:shadow-md",
    !motion && !rowLocked && layout === "mobile" && "active:scale-[0.99]",
    motion === "success_check" && "bg-emerald-50 shadow-md ring-1 ring-emerald-200/80",
    motion === "fade" && "translate-x-2 opacity-0 !duration-200 !ease-[cubic-bezier(0.4,0,0.2,1)]",
    motion === "collapse" &&
      "!mb-0 !max-h-0 !translate-x-2 !py-0 !opacity-0 !duration-200 !ease-[cubic-bezier(0.4,0,0.2,1)]",
    activeQueueRowId === id && "z-[1] ring-1 ring-inset ring-blue-400/25 dark:ring-border",
    activeQueueRowId === id && !needsHighlight && !motion && "bg-blue-50/40 dark:bg-muted/25",
    newRowHighlight && "animate-receipt-queue-row-new",
    needsHighlight &&
      !motion &&
      "bg-[#FFFBEB] shadow-[inset_3px_0_0_0_#F59E0B] dark:bg-amber-950/35 dark:shadow-[inset_3px_0_0_0_rgb(245,158,11)]",
    needsHighlight &&
      !motion &&
      !rowLocked &&
      layout !== "mobile" &&
      "hover:-translate-y-px hover:bg-[#FEF9E8] hover:shadow-md dark:hover:bg-amber-950/50"
  );

  const successOverlayRounded = layout === "mobile" ? "rounded-xl" : "rounded-lg";

  if (layout === "mobile") {
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
              "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-emerald-50/92 animate-in fade-in zoom-in-95 duration-200",
              successOverlayRounded
            )}
            aria-hidden
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md">
              <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            </div>
          </div>
        ) : null}
        <div className="flex touch-manipulation flex-col gap-4 p-4">
          <div className="flex gap-3">
            {thumbButton}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <StatusBadge label={statusLabel} variant={statusVariant} />
              {vendorInput}
              {vendorHintRow}
              <p className="truncate text-[11px] font-medium text-[#111827]" title={row.file_name}>
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

          <div className="flex items-stretch gap-2 border-t border-border/40 pt-4">
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
        <p className="truncate text-[10px] font-medium text-[#111827]" title={row.file_name}>
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
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-emerald-50/92 animate-in fade-in zoom-in-95 duration-200",
            successOverlayRounded
          )}
          aria-hidden
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
            <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </div>
        </div>
      ) : null}
      <div className={cn("py-3", layout === "tablet" ? "px-2 md:px-3" : "px-3 lg:px-4")}>
        <div className="overflow-x-auto lg:overflow-x-visible">
          <div className={layout === "tablet" ? TABLET_GRID : DESKTOP_GRID}>{gridTable}</div>
        </div>
      </div>
    </div>
  );
}, propsEqual);
