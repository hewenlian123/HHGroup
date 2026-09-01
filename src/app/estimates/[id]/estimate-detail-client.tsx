"use client";

import {
  refreshRscNonBlocking,
  syncRouterNonBlocking,
} from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileClock } from "lucide-react";
import type {
  CostCode,
  EstimateItemRow,
  EstimateMetaRecord,
  EstimateSummaryResult,
  PaymentScheduleItem,
  PaymentScheduleTemplate,
  EstimateRevisionContext,
} from "@/lib/data";
import type { EstimateActivityEvent } from "@/lib/estimate-activity";
import { useToast } from "@/components/toast/toast-provider";
import { ConfirmDialog } from "@/components/base";
import {
  approveEstimateInlineAction,
  rejectEstimateInlineAction,
  saveEstimateMetaInlineAction,
  sendEstimateInlineAction,
  type EstimateStatus,
} from "./actions";
import {
  createEstimateRevisionAction,
  deleteEstimateAction,
  duplicateEstimateAsDraftAction,
} from "../actions";
import { runDeleteEstimateActionWithTimeout } from "../delete-estimate-client";
import { EstimateDetailHeader } from "./estimate-detail-header";
import { EstimateBuilderSaveStatus } from "../_components/estimate-builder-save-status";
import {
  EstimateDocumentSaveProvider,
  useEstimateDocumentSave,
} from "../_components/estimate-document-save-context";
import { useEstimateUnsavedWarning } from "../_components/use-estimate-unsaved-warning";
import { ConvertToProjectDrawer } from "./convert-to-project-drawer";
import { EstimateBuilderShell } from "../_components/estimate-builder-shell";
import { EstimateEditor } from "../_components/estimate-editor";
import type { EstimatePaymentScheduleInvoiceSummary } from "../_components/estimate-payment-schedule";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { SaveEstimateAsTemplateDialog } from "@/app/estimate-templates/save-estimate-as-template-dialog";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { cn } from "@/lib/utils";
import { EB } from "../_components/estimate-builder-ui";
import { EstimateBuilderMobileSummary } from "../_components/estimate-builder-summary";
import { isEstimateSaveShortcut } from "../_components/estimate-builder-productivity";
import {
  buildEstimatePreviewHref,
  captureEstimateBuilderReturnContext,
} from "../_components/estimate-workflow-continuity";
import { EstimateActivityTimeline } from "../_components/estimate-activity-timeline";
import { EstimateSurfaceSheet } from "../_components/estimate-surface-sheet";
import { formatEstimateCurrency } from "../_components/estimate-currency";
import { createEstimateMutationSingleFlight } from "../_components/estimate-mutation-coordinator";

function formatRevisionDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

type EstimateDetailClientProps = {
  estimateId: string;
  estimateNumber: string;
  customerId?: string | null;
  revisionContext?: EstimateRevisionContext | null;
  estimateUpdatedAt: string;
  initialStatus: EstimateStatus | string;
  meta: EstimateMetaRecord;
  items: EstimateItemRow[];
  estimateCategories: { costCode: string; displayName: string; orderIndex?: number }[];
  categoryNames: Record<string, string>;
  costCodes: CostCode[];
  summary: EstimateSummaryResult | null;
  paymentSchedule: PaymentScheduleItem[];
  paymentTemplates: PaymentScheduleTemplate[];
  invoiceProjectLink?: {
    canCreateInvoice: boolean;
    message?: string;
  };
  paymentInvoiceSummaries?: Record<string, EstimatePaymentScheduleInvoiceSummary>;
  activityEvents: EstimateActivityEvent[] | null;
};

export function EstimateDetailClient(props: EstimateDetailClientProps): React.ReactElement {
  return (
    <EstimateDocumentSaveProvider>
      <EstimateDetailClientContent {...props} />
    </EstimateDocumentSaveProvider>
  );
}

function EstimateDetailClientContent({
  estimateId,
  estimateNumber,
  customerId,
  revisionContext,
  estimateUpdatedAt,
  initialStatus,
  meta,
  items,
  estimateCategories,
  categoryNames,
  costCodes,
  summary,
  paymentSchedule,
  paymentTemplates,
  invoiceProjectLink,
  paymentInvoiceSummaries,
  activityEvents,
}: EstimateDetailClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  const revisionLabel = revisionContext
    ? `${estimateNumber} Rev ${revisionContext.revisionNumber}`
    : estimateNumber;
  useBreadcrumbEntityLabel(revisionLabel);
  const [status, setStatus] = React.useState<string>(initialStatus);
  const [editing, setEditing] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsSurface, setDetailsSurface] = React.useState<"information" | "pricing">(
    "information"
  );
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = React.useState(false);
  const [convertDrawerOpen, setConvertDrawerOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [wholeDocumentSaving, setWholeDocumentSaving] = React.useState(false);
  const [commandBusy, setCommandBusy] = React.useState(false);
  const commandSingleFlightRef = React.useRef(createEstimateMutationSingleFlight());
  const saveInFlightRef = React.useRef(false);

  const {
    state: documentSaveState,
    status: saveStatus,
    trackMutation,
    waitForPendingSaves,
    resetSaveState,
  } = useEstimateDocumentSave();

  const isLocked = !["Draft", "Sent"].includes(status);
  const documentHasUnsavedWork =
    documentSaveState.failedOperationKeys.length > 0 ||
    documentSaveState.revision > documentSaveState.savedRevision;
  const documentSaving = saveStatus === "saving";
  useEstimateUnsavedWarning(editing && documentHasUnsavedWork && !commandBusy && !documentSaving);

  React.useEffect(() => {
    if (!editing) {
      resetSaveState();
    }
  }, [editing, resetSaveState]);

  React.useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const persistWholeDocument = async (): Promise<boolean> => {
    if (saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    setWholeDocumentSaving(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const form = document.getElementById("estimate-meta-form") as HTMLFormElement | null;
      if (form?.dataset.estimateDetailsOpen === "true") {
        const result = await trackMutation("estimate-meta", () =>
          saveEstimateMetaInlineAction(new FormData(form))
        );
        if (!result.ok) {
          toast({
            title: "Save failed",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return false;
        }
      }

      const settled = await waitForPendingSaves();
      if (!settled) {
        toast({
          title: "Save failed",
          description: "One or more Estimate changes were not confirmed. Try again.",
          variant: "error",
        });
        return false;
      }
      toast({ title: "Saved", description: "Estimate updated.", variant: "success" });
      return true;
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
      return false;
    } finally {
      saveInFlightRef.current = false;
      setWholeDocumentSaving(false);
    }
  };

  const onSave = async (): Promise<void> => {
    const detailsForm = document.getElementById("estimate-meta-form") as HTMLFormElement | null;
    const shouldRefreshRoute =
      documentHasUnsavedWork || detailsForm?.dataset.estimateDetailsOpen === "true";
    if (!(await persistWholeDocument())) return;
    setDetailsOpen(false);
    setEditing(false);
    if (!shouldRefreshRoute) return;
    syncRouterNonBlocking(router, "estimate-save");
  };

  const onSaveAndPreview = async (): Promise<void> => {
    const returnContext = captureEstimateBuilderReturnContext();
    if (!(await persistWholeDocument())) return;
    setDetailsOpen(false);
    router.push(buildEstimatePreviewHref(estimateId, returnContext));
  };

  const onPreview = (): void => {
    router.push(buildEstimatePreviewHref(estimateId, captureEstimateBuilderReturnContext()));
  };

  const focusContinuousSection = (sectionId: string): void => {
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      section.scrollIntoView({ behavior: "auto", block: "start" });
      section.focus({ preventScroll: true });
    });
  };

  const onSaveShortcutRef = React.useRef(onSave);
  onSaveShortcutRef.current = onSave;
  React.useEffect(() => {
    if (!editing || isLocked) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isEstimateSaveShortcut(event)) return;
      event.preventDefault();
      const activeControl = document.activeElement;
      if (activeControl instanceof HTMLElement && activeControl !== document.body) {
        activeControl.blur();
      }
      window.requestAnimationFrame(() => {
        void onSaveShortcutRef.current();
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, isLocked]);

  const runExclusiveCommand = React.useCallback(
    (operation: () => Promise<void>): void => {
      void commandSingleFlightRef.current
        .run(async () => {
          setCommandBusy(true);
          try {
            await operation();
          } finally {
            setCommandBusy(false);
          }
        })
        .catch((error) => {
          toast({
            title: "Action failed",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          });
        });
    },
    [toast]
  );

  const runStatusChange = (
    next: EstimateStatus,
    runner: () => Promise<{ ok: boolean; error?: string }>
  ): void => {
    const prev = status;
    runExclusiveCommand(async () => {
      setStatus(next);
      try {
        const res = await runner();
        if (res.ok) {
          toast({
            title: "Status updated",
            description: `Marked as ${next}.`,
            variant: "success",
          });
          if (next !== prev) setEditing(false);
          return;
        }
        setStatus(prev);
        toast({
          title: "Update failed",
          description: res.error ?? "Could not update status.",
          variant: "error",
        });
      } catch (error) {
        setStatus(prev);
        toast({
          title: "Update failed",
          description: error instanceof Error ? error.message : "Could not update status.",
          variant: "error",
        });
      }
    });
  };

  const onDelete = async (): Promise<void> => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    try {
      const res = await runDeleteEstimateActionWithTimeout(deleteEstimateAction, formData);
      if (!res.ok) {
        toast({
          title: "Could not delete estimate",
          description: res.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      setDeleteConfirmOpen(false);
      router.replace("/estimates");
      toast({
        title: "Estimate deleted",
        description: "Returning to estimates.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Could not delete estimate",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const onConvertSuccess = (projectId: string) => {
    setStatus("Converted");
    setEditing(false);
    setConvertDrawerOpen(false);
    toast({ title: "Project created", description: "Redirecting to project.", variant: "success" });
    router.push(`/projects/${projectId}`);
  };

  const onDuplicate = (): void => {
    runExclusiveCommand(async () => {
      try {
        const result = await duplicateEstimateAsDraftAction(estimateId);
        if (!result.ok || !result.estimateId) {
          toast({
            title: "Could not duplicate Estimate",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        toast({
          title: "Draft Estimate created",
          description: result.estimateNumber
            ? `${result.estimateNumber} was copied without downstream history.`
            : "The copied Estimate is ready to edit.",
          variant: "success",
        });
        router.push(`/estimates/${result.estimateId}`);
      } catch (error) {
        toast({
          title: "Could not duplicate Estimate",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      }
    });
  };

  const onCreateRevision = (): void => {
    runExclusiveCommand(async () => {
      try {
        const result = await createEstimateRevisionAction(estimateId);
        if (!result.ok || !result.estimateId || result.revisionNumber == null) {
          toast({
            title: "Could not create revision",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        toast({
          title: "Revision created",
          description: `${result.estimateNumber} Rev ${result.revisionNumber} is ready to edit.`,
          variant: "success",
        });
        router.push(`/estimates/${result.estimateId}`);
      } catch (error) {
        toast({
          title: "Could not create revision",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      }
    });
  };

  return (
    <EstimateBuilderShell className="estimate-builder-new">
      <EstimateDetailHeader
        estimateId={estimateId}
        estimateNumber={estimateNumber}
        revisionContext={revisionContext}
        clientName={meta.client.name}
        projectName={meta.project.name}
        siteAddress={meta.project.siteAddress ?? meta.client.address}
        estimateDate={meta.estimateDate}
        validUntil={meta.validUntil}
        grandTotal={summary?.grandTotal}
        status={status}
        editing={editing}
        pending={commandBusy || wholeDocumentSaving}
        saveStatus={editing ? saveStatus : "idle"}
        isLocked={isLocked}
        onEdit={() => {
          resetSaveState();
          setDetailsOpen(false);
          setEditing(true);
        }}
        onEditDetails={() => {
          setDetailsSurface("information");
          setDetailsOpen(true);
        }}
        onInfoClick={
          isLocked
            ? undefined
            : () => {
                if (!editing) setEditing(true);
                setDetailsSurface("information");
                setDetailsOpen(true);
              }
        }
        onPricingClick={
          isLocked
            ? undefined
            : () => {
                if (!editing) setEditing(true);
                setDetailsSurface("pricing");
                setDetailsOpen(true);
              }
        }
        onNotesClick={() => {
          if (!isLocked && !editing) setEditing(true);
          focusContinuousSection("estimate-terms-notes");
        }}
        onPaymentScheduleClick={() => {
          if (!isLocked && !editing) setEditing(true);
          focusContinuousSection("estimate-payment-schedule");
        }}
        onActivityClick={() => setActivityOpen(true)}
        onRevisionHistoryClick={revisionContext ? () => setRevisionHistoryOpen(true) : undefined}
        onSave={() => void onSave()}
        onSaveAndPreview={() => void onSaveAndPreview()}
        onPreview={onPreview}
        onSend={() => runStatusChange("Sent", () => sendEstimateInlineAction(estimateId))}
        onApprove={() => runStatusChange("Approved", () => approveEstimateInlineAction(estimateId))}
        onReject={() => runStatusChange("Rejected", () => rejectEstimateInlineAction(estimateId))}
        onConvertClick={() => setConvertDrawerOpen(true)}
        onCreateRevision={onCreateRevision}
        onDuplicateClick={onDuplicate}
        onSaveAsTemplateClick={() => setSaveTemplateOpen(true)}
        onDeleteClick={() => setDeleteConfirmOpen(true)}
      />

      <SaveEstimateAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        estimateId={estimateId}
        estimateNumber={revisionLabel}
      />

      <ConvertToProjectDrawer
        open={convertDrawerOpen}
        onOpenChange={setConvertDrawerOpen}
        estimateId={estimateId}
        estimateNumber={estimateNumber}
        meta={meta}
        onSuccess={onConvertSuccess}
      />

      {revisionContext && !revisionContext.isCurrent ? (
        <section
          className="flex flex-col gap-3 rounded-lg border border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] px-4 py-3 text-[var(--hh-text-primary)] sm:flex-row sm:items-center sm:justify-between"
          aria-label="Historical revision"
          data-testid="estimate-historical-revision-banner"
          data-estimate-revision-state="historical-read-only"
        >
          <div className="flex min-w-0 items-start gap-3">
            <FileClock
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hh-information)]"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-hh-table-header font-semibold uppercase text-[var(--hh-information)]">
                Historical revision
              </p>
              <p className="mt-0.5 text-hh-body text-[var(--hh-text-secondary)]">
                Rev {revisionContext.revisionNumber} · {status} · Read-only
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 shrink-0 sm:min-h-8"
            asChild
          >
            <Link href={`/estimates/${revisionContext.currentRevisionId}`}>
              View current revision
            </Link>
          </Button>
        </section>
      ) : null}

      <EstimateEditor
        key={`${estimateId}-${estimateUpdatedAt}`}
        estimateId={estimateId}
        estimateNumber={estimateNumber}
        customerId={customerId}
        status={status}
        meta={meta}
        items={items}
        estimateCategories={estimateCategories}
        categoryNames={categoryNames}
        costCodes={costCodes}
        summary={summary}
        paymentSchedule={paymentSchedule}
        paymentTemplates={paymentTemplates}
        invoiceProjectLink={invoiceProjectLink}
        paymentInvoiceSummaries={paymentInvoiceSummaries}
        editing={editing && !isLocked}
        detailsOpen={detailsOpen}
        onDetailsOpenChange={setDetailsOpen}
        detailsSurface={detailsSurface}
        onSaveDetails={() => void onSave()}
        onPricingInspectorDetailsClick={
          isLocked
            ? undefined
            : () => {
                if (!editing) setEditing(true);
                setDetailsSurface("information");
                setDetailsOpen(true);
              }
        }
      />

      <EstimateSurfaceSheet
        open={activityOpen}
        onOpenChange={setActivityOpen}
        surface="activity"
        title="Activity"
        description="Recorded lifecycle and related Estimate events."
        contentClassName="overflow-y-auto p-0"
        testId="estimate-activity-sheet"
      >
        <EstimateActivityTimeline
          events={activityEvents}
          revisionNumber={revisionContext?.revisionNumber ?? 0}
          onRetry={() => refreshRscNonBlocking(router)}
          className="m-0 rounded-none border-0 bg-transparent shadow-none"
        />
      </EstimateSurfaceSheet>

      {revisionContext ? (
        <EstimateSurfaceSheet
          open={revisionHistoryOpen}
          onOpenChange={setRevisionHistoryOpen}
          surface="revision"
          title="Revision History"
          description="Navigate the canonical revision lineage for this Estimate."
          contentClassName="overflow-y-auto p-4"
          testId="estimate-revision-history-sheet"
        >
          <div className="space-y-2" data-testid="estimate-revision-family-list">
            {revisionContext.revisions.map((revision) => {
              const isCurrent = revision.id === revisionContext.currentRevisionId;
              const isViewing = revision.id === estimateId;
              return (
                <Link
                  key={revision.id}
                  href={`/estimates/${revision.id}`}
                  aria-current={isViewing ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm text-[var(--hh-text-primary)] transition-colors hover:bg-[var(--hh-l3-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]",
                    isViewing
                      ? "border-[var(--hh-action-primary)] bg-[var(--hh-l3-selected)]"
                      : "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]"
                  )}
                  data-testid={`estimate-revision-row-${revision.revisionNumber}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {revisionContext.estimateNumber} · Rev {revision.revisionNumber}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--hh-text-tertiary)]">
                      <span>{revision.status}</span>
                      {isCurrent ? <span>· Current</span> : <span>· Historical</span>}
                      {isViewing ? <span>· Viewing</span> : null}
                      {!isCurrent ? <span>· Read-only</span> : null}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--hh-text-tertiary)]">
                      {formatRevisionDate(revision.createdAt)}
                      {revision.createdBy ? ` · ${revision.createdBy}` : " · Creator unavailable"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="hh-fin block text-xs font-semibold text-[var(--hh-text-primary)]">
                      {revision.total == null
                        ? "Total unavailable"
                        : formatEstimateCurrency(revision.total)}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-[var(--hh-action-primary)]">
                      {isViewing ? "Viewing" : "Open"}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </EstimateSurfaceSheet>
      ) : null}

      {editing && !isLocked ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-3 py-2 lg:hidden",
            EB.glassMobileBar
          )}
          aria-label="Estimate edit actions"
        >
          <EstimateBuilderMobileSummary className="mb-1" summary={summary} />
          <EstimateBuilderSaveStatus
            status={saveStatus === "idle" ? "saved" : saveStatus}
            className="mb-1 block text-center"
          />
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] gap-2">
            <Button
              type="button"
              className={cn("min-h-11 min-w-[44px] flex-1 font-medium", EB.btnPrimary)}
              disabled={commandBusy || wholeDocumentSaving}
              aria-busy={commandBusy || wholeDocumentSaving}
              onClick={() => void onSave()}
            >
              <SubmitSpinner loading={commandBusy || wholeDocumentSaving} className="mr-2" />
              {commandBusy || wholeDocumentSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn("min-h-11 min-w-[44px] px-2 font-medium", EB.btnGhost)}
              disabled={commandBusy || wholeDocumentSaving}
              onClick={() => void onSaveAndPreview()}
            >
              Save &amp; Preview
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteConfirmOpen(false);
        }}
        title="Delete estimate?"
        description={`Permanently delete ${estimateNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteBusy}
        dismissBeforeAsync={false}
        onConfirm={onDelete}
      />
    </EstimateBuilderShell>
  );
}
