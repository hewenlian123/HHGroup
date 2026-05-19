"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { EstimateStatusBadge } from "../_components/estimate-status-badge";
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

  const subtitle = [clientName, projectName].filter(Boolean).join(" · ");

  return (
    <header className="border-b border-border/60 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Link
            href="/estimates"
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Estimates
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {estimateNumber}
            </h1>
            <EstimateStatusBadge
              status={status === "Converted" ? "Converted" : status}
              className="shrink-0 text-xs"
            />
          </div>
          {subtitle ? (
            <p className="text-sm text-muted-foreground/70 truncate">{subtitle}</p>
          ) : null}
          {siteAddress?.trim() ? (
            <p className="text-xs text-muted-foreground/50 truncate">{siteAddress}</p>
          ) : null}
          {editing ? <EstimateBuilderSaveStatus status={saveStatus} className="pt-0.5" /> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-md:w-full">
          {!editing ? (
            <>
              {!isLocked ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="min-h-11 rounded-sm px-4 max-md:flex-1"
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
                  className="min-h-11 rounded-sm px-4 max-md:flex-1"
                  disabled={pending}
                  onClick={onSend}
                >
                  Send
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 rounded-sm px-4 max-md:flex-1"
                asChild
              >
                <Link href={`/estimates/${estimateId}/preview`}>Preview</Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                className="min-h-11 rounded-sm px-5 font-medium shadow-sm max-md:flex-1"
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
                className="min-h-11 rounded-sm px-4 text-muted-foreground max-md:flex-1"
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
                  className="min-h-11 rounded-sm px-3"
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
              className="min-h-11 rounded-sm px-4"
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
              className="min-h-11 rounded-sm text-muted-foreground hover:text-destructive"
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
