"use client";

import * as React from "react";
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
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB, ebInput } from "./estimate-builder-ui";

type AddAction = (formData: FormData) => Promise<void>;
type UpdateAction = (formData: FormData) => Promise<void>;
type DeleteAction = (formData: FormData) => Promise<void>;
type MarkPaidAction = (formData: FormData) => Promise<void>;
type ReorderAction = (formData: FormData) => Promise<void>;
type ApplyTemplateAction = (formData: FormData) => Promise<void>;
type CreateTemplateAction = (formData: FormData) => Promise<void>;

const fmt = formatEstimateCurrency;
const scheduleDrawerClass = cn(
  "w-[420px] border-white/10 bg-[rgba(14,18,28,0.96)] p-5 text-zinc-100 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),-24px_0_64px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:w-[480px]",
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
    deletePaymentMilestoneAction,
  } = props;
  const [scheduleOpen, setScheduleOpen] = React.useState(false);

  const totalScheduled = paymentSchedule.reduce(
    (sum, item) => sum + paymentMilestoneAmount(item, estimateTotal),
    0
  );
  const totalsMatch = Math.abs(totalScheduled - estimateTotal) < 0.01;
  const remaining = Math.max(0, estimateTotal - totalScheduled);

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100">Payment Schedule</h2>
          <p className="mt-0.5 text-xs text-zinc-400">Milestone billing plan.</p>
        </div>
        {!isLocked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-h-11 px-3 md:min-h-8", EB.btnGhost)}
            onClick={() => setScheduleOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Schedule Payment
          </Button>
        )}
      </div>
      <div className="p-0">
        {/* Summary row */}
        <div className="flex flex-wrap items-center gap-6 border-b border-white/[0.06] px-4 py-3 text-sm">
          <span className="text-zinc-400">
            Estimate total{" "}
            <span className="font-semibold text-zinc-100 tabular-nums">{fmt(estimateTotal)}</span>
          </span>
          <span className="text-zinc-400">
            Scheduled{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                totalsMatch
                  ? "text-hh-profit-positive dark:text-hh-profit-positive"
                  : "text-zinc-100"
              )}
            >
              {fmt(totalScheduled)}
            </span>
          </span>
          <span className="text-zinc-400">
            Remaining{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                remaining === 0
                  ? "text-hh-profit-positive dark:text-hh-profit-positive"
                  : "text-zinc-100"
              )}
            >
              {fmt(remaining)}
            </span>
          </span>
        </div>

        {/* Schedule table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.025]">
                <th className="text-left py-2.5 px-4 font-medium text-zinc-400">Payment Name</th>
                <th className="text-right py-2.5 px-4 font-medium text-zinc-400 tabular-nums">
                  Amount
                </th>
                <th className="text-left py-2.5 px-4 font-medium text-zinc-400">Payment Terms</th>
                <th className="text-left py-2.5 px-4 font-medium text-zinc-400">Due Date</th>
                {!isLocked && <th className="w-16 py-2.5 px-2" />}
              </tr>
            </thead>
            <tbody>
              {paymentSchedule.length === 0 ? (
                <tr className="border-b border-white/[0.04]">
                  <td colSpan={5} className="py-8 px-4 text-center text-sm text-zinc-500">
                    No payment milestones yet.
                  </td>
                </tr>
              ) : (
                paymentSchedule.map((item) => {
                  const amount = paymentMilestoneAmount(item, estimateTotal);
                  const dueDateDisplay = item.dueDate
                    ? new Date(item.dueDate).toLocaleDateString(undefined, { dateStyle: "short" })
                    : "—";
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.035]"
                    >
                      <td className="py-2.5 px-4 font-medium text-zinc-100">{item.title || "—"}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium text-zinc-100">
                        {fmt(amount)}
                        {item.amountType === "percent" && (
                          <span className="ml-2 text-xs text-zinc-500">({item.value}%)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400">{item.dueRule || "—"}</td>
                      <td className="py-2.5 px-4 text-zinc-400 tabular-nums">{dueDateDisplay}</td>
                      {!isLocked ? (
                        <td className="py-2 px-2 align-middle">
                          <form action={deletePaymentMilestoneAction} className="flex justify-end">
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
                              aria-label="Delete payment milestone"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        </td>
                      ) : (
                        <td className="py-2 px-2" />
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Drawer: Schedule Payment */}
        <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <SheetContent side="right" className={scheduleDrawerClass}>
            <SheetHeader>
              <SheetTitle className="text-zinc-50">Schedule Payment</SheetTitle>
              <SheetDescription className="sr-only">
                Add a payment milestone to this estimate.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <form action={addPaymentMilestoneAction} className="space-y-4">
                <input type="hidden" name="estimateId" value={estimateId} />
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Payment Name</label>
                  <Input
                    name="title"
                    placeholder="e.g. Deposit"
                    className={ebInput("h-10 md:h-9")}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Amount</label>
                  <div className="flex gap-2">
                    <select
                      name="amountType"
                      defaultValue="fixed"
                      className={ebInput("h-10 flex-1 appearance-none md:h-9")}
                    >
                      <option value="fixed">Fixed</option>
                      <option value="percent">Percent</option>
                    </select>
                    <Input
                      name="value"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="30"
                      className={ebInput("h-10 w-28 text-right md:h-9")}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Payment Terms</label>
                  <Input
                    name="dueRule"
                    placeholder="e.g. Due on signing"
                    className={ebInput("h-10 md:h-9")}
                  />
                </div>
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Due Date</label>
                  <Input
                    name="dueDate"
                    type="date"
                    className={ebInput(cn(EB.dateField, "h-10 md:h-9"))}
                  />
                </div>
                <div className="space-y-1">
                  <label className={scheduleLabelClass}>Notes</label>
                  <textarea
                    name="notes"
                    placeholder="Optional"
                    className={ebInput("min-h-[96px] resize-none py-2 leading-relaxed")}
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
