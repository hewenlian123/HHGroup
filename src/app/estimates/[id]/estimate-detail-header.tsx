"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  FileClock,
  FilePlus2,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { EstimateSaveStatus } from "../_components/estimate-builder-save-status";
import type { EstimateRevisionContext } from "@/lib/estimates-db";
import { cn } from "@/lib/utils";
import {
  ESTIMATE_HEADER_BUTTON,
  ESTIMATE_HEADER_PRIMARY_BUTTON,
  EstimateWorkspaceCommandHeader,
} from "../_components/estimate-workspace-command-header";

export function EstimateDetailHeader({
  estimateId,
  estimateNumber,
  revisionContext,
  clientName,
  projectName,
  siteAddress,
  status,
  editing,
  pending,
  saveStatus = "idle",
  isLocked,
  onEdit,
  onEditDetails,
  onSave,
  onSaveAndPreview,
  onPreview,
  onDone,
  onSend,
  onApprove,
  onReject,
  onConvertClick,
  onCreateRevision,
  onDuplicateClick,
  onSaveAsTemplateClick,
  onDeleteClick,
}: {
  estimateId: string;
  estimateNumber: string;
  revisionContext?: EstimateRevisionContext | null;
  clientName?: string;
  projectName?: string;
  siteAddress?: string;
  status: string;
  editing: boolean;
  pending: boolean;
  saveStatus?: EstimateSaveStatus;
  isLocked: boolean;
  onEdit: () => void;
  onEditDetails?: () => void;
  onSave: () => void;
  onSaveAndPreview: () => void;
  onPreview?: () => void;
  onDone: () => void;
  onSend: () => void;
  onApprove: () => void;
  onReject: () => void;
  /** Opens the Convert-to-Project setup drawer (no immediate convert). */
  onConvertClick?: () => void;
  onCreateRevision?: () => void;
  onDuplicateClick?: () => void;
  onSaveAsTemplateClick?: () => void;
  onDeleteClick: () => void;
}): React.ReactElement {
  const canConvert = status === "Approved";
  const canSend = status === "Draft" && !editing;
  const canDelete = status === "Draft";
  const canCreateRevision =
    Boolean(revisionContext?.isCurrent) &&
    ["Approved", "Rejected", "Converted"].includes(status) &&
    Boolean(onCreateRevision);
  const revisionLabel = revisionContext
    ? `${estimateNumber} Rev ${revisionContext.revisionNumber}`
    : estimateNumber;
  const statusActions =
    status === "Sent"
      ? [
          { label: "Mark accepted", action: onApprove, destructive: false },
          { label: "Mark declined", action: onReject, destructive: true },
        ]
      : [];
  const hasMobileSecondaryActions =
    canSend ||
    statusActions.length > 0 ||
    (canConvert && Boolean(onConvertClick)) ||
    canCreateRevision ||
    Boolean(revisionContext?.previousRevisionId) ||
    Boolean(revisionContext && !revisionContext.isCurrent) ||
    Boolean(onDuplicateClick) ||
    Boolean(onSaveAsTemplateClick);

  return (
    <EstimateWorkspaceCommandHeader
      title={revisionLabel}
      status={status}
      context={[clientName, projectName, siteAddress]}
      saveStatus={editing ? saveStatus : "idle"}
      reserveSaveStatusSpace={editing}
      testId="estimate-detail-header"
    >
      <div
        className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 max-md:flex-nowrap sm:w-auto sm:justify-end lg:max-w-[58%] lg:flex-nowrap"
        data-testid="estimate-detail-header-actions"
      >
        {editing && onEditDetails ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "min-h-11 whitespace-nowrap px-4 max-md:flex-1 lg:min-h-8",
              ESTIMATE_HEADER_BUTTON
            )}
            disabled={pending}
            onClick={onEditDetails}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
            Edit details
          </Button>
        ) : null}
        {editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "hidden min-h-11 whitespace-nowrap px-4 lg:inline-flex lg:min-h-8",
              ESTIMATE_HEADER_BUTTON
            )}
            disabled={pending}
            onClick={onSaveAndPreview}
          >
            Save &amp; Preview
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-h-11 whitespace-nowrap px-4 max-md:flex-1", ESTIMATE_HEADER_BUTTON)}
            disabled={pending}
            asChild
          >
            <Link
              href={`/estimates/${estimateId}/preview`}
              onClick={(event) => {
                if (!onPreview) return;
                event.preventDefault();
                onPreview();
              }}
            >
              Preview
            </Link>
          </Button>
        )}
        {!editing && revisionContext?.previousRevisionId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "hidden min-h-11 whitespace-nowrap px-3 md:inline-flex lg:min-h-8",
              ESTIMATE_HEADER_BUTTON
            )}
            asChild
          >
            <Link href={`/estimates/${revisionContext.previousRevisionId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Previous revision
            </Link>
          </Button>
        ) : null}
        {!editing && revisionContext && !revisionContext.isCurrent ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "hidden min-h-11 whitespace-nowrap px-3 md:inline-flex lg:min-h-8",
              ESTIMATE_HEADER_BUTTON
            )}
            asChild
          >
            <Link href={`/estimates/${revisionContext.currentRevisionId}`}>Current revision</Link>
          </Button>
        ) : null}
        {!editing ? (
          <>
            {!isLocked ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className={cn(
                  "min-h-11 whitespace-nowrap px-4 max-md:flex-1 lg:min-h-8",
                  ESTIMATE_HEADER_PRIMARY_BUTTON
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
                variant="outline"
                size="sm"
                className={cn(
                  "hidden min-h-11 whitespace-nowrap px-4 md:inline-flex lg:min-h-8",
                  ESTIMATE_HEADER_BUTTON
                )}
                disabled={pending}
                onClick={onSend}
              >
                Mark as Sent
              </Button>
            ) : null}
          </>
        ) : (
          <div className="hidden lg:contents">
            <Button
              type="button"
              size="sm"
              className={cn(
                "min-h-11 whitespace-nowrap px-5 font-medium lg:min-h-8",
                ESTIMATE_HEADER_PRIMARY_BUTTON
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
              className={cn("min-h-11 whitespace-nowrap px-4 lg:min-h-8", ESTIMATE_HEADER_BUTTON)}
              disabled={pending}
              onClick={onDone}
            >
              Done
            </Button>
          </div>
        )}

        {!editing && statusActions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "hidden min-h-11 whitespace-nowrap px-3 md:inline-flex lg:min-h-8",
                  ESTIMATE_HEADER_BUTTON
                )}
                disabled={pending}
              >
                Status <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[220px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {statusActions.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  onSelect={item.action}
                  className={cn(
                    "rounded-sm focus:bg-muted focus:text-foreground",
                    item.destructive && "text-destructive focus:text-destructive"
                  )}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {!editing && canCreateRevision && onCreateRevision ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "hidden min-h-11 whitespace-nowrap px-4 md:inline-flex lg:min-h-8",
              ESTIMATE_HEADER_BUTTON
            )}
            disabled={pending}
            onClick={onCreateRevision}
            data-testid="create-estimate-revision-action"
          >
            <FileClock className="mr-2 h-4 w-4" aria-hidden />
            Create Revision
          </Button>
        ) : null}

        {!editing && canConvert && onConvertClick ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "hidden min-h-11 whitespace-nowrap px-4 md:inline-flex lg:min-h-8",
              ESTIMATE_HEADER_BUTTON
            )}
            disabled={pending}
            onClick={onConvertClick}
          >
            Convert to Project
          </Button>
        ) : null}

        {!editing && (onDuplicateClick || onSaveAsTemplateClick) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "hidden min-h-11 w-11 shrink-0 md:inline-flex md:w-auto md:px-3 lg:min-h-8",
                  ESTIMATE_HEADER_BUTTON
                )}
                disabled={pending}
                aria-label="Estimate actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[220px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {onDuplicateClick ? (
                <DropdownMenuItem
                  onSelect={onDuplicateClick}
                  className="rounded-sm focus:bg-muted focus:text-foreground"
                  data-testid="duplicate-estimate-action"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate as Draft
                </DropdownMenuItem>
              ) : null}
              {onSaveAsTemplateClick ? (
                <DropdownMenuItem
                  onSelect={onSaveAsTemplateClick}
                  className="rounded-sm focus:bg-muted focus:text-foreground"
                  data-testid="save-estimate-as-template-action"
                >
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save as Template
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {!editing && canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "hidden min-h-11 w-11 shrink-0 md:inline-flex md:w-auto lg:min-h-8",
              ESTIMATE_HEADER_BUTTON,
              "hover:border-destructive/30 hover:text-destructive"
            )}
            disabled={pending}
            onClick={onDeleteClick}
            aria-label="Delete estimate"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}

        {!editing ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("min-h-11 min-w-11 shrink-0 px-0 md:hidden", ESTIMATE_HEADER_BUTTON)}
                disabled={pending}
                aria-label="More estimate actions"
              >
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[220px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {canSend ? (
                <DropdownMenuItem
                  onSelect={onSend}
                  className="min-h-11 rounded-sm focus:bg-muted focus:text-foreground"
                >
                  Mark as Sent
                </DropdownMenuItem>
              ) : null}
              {statusActions.map((item) => (
                <DropdownMenuItem
                  key={`mobile-${item.label}`}
                  onSelect={item.action}
                  className={cn(
                    "min-h-11 rounded-sm focus:bg-muted focus:text-foreground",
                    item.destructive && "text-destructive focus:text-destructive"
                  )}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
              {canConvert && onConvertClick ? (
                <DropdownMenuItem
                  onSelect={onConvertClick}
                  className="min-h-11 rounded-sm focus:bg-muted focus:text-foreground"
                >
                  Convert to Project
                </DropdownMenuItem>
              ) : null}
              {canCreateRevision && onCreateRevision ? (
                <DropdownMenuItem
                  onSelect={onCreateRevision}
                  className="min-h-11 rounded-sm focus:bg-muted focus:text-foreground"
                  data-testid="create-estimate-revision-action-mobile"
                >
                  <FileClock className="mr-2 h-4 w-4" aria-hidden />
                  Create Revision
                </DropdownMenuItem>
              ) : null}
              {revisionContext?.previousRevisionId ? (
                <DropdownMenuItem asChild className="min-h-11 rounded-sm">
                  <Link href={`/estimates/${revisionContext.previousRevisionId}`}>
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                    Previous revision
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {revisionContext && !revisionContext.isCurrent ? (
                <DropdownMenuItem asChild className="min-h-11 rounded-sm">
                  <Link href={`/estimates/${revisionContext.currentRevisionId}`}>
                    Current revision
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {onDuplicateClick ? (
                <DropdownMenuItem
                  onSelect={onDuplicateClick}
                  className="min-h-11 rounded-sm focus:bg-muted focus:text-foreground"
                  data-testid="duplicate-estimate-action-mobile"
                >
                  <Copy className="mr-2 h-4 w-4" aria-hidden />
                  Duplicate as Draft
                </DropdownMenuItem>
              ) : null}
              {onSaveAsTemplateClick ? (
                <DropdownMenuItem
                  onSelect={onSaveAsTemplateClick}
                  className="min-h-11 rounded-sm focus:bg-muted focus:text-foreground"
                  data-testid="save-estimate-as-template-action-mobile"
                >
                  <FilePlus2 className="mr-2 h-4 w-4" aria-hidden />
                  Save as Template
                </DropdownMenuItem>
              ) : null}
              {hasMobileSecondaryActions && canDelete ? <DropdownMenuSeparator /> : null}
              {canDelete ? (
                <DropdownMenuItem
                  onSelect={onDeleteClick}
                  className="min-h-11 rounded-sm text-destructive focus:bg-muted focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Delete estimate
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </EstimateWorkspaceCommandHeader>
  );
}
