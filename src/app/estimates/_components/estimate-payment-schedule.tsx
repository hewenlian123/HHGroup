"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PaymentScheduleItem, PaymentScheduleTemplate } from "@/lib/data";
import { paymentMilestoneAmount } from "@/lib/data";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB, ebInput } from "./estimate-builder-ui";
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
const scheduleDrawerClass = cn(
  "estimate-builder !fixed w-full max-w-[calc(100vw-1rem)] border-white/10 bg-[rgba(14,18,28,0.96)] p-5 text-zinc-100 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),-24px_0_64px_rgba(0,0,0,0.42)] backdrop-blur-xl max-md:inset-y-2 max-md:right-2 max-md:h-[calc(100dvh-1rem)] max-md:!translate-x-0 max-md:rounded-xl max-md:data-[state=open]:!animate-none max-md:data-[state=open]:!transform-none sm:max-w-[480px] md:w-[480px]",
  "[&>button]:text-zinc-400 [&>button]:hover:bg-white/[0.08] [&>button]:hover:text-zinc-100"
);
const scheduleLabelClass = "text-[11px] font-medium text-zinc-500";

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
          <SheetContent side="right" className={scheduleDrawerClass}>
            <SheetHeader>
              <SheetTitle className="text-zinc-50">
                {editingItem ? "Edit Payment" : "Schedule Payment"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {editingItem
                  ? "Edit a payment milestone on this estimate."
                  : "Add a payment milestone to this estimate."}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <form
                key={editingItem?.id ?? "new-payment"}
                action={editingItem ? updatePaymentMilestoneAction : addPaymentMilestoneAction}
                className="space-y-4"
              >
                <input type="hidden" name="estimateId" value={estimateId} />
                {editingItem ? <input type="hidden" name="itemId" value={editingItem.id} /> : null}
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Payment Name</label>
                  <Input
                    name="title"
                    placeholder="e.g. Deposit"
                    defaultValue={editingItem?.title ?? ""}
                    className={ebInput("h-10 md:h-9")}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Amount</label>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="2500"
                    defaultValue={editingItem?.amount ?? ""}
                    className={ebInput("h-10 text-right md:h-9")}
                    required
                  />
                </div>
                <input type="hidden" name="description" value={paymentDescriptionDraft} />
                <div className="space-y-1">
                  <label htmlFor="payment-milestone-description" className={scheduleLabelClass}>
                    Description
                  </label>
                  <ProposalScopeEditor
                    id="payment-milestone-description"
                    value={paymentDescriptionDraft}
                    onChange={setPaymentDescriptionDraft}
                    density="comfortable"
                    showHandle
                    placeholder="What this payment covers…"
                    ariaLabel="Payment milestone description"
                  />
                </div>
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Due Date</label>
                  <Input
                    name="dueDate"
                    type="date"
                    defaultValue={editingItem?.dueDate ?? ""}
                    className={ebInput(cn(EB.dateField, "h-10 md:h-9"))}
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="submit"
                    className={cn("min-h-11 px-4 md:min-h-10", EB.portalPrimaryButton)}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn("min-h-11 px-4 md:min-h-10", EB.portalGhostButton)}
                    onClick={() => setScheduleOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </section>
  );
}
