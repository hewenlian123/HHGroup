"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
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
import {
  approveEstimateInlineAction,
  changeEstimateStatusInlineAction,
  rejectEstimateInlineAction,
  saveEstimateMetaInlineAction,
  sendEstimateInlineAction,
  type EstimateStatus,
} from "./actions";
import { EstimateDetailHeader } from "./estimate-detail-header";
import { ConvertToProjectDrawer } from "./convert-to-project-drawer";
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
  const [infoCollapseNonce, setInfoCollapseNonce] = React.useState(0);
  const [costBreakdownCollapseNonce, setCostBreakdownCollapseNonce] = React.useState(0);
  const [pending, startTransition] = React.useTransition();

  const isLocked = !["Draft", "Sent"].includes(status);

  React.useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const onCancelEditing = () => {
    setEditing(false);
    setResetNonce((n) => n + 1);
  };

  const onSave = () => {
    const run = (form: HTMLFormElement) => {
      const fd = new FormData(form);
      startTransition(async () => {
        const res = await saveEstimateMetaInlineAction(fd);
        if (res.ok) {
          toast({ title: "Saved", description: "Estimate updated.", variant: "success" });
          setInfoCollapseNonce((n) => n + 1);
          setCostBreakdownCollapseNonce((n) => n + 1);
          void syncRouterAndClients(router);
          setEditing(false);
        } else {
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

  const onConvertSuccess = (projectId: string) => {
    setStatus("Converted");
    setEditing(false);
    setConvertDrawerOpen(false);
    toast({ title: "Project created", description: "Redirecting to project.", variant: "success" });
    router.push(`/projects/${projectId}`);
  };

  return (
    <>
      <EstimateDetailHeader
        estimateId={estimateId}
        estimateNumber={estimateNumber}
        status={status}
        editing={editing}
        pending={pending}
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
    </>
  );
}
