"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB, ebSheetGlassNarrow, ebSheetInput } from "./estimate-builder-ui";
import { ProposalScopeEditor } from "./proposal-scope-editor";
import {
  ProposalPaymentMilestoneList,
  type ProposalPaymentMilestoneRow,
} from "./proposal-payment-milestone-list";

type AddAction = (formData: FormData) => Promise<void>;
type UpdateAction = (formData: FormData) => Promise<void>;
type DeleteAction = (formData: FormData) => Promise<void>;
type MarkPaidAction = (formData: FormData) => Promise<void>;
type ReorderAction = (formData: FormData) => Promise<void>;
type ApplyTemplateAction = (formData: FormData) => Promise<void>;
type CreateTemplateAction = (formData: FormData) => Promise<void>;

const fmt = formatEstimateCurrency;
const PAYMENT_MILESTONE_FORM_ID = "estimate-payment-milestone-form";

export function EstimatePaymentSchedule(props: {
  estimateId: string;
  paymentSchedule: PaymentScheduleItem[];
  estimateTotal: number;
  isLocked: boolean;
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
    addPaymentMilestoneAction,
    updatePaymentMilestoneAction,
    deletePaymentMilestoneAction,
  } = props;
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<PaymentScheduleItem | null>(null);
  const [paymentDescriptionDraft, setPaymentDescriptionDraft] = React.useState("");

  React.useEffect(() => {
    if (!scheduleOpen) return;
    setPaymentDescriptionDraft(editingItem?.description ?? "");
  }, [scheduleOpen, editingItem?.id, editingItem?.description]);

  const openScheduleDrawer = (item?: PaymentScheduleItem) => {
    setEditingItem(item ?? null);
    setScheduleOpen(true);
  };

  const totalScheduled = paymentSchedule.reduce(
    (sum, item) => sum + paymentMilestoneAmount(item, estimateTotal),
    0
  );
  const remaining = Math.max(0, estimateTotal - totalScheduled);

  const milestoneRows: ProposalPaymentMilestoneRow[] = paymentSchedule.map((item) => ({
    id: item.id,
    title: item.title || "—",
    amount: paymentMilestoneAmount(item, estimateTotal),
    description: item.description,
    dueDate: item.dueDate,
  }));

  return (
    <section className={EB.paymentSchedule}>
      <div className="flex flex-wrap items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <h3 className={EB.paymentTitle}>Payment schedule</h3>
          <p className={EB.paymentSubtitle}>Contractor milestones</p>
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

        <ProposalPaymentMilestoneList
          milestones={milestoneRows}
          actions={(m) => {
            const item = paymentSchedule.find((x) => x.id === m.id);
            if (!item) return null;
            return (
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  asChild
                  className={cn(
                    "min-h-11 min-w-11 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                    EB.btnGhost
                  )}
                  aria-label={`Preview ${item.title}`}
                >
                  <Link href={`/estimates/${estimateId}/payments/${item.id}/preview`}>
                    <FileText className="h-4 w-4" />
                  </Link>
                </Button>
                {!isLocked ? (
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
                ) : null}
                {!isLocked ? (
                  <form action={deletePaymentMilestoneAction} className="inline">
                    <input type="hidden" name="estimateId" value={estimateId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className={cn(
                        "min-h-11 min-w-11 text-red-300 hover:bg-red-500/10 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                        EB.btnGhost
                      )}
                      aria-label={`Delete ${item.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          }}
        />

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
                action={editingItem ? updatePaymentMilestoneAction : addPaymentMilestoneAction}
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
                  <label className={EB.sheetLabel}>Amount</label>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="2500"
                    defaultValue={editingItem?.amount ?? ""}
                    className={ebSheetInput(
                      cn("text-sm text-right text-slate-50", EB.inputNumeric)
                    )}
                    required
                  />
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
