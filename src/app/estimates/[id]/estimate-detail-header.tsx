"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EstimateStatusBadge } from "../_components/estimate-status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, ChevronDown, Trash2 } from "lucide-react";

export function EstimateDetailHeader({
  estimateId,
  estimateNumber,
  status,
  editing,
  pending,
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
  status: string;
  editing: boolean;
  pending: boolean;
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
}) {
  const canConvert = status === "Approved";
  const statusActions =
    status === "Draft"
      ? [{ label: "Send", action: onSend, destructive: false }]
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
    <header className="border-b border-zinc-200 dark:border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center min-w-0 gap-2">
          <Link
            href="/estimates"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Estimates
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {estimateNumber}
          </span>
          <EstimateStatusBadge
            status={status === "Converted" ? "Converted" : status}
            className="shrink-0 rounded-md text-xs"
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-md:w-full max-md:[&>*]:flex-1">
          {!editing ? (
            <Button
              type="button"
              variant={canConvert ? "outline" : "default"}
              size="sm"
              className={canConvert ? "btn-outline-ghost rounded-md h-8" : "rounded-md h-8"}
              disabled={isLocked || pending}
              onClick={onEdit}
            >
              Edit
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                className="rounded-md h-8"
                disabled={pending}
                onClick={onSave}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md h-8"
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
                  className="rounded-md h-8"
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

          {!editing && canConvert && onConvertClick && (
            <Button
              type="button"
              size="sm"
              className="rounded-md h-8"
              disabled={pending}
              onClick={onConvertClick}
            >
              Convert to Project
            </Button>
          )}

          {!editing ? (
            <Button variant="outline" size="sm" className="rounded-md h-8 shrink-0" asChild>
              <Link href={`/estimates/${estimateId}/preview`}>Preview</Link>
            </Button>
          ) : null}

          {!editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-destructive rounded-md h-8 shrink-0"
              disabled={pending}
              onClick={onDeleteClick}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
