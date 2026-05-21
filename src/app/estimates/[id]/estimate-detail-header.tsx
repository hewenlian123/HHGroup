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
import { ArrowLeft, ChevronDown, Trash2 } from "lucide-react";
import {
  EstimateBuilderSaveStatus,
  type EstimateSaveStatus,
} from "../_components/estimate-builder-save-status";
import { EB } from "../_components/estimate-builder-ui";
import { cn } from "@/lib/utils";

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
  onDeleteClick: () => void;
}): React.ReactElement {
  const canConvert = status === "Approved";
  const canSend = status === "Draft" && !editing;
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
    <header className={EB.glassHeader} data-testid="estimate-detail-header">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Link href="/estimates" className={EB.backLink}>
            <ArrowLeft className="h-4 w-4" />
            Estimates
          </Link>
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
                {estimateNumber}
              </h1>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-100">
                {status}
              </span>
            </div>
            <p className="truncate text-sm text-zinc-400">
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
            className={cn("min-h-11 whitespace-nowrap px-4 max-md:flex-1 md:min-h-8", EB.btnGhost)}
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
                    EB.btnPrimary
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
                    EB.btnPrimary
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
                  EB.btnPrimary
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
                  EB.btnGhost
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
                    EB.btnGhost
                  )}
                  disabled={pending}
                >
                  Status <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                {statusActions.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onSelect={item.action}
                    className={item.destructive ? "text-destructive focus:text-destructive" : ""}
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
                EB.btnGhost
              )}
              disabled={pending}
              onClick={onConvertClick}
            >
              Convert to Project
            </Button>
          ) : null}

          {!editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "min-h-11 w-11 shrink-0 md:min-h-8 md:w-auto",
                EB.btnGhost,
                "hover:text-red-400"
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
