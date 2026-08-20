"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast/toast-provider";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB, ebSheetGlassNarrow, ebSheetInput } from "./estimate-builder-ui";
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
type ApplyTemplateAction = (formData: FormData) => Promise<void>;
type CreateTemplateAction = (formData: FormData) => Promise<void>;

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
    nested = false,
    addPaymentMilestoneAction,
    updatePaymentMilestoneAction,
    deletePaymentMilestoneAction,
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

  const totalScheduled = paymentSchedule.reduce(
    (sum, item) => sum + paymentMilestoneAmount(item, estimateTotal),
    0
  );
  const remaining = Math.max(0, estimateTotal - totalScheduled);
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
            Remaining <span className={EB.paymentStatValue}>{fmt(remaining)}</span>
          </span>
        </div>

        {isLocked && paymentSchedule.length > 0 && invoiceContext ? (
          <div
            className="mb-2 rounded-md border border-border bg-muted/35 px-3 py-2.5"
            data-testid="estimate-invoice-readiness"
            role="note"
            aria-label="Draft invoice readiness"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Draft invoice readiness</p>
              {invoiceContext.estimateNumber ? (
                <span className="text-[11px] tabular-nums text-muted-foreground">
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
                    <span className="text-[11.5px] font-medium leading-none text-muted-foreground">
                      {invoiceNo}
                      {invoice?.status ? ` · ${invoice.status}` : ""}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      className={cn("min-h-11 px-3 text-[12.5px]", EB.actionSecondary)}
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

              const canCreate = invoiceProjectLink?.canCreateInvoice !== false;
              const estimateReturnHref = buildEstimateMilestoneReturnHref(estimateId, item.id);
              return (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild={canCreate}
                  disabled={!canCreate}
                  title={!canCreate ? invoiceProjectLink?.message : undefined}
                  className={cn("min-h-11 px-3 text-[12.5px]", EB.actionSecondary)}
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
                      "min-h-11 min-w-11 text-red-700 hover:bg-red-50 hover:text-red-800 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
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
        invoiceProjectLink &&
        !invoiceProjectLink.canCreateInvoice ? (
          <div
            className="estimate-payment-link-warning mt-3 rounded-md border border-[#e8d8b7] bg-[#faf4e8] px-3 py-2 text-[13px] leading-snug text-[#835d18]"
            role="note"
          >
            {invoiceProjectLink.message ??
              "Invoice generation requires a linked project before creating invoices from payment milestones."}
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
          <SheetContent side="right" className={ebSheetGlassNarrow()}>
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
      </div>
    </section>
  );
}
