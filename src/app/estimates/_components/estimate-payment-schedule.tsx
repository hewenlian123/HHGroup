"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast/toast-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PaymentScheduleItem, PaymentScheduleTemplate } from "@/lib/data";
import { paymentMilestoneAmount } from "@/lib/data";
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB, ebSheetInput } from "./estimate-builder-ui";
import { estimateSurfaceSheetClassName } from "./estimate-surface-sheet-class";
import { ProposalScopeEditor } from "./proposal-scope-editor";
import {
  parsePaymentPercentInput,
  paymentAmountFromPercent,
  paymentPercentFromAmount,
} from "./estimate-payment-percent";
import {
  ProposalPaymentMilestoneList,
  type ProposalPaymentMilestoneRow,
} from "./proposal-payment-milestone-list";
import { useEstimateDocumentSave } from "./estimate-document-save-context";
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
const PAYMENT_MILESTONE_FORM_ID = "estimate-payment-milestone-form";

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
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<PaymentScheduleItem | null>(null);
  const [paymentDescriptionDraft, setPaymentDescriptionDraft] = React.useState("");
  const [amountDraft, setAmountDraft] = React.useState("");
  const [percentDraft, setPercentDraft] = React.useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [templateNameDraft, setTemplateNameDraft] = React.useState("");
  const [templateAmountType, setTemplateAmountType] = React.useState<"percent" | "fixed">(
    "percent"
  );
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(
    () => paymentTemplates[0]?.id ?? ""
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
    if (!scheduleOpen) return;
    const amount = editingItem ? paymentMilestoneAmount(editingItem, estimateTotal) : 0;
    setPaymentDescriptionDraft(editingItem?.description ?? "");
    setAmountDraft(editingItem ? String(amount) : "");
    setPercentDraft(editingItem ? paymentPercentFromAmount(amount, estimateTotal) : "");
  }, [scheduleOpen, editingItem, estimateTotal]);

  React.useEffect(() => {
    const invoiceError = searchParams.get("invoiceError");
    if (!invoiceError) return;
    toast({
      title: "Create draft invoice failed",
      description: invoiceError,
      variant: "error",
    });
  }, [searchParams, toast]);

  const openScheduleDrawer = (item?: PaymentScheduleItem) => {
    setEditingItem(item ?? null);
    setScheduleOpen(true);
  };

  const savePaymentMilestone = async (formData: FormData): Promise<void> => {
    markUnsaved();
    const action = editingItem ? updatePaymentMilestoneAction : addPaymentMilestoneAction;
    const result = await trackMutation(`payment:${editingItem?.id ?? "new"}`, () =>
      action(formData)
    );
    if (result.ok) {
      setScheduleOpen(false);
      setEditingItem(null);
      router.refresh();
      return;
    }
    toast({
      title: "Save failed",
      description: result.error ?? "Could not save this payment milestone.",
      variant: "error",
    });
  };

  const deletePaymentMilestone = async (item: PaymentScheduleItem): Promise<void> => {
    markUnsaved();
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    formData.set("itemId", item.id);
    const result = await trackMutation(`payment:delete:${item.id}`, () =>
      deletePaymentMilestoneAction(formData)
    );
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

    markUnsaved();
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    formData.set("templateId", selectedTemplateId);
    formData.set("mode", mode);
    const result = await trackMutation(`payment:template:${mode}`, () =>
      applyPaymentTemplateAction(formData)
    );
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
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    formData.set("templateName", templateNameDraft);
    formData.set("amountType", templateAmountType);
    const result = await trackMutation("payment:template:save", () =>
      createPaymentTemplateAction(formData)
    );
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
    (sum, item) => sum + paymentMilestoneAmount(item, estimateTotal),
    0
  );
  const remaining = estimateTotal - totalScheduled;
  const isOverallocated = remaining < -0.005;
  const isReconciled = Math.abs(remaining) < 0.005;
  const allocationPct = estimateTotal > 0 ? (totalScheduled / estimateTotal) * 100 : 0;
  const amountNumber = Number(amountDraft);
  const amountPercentDisplay = paymentPercentFromAmount(
    Number.isFinite(amountNumber) ? amountNumber : 0,
    estimateTotal
  );
  const paymentPercentHelper =
    estimateTotal <= 0
      ? "Add scope pricing first to use percentages."
      : amountDraft.trim() && amountPercentDisplay
        ? Number(amountPercentDisplay) > 100
          ? "Exceeds estimate total."
          : `${amountPercentDisplay}% of ${fmt(estimateTotal)}`
        : null;
  const editingAmount = editingItem ? paymentMilestoneAmount(editingItem, estimateTotal) : 0;
  const projectedAmount = Number.isFinite(amountNumber) ? amountNumber : 0;
  const projectedRemaining = estimateTotal - (totalScheduled - editingAmount + projectedAmount);
  const draftOverallocated = projectedRemaining < -0.005;

  const handleAmountChange = (value: string): void => {
    setAmountDraft(value);
    const n = Number(value);
    setPercentDraft(Number.isFinite(n) ? paymentPercentFromAmount(n, estimateTotal) : "");
  };

  const handlePercentChange = (value: string): void => {
    setPercentDraft(value);
    const pct = parsePaymentPercentInput(value);
    if (pct == null) {
      setAmountDraft("");
      return;
    }
    setAmountDraft(String(paymentAmountFromPercent(pct, estimateTotal)));
  };

  const milestoneRows: ProposalPaymentMilestoneRow[] = paymentSchedule.map((item) => ({
    id: item.id,
    title: item.title || "—",
    amount: paymentMilestoneAmount(item, estimateTotal),
    description: item.description,
    dueDate: item.dueDate,
    status: item.status,
  }));

  return (
    <section className={cn(EB.paymentSchedule, nested && EB.paymentScheduleNested)}>
      <div className="flex flex-wrap items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <h3 className={cn(EB.paymentTitle, nested && EB.paymentHeaderDuplicate)}>
            Payment schedule
          </h3>
          <p className={EB.paymentSubtitle}>Client payment milestones</p>
        </div>
        {!isLocked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-h-11 shrink-0 px-2.5 md:min-h-8", EB.actionSecondary)}
            onClick={() => openScheduleDrawer()}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Schedule Payment
          </Button>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
          <span className={EB.paymentStatLabel}>
            Estimate total <span className={EB.paymentStatValue}>{fmt(estimateTotal)}</span>
          </span>
          <span className={EB.paymentStatLabel}>
            Scheduled <span className={EB.paymentStatValue}>{fmt(totalScheduled)}</span>
          </span>
          <span className={EB.paymentStatLabel}>
            Allocated <span className={EB.paymentStatValue}>{allocationPct.toFixed(1)}%</span>
          </span>
          <span className={EB.paymentStatLabel}>
            {isOverallocated ? "Over allocated" : "Remaining"}{" "}
            <span
              className={cn(EB.paymentStatValue, isOverallocated && "text-destructive")}
              data-testid="payment-schedule-remaining"
            >
              {fmt(Math.abs(remaining))}
            </span>
          </span>
        </div>

        {paymentSchedule.length > 0 ? (
          <div
            className={cn(
              "mb-3 rounded-md border px-3 py-2 text-xs",
              isOverallocated
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : isReconciled
                  ? "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]"
                  : "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]"
            )}
            role={isOverallocated ? "alert" : "status"}
            data-testid="payment-schedule-reconciliation"
          >
            {isOverallocated
              ? `Schedule exceeds the Estimate total by ${fmt(Math.abs(remaining))}. Reduce a milestone before adding more.`
              : isReconciled
                ? "Payment schedule is fully allocated."
                : `${fmt(remaining)} remains unscheduled. Partial schedules are valid and may be saved.`}
          </div>
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

        <ProposalPaymentMilestoneList
          milestones={milestoneRows}
          actions={(m) => {
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
                    <Link
                      href={buildCreateDraftInvoiceHref(estimateId, item.id, estimateReturnHref)}
                    >
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
                    <form key={direction} action={reorderPaymentScheduleAction}>
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
                        className={cn(
                          "min-h-11 min-w-11 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                          EB.btnGhost
                        )}
                        disabled={!orderedItemIds}
                        aria-label={`Move ${item.title} ${direction}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </Button>
                    </form>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    "min-h-11 min-w-11 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                    EB.btnGhost
                  )}
                  aria-label={`Edit ${item.title}`}
                  onClick={() => openScheduleDrawer(item)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <div className="inline">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(
                      "min-h-11 min-w-11 text-[var(--hh-danger)] hover:bg-[var(--hh-danger-soft-fill)] md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                      EB.btnGhost
                    )}
                    aria-label={`Delete ${item.title}`}
                    onClick={() => void deletePaymentMilestone(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          }}
        />
        {paymentSchedule.length > 0 &&
        ((!canCreateMilestoneInvoices && isLocked) ||
          (invoiceProjectLink && !invoiceProjectLink.canCreateInvoice)) ? (
          <div
            className="estimate-payment-link-warning mt-3 rounded-hh-compact border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-hh-table-cell text-[var(--hh-warning)]"
            role="note"
          >
            {!canCreateMilestoneInvoices
              ? "Only Approved or Converted estimates can create milestone invoices."
              : (invoiceProjectLink?.message ??
                "Invoice generation requires a linked project before creating invoices from payment milestones.")}
          </div>
        ) : null}

        {/* Drawer: Schedule Payment */}
        <Sheet
          open={scheduleOpen}
          onOpenChange={(open) => {
            setScheduleOpen(open);
            if (!open) setEditingItem(null);
          }}
        >
          <SheetContent
            side="right"
            className={estimateSurfaceSheetClassName("payment")}
            data-estimate-surface="payment"
          >
            <SheetHeader className={EB.sheetHeader}>
              <SheetTitle className={EB.sheetTitle}>
                {editingItem ? "Edit Payment" : "Schedule Payment"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {editingItem
                  ? "Edit a payment milestone on this estimate."
                  : "Add a payment milestone to this estimate."}
              </SheetDescription>
            </SheetHeader>
            <div className={EB.sheetContent}>
              <form
                id={PAYMENT_MILESTONE_FORM_ID}
                key={editingItem?.id ?? "new-payment"}
                action={savePaymentMilestone}
                className={cn(EB.sheetContentInner, "max-w-none space-y-[1.125rem]")}
              >
                <input type="hidden" name="estimateId" value={estimateId} />
                {editingItem ? <input type="hidden" name="itemId" value={editingItem.id} /> : null}
                <div className={EB.sheetField}>
                  <label className={EB.sheetLabel}>Payment Name</label>
                  <Input
                    name="title"
                    placeholder="e.g. Deposit"
                    defaultValue={editingItem?.title ?? ""}
                    className={ebSheetInput("text-sm")}
                    required
                  />
                </div>
                <div className={EB.sheetField}>
                  <div className={EB.paymentAmountRow}>
                    <div className={EB.paymentAmountCol}>
                      <label htmlFor="payment-milestone-amount" className={EB.sheetLabel}>
                        Amount
                      </label>
                      <Input
                        id="payment-milestone-amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        min={0}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amountDraft}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        onWheel={(event) => event.currentTarget.blur()}
                        className={ebSheetInput(
                          cn("text-sm text-right text-slate-50", EB.inputNumeric)
                        )}
                        required
                      />
                    </div>
                    <div className={EB.paymentPercentCol}>
                      <label htmlFor="payment-milestone-percent" className={EB.sheetLabel}>
                        % of estimate
                      </label>
                      <Input
                        id="payment-milestone-percent"
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        inputMode="decimal"
                        placeholder="Optional"
                        value={percentDraft}
                        onChange={(e) => handlePercentChange(e.target.value)}
                        onWheel={(event) => event.currentTarget.blur()}
                        className={ebSheetInput(
                          cn("text-sm text-right text-slate-50", EB.inputNumeric)
                        )}
                        aria-describedby={
                          paymentPercentHelper ? "payment-percent-helper" : undefined
                        }
                      />
                    </div>
                  </div>
                  {paymentPercentHelper ? (
                    <p id="payment-percent-helper" className={EB.paymentPercentHelper}>
                      {paymentPercentHelper}
                    </p>
                  ) : null}
                  {draftOverallocated ? (
                    <p className="text-xs text-destructive" role="alert">
                      This amount would exceed the Estimate total by{" "}
                      {fmt(Math.abs(projectedRemaining))}.
                    </p>
                  ) : null}
                </div>
                <input type="hidden" name="description" value={paymentDescriptionDraft} />
                <div className={EB.sheetField}>
                  <label htmlFor="payment-milestone-description" className={EB.sheetLabel}>
                    Description
                  </label>
                  <ProposalScopeEditor
                    id="payment-milestone-description"
                    value={paymentDescriptionDraft}
                    onChange={setPaymentDescriptionDraft}
                    density="comfortable"
                    showHandle={false}
                    placeholder="What this payment covers…"
                    ariaLabel="Payment milestone description"
                    className={cn(EB.sheetTextarea, "rounded-md px-2 py-2")}
                  />
                </div>
                <div className={EB.sheetField}>
                  <label className={EB.sheetLabel}>Due Date</label>
                  <Input
                    name="dueDate"
                    type="date"
                    defaultValue={editingItem?.dueDate ?? ""}
                    className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                  />
                </div>
              </form>
            </div>
            <SheetFooter className={EB.sheetFooter}>
              <div className={EB.sheetFooterActions}>
                <Button
                  type="submit"
                  form={PAYMENT_MILESTONE_FORM_ID}
                  size="sm"
                  className={EB.sheetPrimary}
                  disabled={draftOverallocated}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={EB.sheetSecondary}
                  onClick={() => setScheduleOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>

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
                <select
                  value={templateAmountType}
                  onChange={(event) =>
                    setTemplateAmountType(event.target.value === "fixed" ? "fixed" : "percent")
                  }
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  aria-label="Payment template amount type"
                >
                  <option value="percent">Percentages of Estimate total</option>
                  <option value="fixed">Fixed-dollar amounts</option>
                </select>
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSaveTemplateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void savePaymentTemplate()}
                disabled={!templateNameDraft.trim()}
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
