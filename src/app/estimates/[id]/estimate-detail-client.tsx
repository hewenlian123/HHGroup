"use client";

import {
  refreshRscNonBlocking,
  syncRouterNonBlocking,
} from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
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

type EstimateDetailClientProps = {
  estimateId: string;
  estimateNumber: string;
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
  const [convertDrawerOpen, setConvertDrawerOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [wholeDocumentSaving, setWholeDocumentSaving] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
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
  useEstimateUnsavedWarning(editing && documentHasUnsavedWork && !pending && !documentSaving);

  React.useEffect(() => {
    if (!editing) {
      resetSaveState();
    }
  }, [editing, resetSaveState]);

  React.useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useOnAppSync(
    React.useCallback(() => {
      refreshRscNonBlocking(router);
    }, [router]),
    [router]
  );

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
    if (!(await persistWholeDocument())) return;
    setDetailsOpen(false);
    setEditing(false);
    syncRouterNonBlocking(router);
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

  const onSaveShortcutRef = React.useRef(onSave);
  onSaveShortcutRef.current = onSave;
  React.useEffect(() => {
    if (!editing || isLocked) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isEstimateSaveShortcut(event)) return;
      event.preventDefault();
      void onSaveShortcutRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, isLocked]);

  const runStatusChange = (
    next: EstimateStatus,
    runner: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const res = await runner();
      if (res.ok) {
        toast({ title: "Status updated", description: `Marked as ${next}.`, variant: "success" });
        if (next !== prev) setEditing(false);
      } else {
        setStatus(prev);
        toast({
          title: "Update failed",
          description: res.error ?? "Could not update status.",
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
    startTransition(async () => {
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
    });
  };

  const onCreateRevision = (): void => {
    startTransition(async () => {
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
        status={status}
        editing={editing}
        pending={pending || wholeDocumentSaving}
        saveStatus={editing ? saveStatus : "idle"}
        isLocked={isLocked}
        onEdit={() => {
          resetSaveState();
          setDetailsOpen(false);
          setEditing(true);
        }}
        onEditDetails={() => setDetailsOpen(true)}
        onSave={() => void onSave()}
        onSaveAndPreview={() => void onSaveAndPreview()}
        onPreview={onPreview}
        onDone={() => void onSave()}
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

      <EstimateEditor
        key={`${estimateId}-${estimateUpdatedAt}`}
        estimateId={estimateId}
        estimateNumber={estimateNumber}
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
        onSaveDetails={() => void onSave()}
      />

      <EstimateActivityTimeline
        events={activityEvents}
        revisionNumber={revisionContext?.revisionNumber ?? 0}
      />

      {editing && !isLocked ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-3 py-2 lg:hidden",
            EB.glassMobileBar
          )}
          aria-label="Estimate edit actions"
        >
          <EstimateBuilderMobileSummary className="mb-1" summary={summary} />
          <EstimateBuilderSaveStatus status={saveStatus} className="mb-1 block text-center" />
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-2">
            <Button
              type="button"
              variant="ghost"
              className={cn("min-h-11 min-w-[44px] flex-1", EB.btnGhost)}
              disabled={pending || wholeDocumentSaving}
              onClick={() => void onSave()}
            >
              Done
            </Button>
            <Button
              type="button"
              className={cn("min-h-11 min-w-[44px] flex-1 font-medium", EB.btnPrimary)}
              disabled={pending || wholeDocumentSaving}
              aria-busy={pending || wholeDocumentSaving}
              onClick={() => void onSave()}
            >
              <SubmitSpinner loading={pending || wholeDocumentSaving} className="mr-2" />
              {pending || wholeDocumentSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn("min-h-11 min-w-[44px] px-2 font-medium", EB.btnGhost)}
              disabled={pending || wholeDocumentSaving}
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
