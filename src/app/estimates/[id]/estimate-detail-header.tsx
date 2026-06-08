"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, ChevronDown, FilePlus2, MoreVertical, Trash2 } from "lucide-react";
import {
  EstimateBuilderSaveStatus,
  type EstimateSaveStatus,
} from "../_components/estimate-builder-save-status";
import { NeoStatus, type StatusBadgeVariant } from "@/components/base";
import { cn } from "@/lib/utils";

const DETAIL_HEADER =
  "dark rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-3 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)] sm:px-4";
const BACK_LINK =
  "inline-flex min-h-10 items-center gap-2 text-[14px] leading-snug text-[var(--neo-text-secondary)] transition-colors duration-200 hover:text-[var(--neo-gold-soft)] md:min-h-8";
const HEADER_BUTTON =
  "rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";
const HEADER_PRIMARY_BUTTON =
  "rounded-md border border-[rgb(198_165_106_/_0.28)] bg-[var(--neo-gold)] text-zinc-950 shadow-sm hover:bg-[var(--neo-gold-soft)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";

function estimateStatusMeta(status: string): { label: string; variant: StatusBadgeVariant } {
  if (status === "Draft") return { label: "Draft", variant: "muted" };
  if (status === "Sent") return { label: "Sent", variant: "warning" };
  if (status === "Approved") return { label: "Approved", variant: "success" };
  if (status === "Rejected") return { label: "Rejected", variant: "danger" };
  if (status === "Converted") return { label: "Converted to Project", variant: "success" };
  return { label: status || "Unknown", variant: "default" };
}

export function EstimateDetailHeader({
  estimateId,
  estimateNumber,
  clientName,
  projectName,
  siteAddress,
  status,
  editing,
  pending,
  saveStatus = "idle",
  isLocked,
  onEdit,
  onSave,
  onCancel,
  onMarkDraft,
  onSend,
  onApprove,
  onReject,
  onConvertClick,
  onSaveAsTemplateClick,
  onDeleteClick,
}: {
  estimateId: string;
  estimateNumber: string;
  clientName?: string;
  projectName?: string;
  siteAddress?: string;
  status: string;
  editing: boolean;
  pending: boolean;
  saveStatus?: EstimateSaveStatus;
  isLocked: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onMarkDraft: () => void;
  onSend: () => void;
  onApprove: () => void;
  onReject: () => void;
  /** Opens the Convert-to-Project setup drawer (no immediate convert). */
  onConvertClick?: () => void;
  onSaveAsTemplateClick?: () => void;
  onDeleteClick: () => void;
}): React.ReactElement {
  const canConvert = status === "Approved";
  const canSend = status === "Draft" && !editing;
  const statusMeta = estimateStatusMeta(status);
  const statusActions =
    status === "Draft"
      ? [{ label: "Mark as Draft", action: onMarkDraft, destructive: false }]
      : status === "Sent"
        ? [
            { label: "Mark accepted", action: onApprove, destructive: false },
            { label: "Mark declined", action: onReject, destructive: true },
            { label: "Mark as Draft", action: onMarkDraft, destructive: false },
          ]
        : status === "Approved" || status === "Rejected"
          ? [{ label: "Mark as Draft", action: onMarkDraft, destructive: false }]
          : [];

  return (
    <header className={DETAIL_HEADER} data-testid="estimate-detail-header">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <Link href="/estimates" className={BACK_LINK}>
            <ArrowLeft className="h-4 w-4" />
            Estimates
          </Link>
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-normal text-[var(--neo-text-primary)] sm:text-2xl">
                {estimateNumber}
              </h1>
              <NeoStatus
                label={statusMeta.label}
                variant={statusMeta.variant}
                className="h-5 px-2 text-[11px]"
              />
            </div>
            <p className="truncate text-sm text-[var(--neo-text-secondary)]">
              {[clientName, projectName, siteAddress].filter(Boolean).join(" · ") || "Estimate"}
            </p>
          </div>
          {editing ? <EstimateBuilderSaveStatus status={saveStatus} className="pt-0.5" /> : null}
        </div>

        <div
          className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end lg:max-w-[58%] lg:flex-nowrap"
          data-testid="estimate-detail-header-actions"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "min-h-11 whitespace-nowrap px-4 max-md:flex-1 md:min-h-8",
              HEADER_BUTTON
            )}
            disabled={pending}
            asChild
          >
            <Link href={`/estimates/${estimateId}/preview`}>Preview</Link>
          </Button>
          {!editing ? (
            <>
              {!isLocked ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className={cn(
                    "min-h-11 whitespace-nowrap px-4 max-md:flex-1 md:min-h-8",
                    HEADER_PRIMARY_BUTTON
                  )}
                  disabled={pending}
                  onClick={onEdit}
                >
                  Edit
                </Button>
              ) : null}
              {canSend ? (
                <Button
                  type="button"
                  size="sm"
                  className={cn(
                    "min-h-11 whitespace-nowrap px-4 max-md:flex-1 md:min-h-8",
                    HEADER_PRIMARY_BUTTON
                  )}
                  disabled={pending}
                  onClick={onSend}
                >
                  Send
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                className={cn(
                  "min-h-11 whitespace-nowrap px-5 font-medium max-md:flex-1 md:min-h-8",
                  HEADER_PRIMARY_BUTTON
                )}
                disabled={pending}
                onClick={onSave}
              >
                <SubmitSpinner loading={pending} className="mr-2" />
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "min-h-11 whitespace-nowrap px-4 max-md:flex-1 md:min-h-8",
                  HEADER_BUTTON
                )}
                disabled={pending}
                onClick={onCancel}
              >
                Cancel
              </Button>
            </>
          )}

          {!editing && statusActions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "min-h-11 whitespace-nowrap px-3 max-md:flex-1 md:min-h-8",
                    HEADER_BUTTON
                  )}
                  disabled={pending}
                >
                  Status <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[220px] rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-1 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]"
              >
                {statusActions.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onSelect={item.action}
                    className={cn(
                      "rounded-sm focus:bg-[var(--neo-surface-muted)] focus:text-[var(--neo-text-primary)]",
                      item.destructive && "text-rose-300 focus:text-rose-300"
                    )}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {!editing && canConvert && onConvertClick ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "min-h-11 whitespace-nowrap px-4 max-md:flex-1 md:min-h-8",
                HEADER_BUTTON
              )}
              disabled={pending}
              onClick={onConvertClick}
            >
              Convert to Project
            </Button>
          ) : null}

          {!editing && onSaveAsTemplateClick ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "min-h-11 w-11 shrink-0 md:min-h-8 md:w-auto md:px-3",
                    HEADER_BUTTON
                  )}
                  disabled={pending}
                  aria-label="Estimate actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[220px] rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-1 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]"
              >
                <DropdownMenuItem
                  onSelect={onSaveAsTemplateClick}
                  className="rounded-sm focus:bg-[var(--neo-surface-muted)] focus:text-[var(--neo-text-primary)]"
                  data-testid="save-estimate-as-template-action"
                >
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save as Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {!editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "min-h-11 w-11 shrink-0 md:min-h-8 md:w-auto",
                HEADER_BUTTON,
                "hover:border-rose-500/30 hover:text-rose-300"
              )}
              disabled={pending}
              onClick={onDeleteClick}
              aria-label="Delete estimate"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
