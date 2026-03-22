"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PaymentScheduleItem, PaymentScheduleTemplate } from "@/lib/data";
import { paymentMilestoneAmount } from "@/lib/data";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AddAction = (formData: FormData) => Promise<void>;
type UpdateAction = (formData: FormData) => Promise<void>;
type DeleteAction = (formData: FormData) => Promise<void>;
type MarkPaidAction = (formData: FormData) => Promise<void>;
type ReorderAction = (formData: FormData) => Promise<void>;
type ApplyTemplateAction = (formData: FormData) => Promise<void>;
type CreateTemplateAction = (formData: FormData) => Promise<void>;

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

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
    <section className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden bg-background">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-border bg-muted/20 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Payment Schedule</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Milestone billing plan.</p>
        </div>
        {!isLocked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-md h-8"
            onClick={() => setScheduleOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Schedule Payment
          </Button>
        )}
      </div>
      <div className="p-0">
        {/* Summary row */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-6 text-sm border-b border-zinc-200/60 dark:border-border">
          <span className="text-muted-foreground">
            Estimate total{" "}
            <span className="font-semibold text-foreground tabular-nums">
              ${fmt(estimateTotal)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Scheduled{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                totalsMatch ? "text-emerald-600 dark:text-emerald-500" : "text-foreground"
              )}
            >
              ${fmt(totalScheduled)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Remaining{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                remaining === 0 ? "text-emerald-600 dark:text-emerald-500" : "text-foreground"
              )}
            >
              ${fmt(remaining)}
            </span>
          </span>
        </div>

        {/* Schedule table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/30">
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                  Payment Name
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground tabular-nums">
                  Amount
                </th>
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                  Payment Terms
                </th>
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                  Due Date
                </th>
                {!isLocked && <th className="w-16 py-2.5 px-2" />}
              </tr>
            </thead>
            <tbody>
              {paymentSchedule.length === 0 ? (
                <tr className="border-b border-zinc-100/50 dark:border-border/30">
                  <td colSpan={5} className="py-8 px-4 text-center text-sm text-muted-foreground">
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
                      className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-medium text-foreground">
                        {item.title || "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium text-foreground">
                        ${fmt(amount)}
                        {item.amountType === "percent" && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({item.value}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{item.dueRule || "—"}</td>
                      <td className="py-2.5 px-4 text-muted-foreground tabular-nums">
                        {dueDateDisplay}
                      </td>
                      {!isLocked ? (
                        <td className="py-2 px-2 align-middle">
                          <form action={deletePaymentMilestoneAction} className="flex justify-end">
                            <input type="hidden" name="estimateId" value={estimateId} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              aria-label="Delete"
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
          <SheetContent side="right" className="w-[420px] sm:w-[480px]">
            <SheetHeader>
              <SheetTitle>Schedule Payment</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <form action={addPaymentMilestoneAction} className="space-y-4">
                <input type="hidden" name="estimateId" value={estimateId} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Payment Name</label>
                  <Input name="title" placeholder="e.g. Deposit" className="h-9" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Amount</label>
                  <div className="flex gap-2">
                    <select
                      name="amountType"
                      defaultValue="fixed"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1"
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
                      className="h-9 w-28"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Payment Terms</label>
                  <Input name="dueRule" placeholder="e.g. Due on signing" className="h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                  <Input name="dueDate" type="date" className="h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea
                    name="notes"
                    placeholder="Optional"
                    className="min-h-[96px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit" className="rounded-md">
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md"
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
