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
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { ConfirmDialog } from "@/components/base";
import {
  approveEstimateInlineAction,
  changeEstimateStatusInlineAction,
  rejectEstimateInlineAction,
  saveEstimateMetaInlineAction,
  sendEstimateInlineAction,
  type EstimateStatus,
} from "./actions";
import { deleteEstimateAction } from "../actions";
import { runDeleteEstimateActionWithTimeout } from "../delete-estimate-client";
import { EstimateDetailHeader } from "./estimate-detail-header";
import {
  EstimateBuilderSaveStatus,
  type EstimateSaveStatus,
} from "../_components/estimate-builder-save-status";
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
import { formatEstimateCurrency } from "../_components/estimate-currency";

export function EstimateDetailClient({
  estimateId,
  estimateNumber,
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
}: {
  estimateId: string;
  estimateNumber: string;
  /** Bumps when server estimate row updates so editor remounts with fresh props after refresh. */
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
}) {
  const { toast } = useToast();
  const router = useRouter();
  useBreadcrumbEntityLabel(estimateNumber);
  const [status, setStatus] = React.useState<string>(initialStatus);
  const [editing, setEditing] = React.useState(false);
  const [resetNonce, setResetNonce] = React.useState(0);
  const [convertDrawerOpen, setConvertDrawerOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<EstimateSaveStatus>("idle");
  const [savingDetails, setSavingDetails] = React.useState(false);
  const saveInFlightRef = React.useRef(false);

  const isLocked = !["Draft", "Sent"].includes(status);
  useEstimateUnsavedWarning(editing && dirty && !pending && !savingDetails);

  React.useEffect(() => {
    if (!editing) {
      setDirty(false);
      setSaveStatus("idle");
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing) return;
    const onDirty = (): void => {
      setDirty(true);
      setSaveStatus("unsaved");
    };
    window.addEventListener("estimate-editor-dirty", onDirty);
    return () => window.removeEventListener("estimate-editor-dirty", onDirty);
  }, [editing]);

  React.useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useOnAppSync(
    React.useCallback(() => {
      refreshRscNonBlocking(router);
    }, [router]),
    [router]
  );

  const onCancelEditing = () => {
    if (dirty && !window.confirm("Discard unsaved Estimate changes?")) return;
    setEditing(false);
    setResetNonce((n) => n + 1);
    setDirty(false);
    setSaveStatus("idle");
  };

  const onSave = () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    const finishWithoutMetaForm = () => {
      setSaveStatus("saving");
      startTransition(() => {
        setEditing(false);
        setDirty(false);
        setSaveStatus("saved");
        syncRouterNonBlocking(router);
        window.setTimeout(() => setSaveStatus("idle"), 2000);
        saveInFlightRef.current = false;
      });
    };

    const run = (form: HTMLFormElement) => {
      const fd = new FormData(form);
      setSaveStatus("saving");
      setSavingDetails(true);
      void (async () => {
        try {
          const res = await saveEstimateMetaInlineAction(fd);
          if (res.ok) {
            toast({ title: "Saved", description: "Estimate updated.", variant: "success" });
            setEditing(false);
            syncRouterNonBlocking(router);
            setDirty(false);
            setSaveStatus("saved");
            window.setTimeout(() => setSaveStatus("idle"), 2000);
            return;
          }
          setSaveStatus("failed");
          toast({
            title: "Save failed",
            description: res.error ?? "Please try again.",
            variant: "error",
          });
        } catch {
          setSaveStatus("failed");
          toast({
            title: "Save failed",
            description: "Please try again.",
            variant: "error",
          });
        } finally {
          setSavingDetails(false);
          saveInFlightRef.current = false;
        }
      })();
    };

    const form = document.getElementById("estimate-meta-form") as HTMLFormElement | null;
    if (form?.dataset.estimateDetailsOpen === "true") {
      run(form);
      return;
    }
    // EstimateEditor expands Client/Project on edit in useEffect; one frame retry if Save is very fast.
    requestAnimationFrame(() => {
      const f = document.getElementById("estimate-meta-form") as HTMLFormElement | null;
      if (f?.dataset.estimateDetailsOpen === "true") run(f);
      else finishWithoutMetaForm();
    });
  };

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

  return (
    <EstimateBuilderShell className="estimate-builder-new">
      <EstimateDetailHeader
        estimateId={estimateId}
        estimateNumber={estimateNumber}
        clientName={meta.client.name}
        projectName={meta.project.name}
        siteAddress={meta.project.siteAddress ?? meta.client.address}
        status={status}
        editing={editing}
        pending={pending || savingDetails}
        saveStatus={editing ? (pending || savingDetails ? "saving" : saveStatus) : "idle"}
        isLocked={isLocked}
        onEdit={() => setEditing(true)}
        onSave={onSave}
        onCancel={onCancelEditing}
        onMarkDraft={() =>
          runStatusChange("Draft", () => changeEstimateStatusInlineAction(estimateId, "Draft"))
        }
        onSend={() => runStatusChange("Sent", () => sendEstimateInlineAction(estimateId))}
        onApprove={() => runStatusChange("Approved", () => approveEstimateInlineAction(estimateId))}
        onReject={() => runStatusChange("Rejected", () => rejectEstimateInlineAction(estimateId))}
        onConvertClick={() => setConvertDrawerOpen(true)}
        onSaveAsTemplateClick={() => setSaveTemplateOpen(true)}
        onDeleteClick={() => setDeleteConfirmOpen(true)}
      />

      <SaveEstimateAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        estimateId={estimateId}
        estimateNumber={estimateNumber}
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
        key={`${estimateId}-${resetNonce}-${estimateUpdatedAt}`}
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
        onSaveDetails={onSave}
      />

      {editing && !isLocked ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-4 py-3 md:hidden",
            EB.glassMobileBar
          )}
          aria-label="Estimate edit actions"
        >
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#9EA8B8]">
              Total
            </span>
            <span
              className={cn(
                "min-w-0 break-words text-right text-[1.625rem] font-semibold leading-none tabular-nums tracking-[-0.02em] [font-feature-settings:'tnum']",
                EB.goldTotal
              )}
            >
              {summary ? formatEstimateCurrency(summary.grandTotal) : "—"}
            </span>
          </div>
          <EstimateBuilderSaveStatus
            status={pending || savingDetails ? "saving" : saveStatus}
            className="mb-2 block text-center"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className={cn("min-h-11 min-w-[44px] flex-1", EB.btnGhost)}
              disabled={pending || savingDetails}
              onClick={onCancelEditing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn("min-h-11 min-w-[44px] flex-1 font-medium", EB.btnPrimary)}
              disabled={pending || savingDetails}
              aria-busy={pending || savingDetails}
              onClick={onSave}
            >
              <SubmitSpinner loading={pending || savingDetails} className="mr-2" />
              {pending || savingDetails ? "Saving…" : "Save"}
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
