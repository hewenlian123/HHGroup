"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
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
import { EstimateDetailHeader } from "./estimate-detail-header";
import type { EstimateSaveStatus } from "../_components/estimate-builder-save-status";
import { ConvertToProjectDrawer } from "./convert-to-project-drawer";
import { EstimateBuilderShell } from "../_components/estimate-builder-shell";
import { EstimateEditor } from "../_components/estimate-editor";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";

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
}: {
  estimateId: string;
  estimateNumber: string;
  /** Bumps when server estimate row updates so editor remounts with fresh props after refresh. */
  estimateUpdatedAt: string;
  initialStatus: EstimateStatus | string;
  meta: EstimateMetaRecord;
  items: EstimateItemRow[];
  estimateCategories: { costCode: string; displayName: string }[];
  categoryNames: Record<string, string>;
  costCodes: CostCode[];
  summary: EstimateSummaryResult | null;
  paymentSchedule: PaymentScheduleItem[];
  paymentTemplates: PaymentScheduleTemplate[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  useBreadcrumbEntityLabel(estimateNumber);
  const [status, setStatus] = React.useState<string>(initialStatus);
  const [editing, setEditing] = React.useState(false);
  const [resetNonce, setResetNonce] = React.useState(0);
  const [convertDrawerOpen, setConvertDrawerOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [infoCollapseNonce, setInfoCollapseNonce] = React.useState(0);
  const [costBreakdownCollapseNonce, setCostBreakdownCollapseNonce] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<EstimateSaveStatus>("idle");

  const isLocked = !["Draft", "Sent"].includes(status);

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
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const onCancelEditing = () => {
    setEditing(false);
    setResetNonce((n) => n + 1);
    setDirty(false);
    setSaveStatus("idle");
  };

  const onSave = () => {
    const run = (form: HTMLFormElement) => {
      const fd = new FormData(form);
      setSaveStatus("saving");
      startTransition(async () => {
        const res = await saveEstimateMetaInlineAction(fd);
        if (res.ok) {
          toast({ title: "Saved", description: "Estimate updated.", variant: "success" });
          setInfoCollapseNonce((n) => n + 1);
          setCostBreakdownCollapseNonce((n) => n + 1);
          setEditing(false);
          syncRouterNonBlocking(router);
          setDirty(false);
          setSaveStatus("saved");
          window.setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus(dirty ? "unsaved" : "idle");
          toast({
            title: "Save failed",
            description: res.error ?? "Please try again.",
            variant: "error",
          });
        }
      });
    };

    const form = document.getElementById("estimate-meta-form") as HTMLFormElement | null;
    if (form) {
      run(form);
      return;
    }
    // EstimateEditor expands Client/Project on edit in useEffect; one frame retry if Save is very fast.
    requestAnimationFrame(() => {
      const f = document.getElementById("estimate-meta-form") as HTMLFormElement | null;
      if (f) run(f);
      else
        toast({
          title: "Nothing to save",
          description: "Estimate form not found.",
          variant: "error",
        });
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
      const res = await deleteEstimateAction(formData);
      if (!res.ok) {
        toast({
          title: "Could not delete estimate",
          description: res.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Estimate deleted", variant: "success" });
      syncRouterNonBlocking(router);
      router.replace("/estimates");
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
    <EstimateBuilderShell>
      <EstimateDetailHeader
        estimateId={estimateId}
        estimateNumber={estimateNumber}
        clientName={meta.client.name}
        projectName={meta.project.name}
        siteAddress={meta.project.siteAddress ?? meta.client.address}
        status={status}
        editing={editing}
        pending={pending}
        saveStatus={editing ? (pending ? "saving" : saveStatus) : "idle"}
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
        onDeleteClick={() => setDeleteConfirmOpen(true)}
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
        editing={editing && !isLocked}
        infoCollapseNonce={infoCollapseNonce}
        costBreakdownCollapseNonce={costBreakdownCollapseNonce}
      />

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
