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
  Activity,
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Copy,
  FileClock,
  FilePlus2,
  History,
  Info,
  MoreVertical,
  Pencil,
  StickyNote,
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
import { formatEstimateCurrency } from "../_components/estimate-currency";

function formatHeaderDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function EstimateDetailHeader({
  estimateId,
  estimateNumber,
  revisionContext,
  clientName,
  projectName,
  siteAddress,
  estimateDate,
  validUntil,
  grandTotal,
  status,
  editing,
  pending,
  saveStatus = "idle",
  isLocked,
  onEdit,
  onEditDetails,
  onInfoClick,
  onPricingClick,
  onNotesClick,
  onPaymentScheduleClick,
  onActivityClick,
  onRevisionHistoryClick,
  onSave,
  onSaveAndPreview,
  onPreview,
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
  estimateDate?: string | null;
  validUntil?: string | null;
  grandTotal?: number | null;
  status: string;
  editing: boolean;
  pending: boolean;
  saveStatus?: EstimateSaveStatus;
  isLocked: boolean;
  onEdit: () => void;
  onEditDetails?: () => void;
  onInfoClick?: () => void;
  onPricingClick?: () => void;
  onNotesClick?: () => void;
  onPaymentScheduleClick?: () => void;
  onActivityClick?: () => void;
  onRevisionHistoryClick?: () => void;
  onSave: () => void;
  onSaveAndPreview: () => void;
  onPreview?: () => void;
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
  const isCurrentRevision = revisionContext?.isCurrent ?? true;
  const canConvert = isCurrentRevision && status === "Approved";
  const canSend = isCurrentRevision && status === "Draft" && !editing;
  const canDelete = isCurrentRevision && status === "Draft";
  const canCreateRevision =
    Boolean(revisionContext?.isCurrent) &&
    ["Approved", "Rejected", "Converted"].includes(status) &&
    Boolean(onCreateRevision);
  const revisionLabel = revisionContext ? `Rev ${revisionContext.revisionNumber}` : undefined;
  const statusActions =
    isCurrentRevision && status === "Sent"
      ? [
          { label: "Mark accepted", action: onApprove, destructive: false },
          { label: "Mark declined", action: onReject, destructive: true },
        ]
      : [];
  const headerUtilityActions = [
    { label: "Info", action: onInfoClick, Icon: Info },
    { label: "Pricing", action: onPricingClick, Icon: CircleDollarSign },
    { label: "Notes", action: onNotesClick, Icon: StickyNote },
  ].filter((item) => Boolean(item.action));
  const overflowUtilityActions = [
    { label: "Payment Schedule", action: onPaymentScheduleClick, Icon: CalendarDays },
    { label: "Activity", action: onActivityClick, Icon: Activity },
    { label: "Revision History", action: onRevisionHistoryClick, Icon: History },
  ].filter((item) => Boolean(item.action));
  const hasMobileSecondaryActions =
    headerUtilityActions.length > 0 ||
    overflowUtilityActions.length > 0 ||
    canSend ||
    statusActions.length > 0 ||
    (canConvert && Boolean(onConvertClick)) ||
    canCreateRevision ||
    Boolean(revisionContext?.previousRevisionId) ||
    Boolean(revisionContext && !revisionContext.isCurrent) ||
    Boolean(onDuplicateClick) ||
    Boolean(onSaveAsTemplateClick);
  const visibleSaveStatus = editing && saveStatus === "idle" ? "saved" : saveStatus;

  return (
    <EstimateWorkspaceCommandHeader
      title={estimateNumber}
      revisionLabel={revisionLabel}
      status={status}
      context={[clientName, projectName, siteAddress]}
      facts={[
        { label: "Estimate date", value: formatHeaderDate(estimateDate) ?? "—" },
        { label: "Valid until", value: formatHeaderDate(validUntil) ?? "—" },
      ]}
      amount={grandTotal == null ? undefined : formatEstimateCurrency(grandTotal)}
      saveStatus={editing ? visibleSaveStatus : "idle"}
      reserveSaveStatusSpace={editing}
      testId="estimate-detail-header"
    >
      <div
        className="eb-estimate-command-actions flex w-full min-w-0 flex-wrap items-center justify-start gap-1.5 max-md:flex-nowrap sm:justify-end xl:w-auto xl:max-w-[68%] xl:flex-nowrap"
        data-testid="estimate-detail-header-actions"
      >
        {headerUtilityActions.map(({ label, action, Icon }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "eb-estimate-header-utility hidden min-h-8 whitespace-nowrap px-2.5 xl:inline-flex",
              ESTIMATE_HEADER_BUTTON
            )}
            disabled={pending}
            onClick={action}
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {label}
          </Button>
        ))}
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
            {!isLocked && isCurrentRevision ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "min-h-11 whitespace-nowrap px-4 max-md:flex-1 lg:min-h-8",
                  ESTIMATE_HEADER_BUTTON
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
                  ESTIMATE_HEADER_PRIMARY_BUTTON
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
          </div>
        )}

        {!editing && statusActions.length > 0 ? (
          <>
            <Button
              type="button"
              size="sm"
              className={cn(
                "hidden min-h-11 whitespace-nowrap px-4 md:inline-flex lg:min-h-8",
                ESTIMATE_HEADER_PRIMARY_BUTTON
              )}
              disabled={pending}
              onClick={onApprove}
            >
              Mark accepted
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "hidden min-h-11 whitespace-nowrap px-4 lg:inline-flex lg:min-h-8",
                ESTIMATE_HEADER_BUTTON,
                "hover:border-destructive/30 hover:text-destructive"
              )}
              disabled={pending}
              onClick={onReject}
            >
              Mark declined
            </Button>
          </>
        ) : null}

        {!editing && canCreateRevision && onCreateRevision ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "hidden min-h-11 whitespace-nowrap px-4 md:inline-flex lg:min-h-8",
              canConvert ? ESTIMATE_HEADER_BUTTON : ESTIMATE_HEADER_PRIMARY_BUTTON
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
              ESTIMATE_HEADER_PRIMARY_BUTTON
            )}
            disabled={pending}
            onClick={onConvertClick}
          >
            Convert to Project
          </Button>
        ) : null}

        {overflowUtilityActions.length > 0 ||
        headerUtilityActions.length > 0 ||
        (!editing && (onDuplicateClick || onSaveAsTemplateClick || canDelete)) ? (
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
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {headerUtilityActions.map(({ label, action, Icon }) => (
                <DropdownMenuItem key={label} onSelect={action}>
                  <Icon className="mr-2 h-4 w-4" aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
              {overflowUtilityActions.map(({ label, action, Icon }) => (
                <DropdownMenuItem key={label} onSelect={action}>
                  <Icon className="mr-2 h-4 w-4" aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
              {(headerUtilityActions.length > 0 || overflowUtilityActions.length > 0) &&
              !editing &&
              (onDuplicateClick || onSaveAsTemplateClick) ? (
                <DropdownMenuSeparator />
              ) : null}
              {!editing && onDuplicateClick ? (
                <DropdownMenuItem
                  onSelect={onDuplicateClick}
                  data-testid="duplicate-estimate-action"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate as Draft
                </DropdownMenuItem>
              ) : null}
              {!editing && onSaveAsTemplateClick ? (
                <DropdownMenuItem
                  onSelect={onSaveAsTemplateClick}
                  data-testid="save-estimate-as-template-action"
                >
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save as Template
                </DropdownMenuItem>
              ) : null}
              {!editing &&
              canDelete &&
              (headerUtilityActions.length > 0 ||
                overflowUtilityActions.length > 0 ||
                onDuplicateClick ||
                onSaveAsTemplateClick) ? (
                <DropdownMenuSeparator />
              ) : null}
              {!editing && canDelete ? (
                <DropdownMenuItem
                  onSelect={onDeleteClick}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Delete estimate
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {headerUtilityActions.map(({ label, action, Icon }) => (
                <DropdownMenuItem key={`mobile-${label}`} onSelect={action} className="min-h-11">
                  <Icon className="mr-2 h-4 w-4" aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
              {overflowUtilityActions.map(({ label, action, Icon }) => (
                <DropdownMenuItem key={`mobile-${label}`} onSelect={action} className="min-h-11">
                  <Icon className="mr-2 h-4 w-4" aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
              {headerUtilityActions.length > 0 || overflowUtilityActions.length > 0 ? (
                <DropdownMenuSeparator />
              ) : null}
              {canSend ? (
                <DropdownMenuItem onSelect={onSend} className="min-h-11">
                  Mark as Sent
                </DropdownMenuItem>
              ) : null}
              {statusActions.map((item) => (
                <DropdownMenuItem
                  key={`mobile-${item.label}`}
                  onSelect={item.action}
                  className={cn(
                    "min-h-11",
                    item.destructive && "text-destructive focus:text-destructive"
                  )}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
              {canConvert && onConvertClick ? (
                <DropdownMenuItem onSelect={onConvertClick} className="min-h-11">
                  Convert to Project
                </DropdownMenuItem>
              ) : null}
              {canCreateRevision && onCreateRevision ? (
                <DropdownMenuItem
                  onSelect={onCreateRevision}
                  className="min-h-11"
                  data-testid="create-estimate-revision-action-mobile"
                >
                  <FileClock className="mr-2 h-4 w-4" aria-hidden />
                  Create Revision
                </DropdownMenuItem>
              ) : null}
              {revisionContext?.previousRevisionId ? (
                <DropdownMenuItem asChild className="min-h-11">
                  <Link href={`/estimates/${revisionContext.previousRevisionId}`}>
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                    Previous revision
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {revisionContext && !revisionContext.isCurrent ? (
                <DropdownMenuItem asChild className="min-h-11">
                  <Link href={`/estimates/${revisionContext.currentRevisionId}`}>
                    Current revision
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {onDuplicateClick ? (
                <DropdownMenuItem
                  onSelect={onDuplicateClick}
                  className="min-h-11"
                  data-testid="duplicate-estimate-action-mobile"
                >
                  <Copy className="mr-2 h-4 w-4" aria-hidden />
                  Duplicate as Draft
                </DropdownMenuItem>
              ) : null}
              {onSaveAsTemplateClick ? (
                <DropdownMenuItem
                  onSelect={onSaveAsTemplateClick}
                  className="min-h-11"
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
                  className="min-h-11 text-destructive focus:text-destructive"
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
