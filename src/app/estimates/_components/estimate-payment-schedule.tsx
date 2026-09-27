"use client";
import { EstimatePaymentInlineRow, type InlinePaymentValue } from "./estimate-payment-inline-row";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/components/toast/toast-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PaymentScheduleItem, PaymentScheduleTemplate } from "@/lib/data";
import { paymentMilestoneAmount } from "@/lib/estimate-domain";
import { ArrowDown, ArrowUp, CheckCircle2, Copy, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB } from "./estimate-builder-ui";

import { paymentRemainingAmount } from "./estimate-payment-percent";
import {
  ProposalPaymentMilestoneList,
  type ProposalPaymentMilestoneRow,
} from "./proposal-payment-milestone-list";
import { useEstimateDocumentSave } from "./estimate-document-save-context";
import { createEstimateMutationSingleFlight } from "./estimate-mutation-coordinator";
import {
  appendEstimateReturnPath,
  buildCreateDraftInvoiceHref,
  buildEstimateMilestoneReturnHref,
} from "./estimate-workflow-continuity";

type MutationResult = { ok: boolean; error?: string };
type AddAction = (formData: FormData) => Promise<MutationResult>;
type UpdateAction = (formData: FormData) => Promise<MutationResult>;
type DeleteAction = (formData: FormData) => Promise<MutationResult>;
type MarkPaidAction = (formData: FormData) => Promise<void>;
type ReorderAction = (formData: FormData) => Promise<void>;
type ApplyTemplateAction = (
  formData: FormData
) => Promise<{ ok: boolean; appliedCount?: number; error?: string }>;
type CreateTemplateAction = (
  formData: FormData
) => Promise<{ ok: boolean; templateId?: string; error?: string }>;

const fmt = formatEstimateCurrency;

function invoiceDisplayLabel(invoiceNo?: string | null): string {
  const trimmed = invoiceNo?.trim();
  if (!trimmed) return "Invoice";
  return trimmed.startsWith("#") ? `Invoice ${trimmed}` : `Invoice #${trimmed}`;
}

export type EstimatePaymentScheduleInvoiceSummary = {
  invoiceNo?: string | null;
  status?: string | null;
};

export function EstimatePaymentSchedule(props: {
  estimateId: string;
  paymentSchedule: PaymentScheduleItem[];
  estimateTotal: number;
  isLocked: boolean;
  invoiceProjectLink?: {
    canCreateInvoice: boolean;
    message?: string;
  };
  invoiceSummaries?: Record<string, EstimatePaymentScheduleInvoiceSummary>;
  invoiceContext?: {
    estimateNumber?: string | null;
    customerName?: string | null;
    projectName?: string | null;
  };
  canCreateMilestoneInvoices?: boolean;
  nested?: boolean;
  onSummaryChange?: (summary: { milestoneCount: number; scheduledTotal: number } | null) => void;
  paymentTemplates?: PaymentScheduleTemplate[];
  addPaymentMilestoneAction: AddAction;
  updatePaymentMilestoneAction: UpdateAction;
  deletePaymentMilestoneAction: DeleteAction;
  markPaymentMilestonePaidAction: MarkPaidAction;
  reorderPaymentScheduleAction: ReorderAction;
  applyPaymentTemplateAction: ApplyTemplateAction;
  createPaymentTemplateAction: CreateTemplateAction;
}) {
  const {
    estimateId,
    paymentSchedule,
    estimateTotal,
    isLocked,
    invoiceProjectLink,
    invoiceSummaries = {},
    invoiceContext,
    canCreateMilestoneInvoices = false,
    nested = false,
    onSummaryChange,
    paymentTemplates = [],
    addPaymentMilestoneAction,
    updatePaymentMilestoneAction,
    deletePaymentMilestoneAction,
    markPaymentMilestonePaidAction,
    reorderPaymentScheduleAction,
    applyPaymentTemplateAction,
    createPaymentTemplateAction,
  } = props;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { markUnsaved, trackMutation } = useEstimateDocumentSave();
  const [focusPaymentId, setFocusPaymentId] = React.useState<string | null>(null);
  const [paymentDrafts, setPaymentDrafts] = React.useState<Record<string, InlinePaymentValue>>({});
  const pendingAddedIds = React.useRef<Set<string> | null>(null);

  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [templateNameDraft, setTemplateNameDraft] = React.useState("");
  const [templateAmountType, setTemplateAmountType] = React.useState<"percent" | "fixed">(
    "percent"
  );
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(
    () => paymentTemplates[0]?.id ?? ""
  );
  const [paymentMutationBusy, setPaymentMutationBusy] = React.useState(false);
  const paymentMutationSingleFlightRef = React.useRef(createEstimateMutationSingleFlight());

  const runPaymentMutation = React.useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
      const result = await paymentMutationSingleFlightRef.current.run(async () => {
        setPaymentMutationBusy(true);
        try {
          return await operation();
        } finally {
          setPaymentMutationBusy(false);
        }
      });
      return result.accepted ? result.value : undefined;
    },
    []
  );

  React.useEffect(() => {
    if (
      selectedTemplateId &&
      paymentTemplates.some((template) => template.id === selectedTemplateId)
    ) {
      return;
    }
    setSelectedTemplateId(paymentTemplates[0]?.id ?? "");
  }, [paymentTemplates, selectedTemplateId]);

  React.useEffect(() => {
    const invoiceError = searchParams.get("invoiceError");
    if (!invoiceError) return;
    toast({
      title: "Create draft invoice failed",
      description: invoiceError,
      variant: "error",
    });
  }, [searchParams, toast]);

  React.useEffect(() => {
    if (!pendingAddedIds.current) return;
    const added = paymentSchedule.find((item) => !pendingAddedIds.current?.has(item.id));
    if (added) {
      pendingAddedIds.current = null;
      setFocusPaymentId(added.id);
    }
  }, [paymentSchedule]);

  const addInlinePayment = async (): Promise<void> => {
    if (isLocked || paymentMutationBusy || pendingAddedIds.current) return;
    pendingAddedIds.current = new Set(paymentSchedule.map((item) => item.id));
    const data = new FormData();
    data.set("estimateId", estimateId);
    data.set("title", "Payment");
    data.set("amount", "0");
    try {
      const result = await runPaymentMutation(() => {
        markUnsaved();
        return trackMutation("payment:new", () => addPaymentMilestoneAction(data));
      });
      if (!result?.ok) {
        pendingAddedIds.current = null;
        toast({
          title: "Add payment failed",
          description: result?.error ?? "Please try again.",
          variant: "error",
        });
      } else router.refresh();
    } catch {
      pendingAddedIds.current = null;
      toast({ title: "Add payment failed", description: "Please try again.", variant: "error" });
    }
  };

  const deletePaymentMilestone = async (item: PaymentScheduleItem): Promise<void> => {
    const result = await runPaymentMutation(() => {
      markUnsaved();
      const formData = new FormData();
      formData.set("estimateId", estimateId);
      formData.set("itemId", item.id);
      return trackMutation(`payment:delete:${item.id}`, () =>
        deletePaymentMilestoneAction(formData)
      );
    });
    if (!result) return;
    if (result.ok) {
      router.refresh();
      return;
    }
    toast({
      title: "Delete failed",
      description: result.error ?? "Could not delete this payment milestone.",
      variant: "error",
    });
  };

  const reorderPaymentSchedule = async (formData: FormData): Promise<void> => {
    await runPaymentMutation(() => reorderPaymentScheduleAction(formData));
  };

  const orderedIdsForMove = (itemId: string, direction: "up" | "down"): string[] | null => {
    const ids = paymentSchedule.map((item) => item.id);
    const from = ids.indexOf(itemId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) return null;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  };

  const applyPaymentTemplate = async (mode: "replace" | "merge"): Promise<void> => {
    if (!selectedTemplateId) return;
    if (
      mode === "replace" &&
      paymentSchedule.length > 0 &&
      !window.confirm("Replace the current draft payment schedule with this template?")
    ) {
      return;
    }

    const result = await runPaymentMutation(() => {
      markUnsaved();
      const formData = new FormData();
      formData.set("estimateId", estimateId);
      formData.set("templateId", selectedTemplateId);
      formData.set("mode", mode);
      return trackMutation(`payment:template:${mode}`, () => applyPaymentTemplateAction(formData));
    });
    if (!result) return;
    if (!result.ok) {
      toast({
        title: "Template application failed",
        description: result.error ?? "Could not apply this payment template.",
        variant: "error",
      });
      return;
    }
    toast({
      title: mode === "replace" ? "Payment schedule replaced" : "Payment schedule merged",
      description: `${result.appliedCount ?? 0} milestone${result.appliedCount === 1 ? "" : "s"} added as fixed-dollar amounts.`,
      variant: "success",
    });
    router.refresh();
  };

  const savePaymentTemplate = async (): Promise<void> => {
    const result = await runPaymentMutation(() => {
      const formData = new FormData();
      formData.set("estimateId", estimateId);
      formData.set("templateName", templateNameDraft);
      formData.set("amountType", templateAmountType);
      return trackMutation("payment:template:save", () => createPaymentTemplateAction(formData));
    });
    if (!result) return;
    if (!result.ok) {
      toast({
        title: "Template save failed",
        description: result.error ?? "Could not save this payment template.",
        variant: "error",
      });
      return;
    }
    setSaveTemplateOpen(false);
    setTemplateNameDraft("");
    toast({ title: "Payment template saved", variant: "success" });
    router.refresh();
  };

  const totalScheduled = paymentSchedule.reduce(
    (sum, item) => sum + paymentMilestoneAmount(paymentDrafts[item.id] ?? item, estimateTotal),
    0
  );
  const remaining = estimateTotal - totalScheduled;
  const isOverallocated = remaining < -0.005;

  React.useEffect(() => {
    onSummaryChange?.({ milestoneCount: paymentSchedule.length, scheduledTotal: totalScheduled });
  }, [onSummaryChange, paymentSchedule.length, totalScheduled]);

  const renderPaymentActions = (m: ProposalPaymentMilestoneRow) => {
    const item = paymentSchedule.find((x) => x.id === m.id);
    if (!item) return null;
    if (isLocked) {
      if (item.invoiceId) {
        const invoice = invoiceSummaries[item.invoiceId];
        const invoiceNo = invoiceDisplayLabel(invoice?.invoiceNo);
        const estimateReturnHref = buildEstimateMilestoneReturnHref(estimateId, item.id);
        return (
          <div className="flex min-w-[9rem] flex-col items-end gap-1 text-right">
            <span className="text-hh-status font-medium leading-none text-muted-foreground">
              {invoiceNo}
              {invoice?.status ? ` · ${invoice.status}` : ""}
            </span>
            {item.status !== "paid" && invoice?.status?.toLowerCase() === "paid" ? (
              <form action={markPaymentMilestonePaidAction}>
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={item.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className={cn("min-h-9 px-2.5 text-hh-metadata", EB.actionSecondary)}
                  aria-label={`Sync paid status for ${item.title}`}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Sync paid status
                </Button>
              </form>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className={cn("min-h-11 px-3 text-hh-metadata", EB.actionSecondary)}
            >
              <Link
                href={appendEstimateReturnPath(
                  `/financial/invoices/${item.invoiceId}`,
                  estimateReturnHref
                )}
              >
                View Invoice
              </Link>
            </Button>
          </div>
        );
      }

      const canCreate =
        canCreateMilestoneInvoices && invoiceProjectLink?.canCreateInvoice !== false;
      const estimateReturnHref = buildEstimateMilestoneReturnHref(estimateId, item.id);
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          asChild={canCreate}
          disabled={!canCreate}
          title={
            !canCreate
              ? canCreateMilestoneInvoices
                ? invoiceProjectLink?.message
                : "Only Approved or Converted estimates can create milestone invoices."
              : undefined
          }
          className={cn("min-h-11 px-3 text-hh-metadata", EB.actionSecondary)}
        >
          {canCreate ? (
            <Link href={buildCreateDraftInvoiceHref(estimateId, item.id, estimateReturnHref)}>
              Create Draft Invoice
            </Link>
          ) : (
            "Create Draft Invoice"
          )}
        </Button>
      );
    }
    return (
      <div className="flex gap-1">
        {(["up", "down"] as const).map((direction) => {
          const orderedItemIds = orderedIdsForMove(item.id, direction);
          const Icon = direction === "up" ? ArrowUp : ArrowDown;
          return (
            <form key={direction} action={reorderPaymentSchedule}>
              <input type="hidden" name="estimateId" value={estimateId} />
              <input
                type="hidden"
                name="orderedItemIds"
                value={JSON.stringify(orderedItemIds ?? [])}
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                className={cn("eb-payment-row-action h-8 min-h-8 w-8 min-w-8", EB.btnGhost)}
                disabled={!orderedItemIds || paymentMutationBusy}
                aria-label={`Move ${item.title} ${direction}`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </Button>
            </form>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Duplicate ${item.title}`}
          disabled={paymentMutationBusy}
          onClick={async () => {
            const source = paymentDrafts[item.id] ?? item;
            const data = new FormData();
            data.set("estimateId", estimateId);
            data.set("title", source.title);
            data.set("amount", String(source.amount));
            data.set("description", source.description ?? "");
            data.set("dueDate", source.dueDate ?? "");
            data.set("paymentTerm", source.paymentTerm ?? "");
            const result = await runPaymentMutation(() => {
              markUnsaved();
              return trackMutation(`payment:duplicate:${item.id}`, () =>
                addPaymentMilestoneAction(data)
              );
            });
            if (result?.ok) router.refresh();
            else if (result)
              toast({ title: "Duplicate failed", description: result.error, variant: "error" });
          }}
        >
          <Copy size={14} />
        </Button>
        <div className="inline">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "eb-payment-row-action h-8 min-h-8 w-8 min-w-8 text-[var(--hh-danger)] hover:bg-[var(--hh-danger-soft-fill)]",
              EB.btnGhost
            )}
            aria-label={`Delete ${item.title}`}
            onClick={() => void deletePaymentMilestone(item)}
            disabled={paymentMutationBusy}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };
  const milestoneRows: ProposalPaymentMilestoneRow[] = paymentSchedule.map((item) => ({
    id: item.id,
    title: item.title || "—",
    amount: paymentMilestoneAmount(item, estimateTotal),
    description: item.description,
    dueDate: item.dueDate,
  }));

  return (
    <section
      className={cn(EB.paymentSchedule, nested && EB.paymentScheduleNested)}
      data-estimate-payment-schedule="true"
    >
      <div className="eb-payment-schedule-header flex flex-wrap items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <h3 className={EB.paymentTitle}>Payment schedule</h3>
          <p className={EB.paymentSubtitle}>Client payment milestones</p>
        </div>
        {!isLocked && <span />}
      </div>
      <div>
        {isOverallocated ? (
          <p role="alert" className="text-xs text-destructive">
            Schedule exceeds the Estimate total by {fmt(Math.abs(remaining))}. Reduce a milestone
            before adding more.
          </p>
        ) : null}

        {!isLocked && (paymentTemplates.length > 0 || paymentSchedule.length > 0) ? (
          <div
            className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/25 px-3 py-2.5"
            data-testid="payment-template-controls"
          >
            {paymentTemplates.length > 0 ? (
              <label className="min-w-[12rem] flex-1 text-xs font-medium text-muted-foreground">
                Payment template
                <select
                  aria-label="Payment template"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  disabled={paymentMutationBusy}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {paymentTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
                Save this schedule as a reusable fixed-dollar or percentage template.
              </p>
            )}
            {paymentTemplates.length > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={EB.actionSecondary}
                  onClick={() => void applyPaymentTemplate("replace")}
                  disabled={paymentMutationBusy}
                  data-testid="payment-template-replace"
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={EB.actionSecondary}
                  onClick={() => void applyPaymentTemplate("merge")}
                  disabled={paymentMutationBusy}
                  data-testid="payment-template-merge"
                >
                  Merge
                </Button>
              </>
            ) : null}
            {paymentSchedule.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={EB.actionSecondary}
                onClick={() => setSaveTemplateOpen(true)}
                disabled={paymentMutationBusy}
                data-testid="payment-template-save-open"
              >
                Save template
              </Button>
            ) : null}
          </div>
        ) : null}

        {isLocked && canCreateMilestoneInvoices && paymentSchedule.length > 0 && invoiceContext ? (
          <div
            className="mb-2 rounded-md border border-border bg-muted/35 px-3 py-2.5"
            data-testid="estimate-invoice-readiness"
            role="note"
            aria-label="Draft invoice readiness"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Draft invoice readiness</p>
              {invoiceContext.estimateNumber ? (
                <span className="text-hh-status tabular-nums text-muted-foreground">
                  {invoiceContext.estimateNumber}
                </span>
              ) : null}
            </div>
            <dl className="mt-2 grid gap-x-5 gap-y-1.5 text-xs sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="truncate font-medium text-foreground">
                  {invoiceContext.customerName?.trim() || "Not linked"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Project</dt>
                <dd className="truncate font-medium text-foreground">
                  {invoiceContext.projectName?.trim() || "Not linked"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <>
          <div
            className="estimate-payment-entry-fields estimate-payment-columns"
            aria-hidden="true"
          >
            <span />
            <span>Payment Name</span>
            <span>Due</span>
            <span>Amount</span>
            <span className="sr-only">Actions</span>
          </div>
          <ProposalPaymentMilestoneList
            milestones={milestoneRows}
            actions={renderPaymentActions}
            editor={(milestone) => {
              const item = paymentSchedule.find((item) => item.id === milestone.id)!;
              const value = isLocked ? item : (paymentDrafts[item.id] ?? item);
              return (
                <EstimatePaymentInlineRow
                  value={value}
                  onReorder={(sourceId, targetId) => {
                    const ids = paymentSchedule.map((payment) => payment.id);
                    const from = ids.indexOf(sourceId),
                      to = ids.indexOf(targetId);
                    if (from < 0 || to < 0) return;
                    ids.splice(to, 0, ...ids.splice(from, 1));
                    const data = new FormData();
                    data.set("estimateId", estimateId);
                    data.set("orderedItemIds", JSON.stringify(ids));
                    void reorderPaymentSchedule(data);
                  }}
                  total={estimateTotal}
                  maxAmount={
                    isLocked
                      ? undefined
                      : paymentRemainingAmount(estimateTotal, totalScheduled, value.amount)
                  }
                  autoFocus={!isLocked && item.id === focusPaymentId}
                  disabled={isLocked || paymentMutationBusy}
                  onChange={(next) => {
                    markUnsaved();
                    setPaymentDrafts((previous) => ({ ...previous, [item.id]: next }));
                  }}
                  onSave={
                    isLocked
                      ? undefined
                      : async (next) => {
                          const data = new FormData();
                          data.set("estimateId", estimateId);
                          data.set("itemId", item.id);
                          data.set("title", next.title);
                          data.set("amount", String(next.amount));
                          data.set("description", next.description ?? "");
                          data.set("dueDate", next.dueDate ?? "");
                          data.set("paymentTerm", next.paymentTerm ?? "");
                          const result = await trackMutation(`payment:${item.id}`, () =>
                            updatePaymentMilestoneAction(data)
                          );
                          if (result.ok) router.refresh();
                          return result;
                        }
                  }
                  actions={
                    <details className="estimate-payment-actions">
                      <summary aria-label={`Actions for ${milestone.title}`}>⋮</summary>
                      <div>{renderPaymentActions(milestone)}</div>
                    </details>
                  }
                />
              );
            }}
          />
          {!isLocked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("min-h-11 shrink-0 px-2.5 md:min-h-8", EB.actionSecondary)}
              onClick={() => void addInlinePayment()}
              disabled={paymentMutationBusy}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              Add Payment
            </Button>
          ) : null}
        </>
        {paymentSchedule.length > 0 &&
        ((!canCreateMilestoneInvoices && isLocked) ||
          (invoiceProjectLink && !invoiceProjectLink.canCreateInvoice)) ? (
          <div
            className="estimate-payment-link-warning mt-3 text-xs leading-relaxed text-muted-foreground"
            role="note"
          >
            {!canCreateMilestoneInvoices
              ? "Only Approved or Converted estimates can create milestone invoices."
              : (invoiceProjectLink?.message ??
                "Invoice generation requires a linked project before creating invoices from payment milestones.")}
          </div>
        ) : null}

        <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
          <DialogContent data-testid="payment-template-save-dialog">
            <DialogHeader>
              <DialogTitle>Save payment template</DialogTitle>
              <DialogDescription>
                Percentage templates are reusable helpers. Applying one always stores fixed-dollar,
                tax-inclusive milestone amounts from the current Estimate total.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Template name
                <Input
                  value={templateNameDraft}
                  onChange={(event) => setTemplateNameDraft(event.target.value)}
                  placeholder="e.g. 30 / 40 / 30"
                  className="mt-1"
                  data-testid="payment-template-name"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Reuse amounts as
                <NativeSelect
                  value={templateAmountType}
                  onChange={(event) =>
                    setTemplateAmountType(event.target.value === "fixed" ? "fixed" : "percent")
                  }
                  className="mt-1"
                  aria-label="Payment template amount type"
                >
                  <option value="percent">Percentages of Estimate total</option>
                  <option value="fixed">Fixed-dollar amounts</option>
                </NativeSelect>
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSaveTemplateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void savePaymentTemplate()}
                disabled={!templateNameDraft.trim() || paymentMutationBusy}
                aria-busy={paymentMutationBusy}
                data-testid="payment-template-save"
              >
                Save template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
