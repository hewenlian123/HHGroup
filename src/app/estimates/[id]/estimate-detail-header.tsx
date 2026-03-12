"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EstimateStatusBadge } from "../_components/estimate-status-badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreHorizontal } from "lucide-react";

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
}) {
  const canConvert = status === "Approved";
  return (
    <header className="border-b border-zinc-200 dark:border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center min-w-0 gap-2">
          <Link href="/estimates" className="text-sm text-muted-foreground hover:text-foreground">
            Estimates
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">{estimateNumber}</span>
          <EstimateStatusBadge status={status === "Converted" ? "Converted" : status} className="shrink-0 rounded-md text-xs" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md h-8"
              disabled={isLocked || pending}
              onClick={onEdit}
            >
              Edit
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" className="rounded-md h-8" disabled={pending} onClick={onSave}>
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-md h-8" disabled={pending} onClick={onCancel}>
                Cancel
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="rounded-md h-8" disabled={pending}>
                Status <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuItem onSelect={onMarkDraft}>Mark as Draft</DropdownMenuItem>
              <DropdownMenuItem onSelect={onSend}>Send</DropdownMenuItem>
              <DropdownMenuItem onSelect={onApprove}>Approve</DropdownMenuItem>
              <DropdownMenuItem onSelect={onReject}>Reject</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canConvert && onConvertClick && (
            <Button
              type="button"
              size="sm"
              className="rounded-md h-8"
              disabled={pending}
              onClick={onConvertClick}
            >
              Convert
            </Button>
          )}

          <Button variant="outline" size="sm" className="rounded-md h-8 shrink-0" asChild>
            <Link href={`/estimates/${estimateId}/preview`}>Preview</Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem asChild>
                <Link href="/estimates">Back to list</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
