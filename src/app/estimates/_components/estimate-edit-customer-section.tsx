"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EstimateStatusBadge } from "./estimate-status-badge";
import type { EstimateStatus } from "./estimate-status-badge";
import { FinanceDatePicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EB, ebInput } from "./estimate-builder-ui";
import { cn } from "@/lib/utils";

const metaLabel = "mb-0.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500";
const metaPanel =
  "rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:px-4 sm:py-3";
const metaInput = ebInput("h-9 min-h-9 text-sm md:h-8 md:min-h-8");
const detailsSheetClass =
  "estimate-builder !fixed flex w-full max-w-[calc(100vw-1rem)] flex-col border-l border-white/[0.08] bg-[rgba(14,18,28,0.96)] p-0 text-zinc-100 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),-12px_0_48px_rgba(0,0,0,0.35)] backdrop-blur-xl max-md:inset-y-2 max-md:right-2 max-md:h-[calc(100dvh-1rem)] max-md:!translate-x-0 max-md:rounded-xl max-md:data-[state=open]:!animate-none max-md:data-[state=open]:!transform-none sm:max-w-[440px] [&>button]:text-zinc-400 [&>button]:hover:bg-white/[0.06] [&>button]:hover:text-zinc-100";

export type EstimateEditCustomerMeta = {
  client: { name: string; address: string };
  project: { name: string };
  estimateDate?: string | null;
  validUntil?: string | null;
  salesPerson?: string | null;
  notes?: string | null;
};

function ReadOnlyMetaRows({
  customer,
  project,
  address,
  estimateDate,
}: {
  customer: string;
  project: string;
  address: string;
  estimateDate: string;
}): React.ReactElement {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="min-w-0">
        <dt className={metaLabel}>Customer</dt>
        <dd className="truncate text-sm font-medium text-zinc-200">{customer.trim() || "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className={metaLabel}>Project</dt>
        <dd className="truncate text-sm font-medium text-zinc-200">{project.trim() || "—"}</dd>
      </div>
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        <dt className={metaLabel}>Address</dt>
        <dd className="text-sm leading-snug text-zinc-400">{address.trim() || "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className={metaLabel}>Estimate date</dt>
        <dd className="text-sm tabular-nums text-zinc-400">{estimateDate}</dd>
      </div>
    </dl>
  );
}

export function EstimateEditCustomerSection({
  meta,
  estimateId,
  estimateNumber,
  status,
  today,
  isReadOnly,
  markupPct,
  tax,
  discount,
  saveEstimateMetaAction,
  onSaveDetails,
}: {
  meta: EstimateEditCustomerMeta;
  estimateId: string;
  estimateNumber: string;
  status: EstimateStatus | string;
  today: string;
  isReadOnly: boolean;
  markupPct: string;
  tax: number;
  discount: number;
  saveEstimateMetaAction: (formData: FormData) => Promise<void>;
  onSaveDetails?: () => void;
}): React.ReactElement {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [formResetKey, setFormResetKey] = React.useState(0);
  const [estimateDate, setEstimateDate] = React.useState(meta.estimateDate ?? today);
  const [validUntil, setValidUntil] = React.useState(meta.validUntil ?? "");
  const formRef = React.useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
  }, [meta.estimateDate, meta.validUntil, today]);

  const displayDate = meta.estimateDate ?? today;

  const discardDetails = (): void => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setFormResetKey((k) => k + 1);
  };

  const handleDetailsOpenChange = (open: boolean): void => {
    if (!open) {
      discardDetails();
    }
    setDetailsOpen(open);
  };

  return (
    <section className={cn(EB.section, "pb-3")}>
      <div className={metaPanel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base font-semibold tabular-nums tracking-tight text-zinc-50 sm:text-lg">
              {estimateNumber}
            </span>
            <EstimateStatusBadge
              status={status === "Converted" ? "Converted" : (status as EstimateStatus)}
              label={status === "Converted" ? "Converted to Project" : undefined}
              className="shrink-0 text-[11px]"
            />
          </div>
          {!isReadOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("shrink-0 md:min-h-8", EB.btnGhost)}
              onClick={() => setDetailsOpen(true)}
            >
              Edit details
            </Button>
          ) : null}
        </div>

        <ReadOnlyMetaRows
          customer={meta.client.name}
          project={meta.project.name}
          address={meta.client.address}
          estimateDate={displayDate}
        />
      </div>

      {!isReadOnly ? (
        <Sheet open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
          <SheetContent
            forceMount
            side="right"
            aria-hidden={!detailsOpen}
            className={cn(
              detailsSheetClass,
              !detailsOpen &&
                "invisible pointer-events-none fixed right-0 top-0 z-0 h-px min-h-0 w-px min-w-0 overflow-hidden border-0 p-0 opacity-0 shadow-none [&>button]:hidden"
            )}
          >
            <div className="flex max-h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden">
              <SheetHeader className="border-b border-white/[0.06] px-4 pb-3 pt-4 text-left sm:px-5">
                <SheetTitle className="text-sm font-semibold tracking-tight text-zinc-50">
                  Customer / project / pricing details
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Edit customer, project, address, and pricing fields for this estimate.
                </SheetDescription>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-5">
                <form
                  ref={formRef}
                  key={formResetKey}
                  id="estimate-meta-form"
                  action={saveEstimateMetaAction}
                  className="space-y-4"
                >
                  <input type="hidden" name="estimateId" value={estimateId} />
                  <input type="hidden" name="notes" value={meta.notes ?? ""} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <Label htmlFor="clientName" className={metaLabel}>
                        Customer
                      </Label>
                      <Input
                        id="clientName"
                        name="clientName"
                        defaultValue={meta.client.name}
                        placeholder="Client or company name"
                        className={metaInput}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="projectName" className={metaLabel}>
                        Project
                      </Label>
                      <Input
                        id="projectName"
                        name="projectName"
                        defaultValue={meta.project.name}
                        placeholder="Project name"
                        className={metaInput}
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <Label htmlFor="address" className={metaLabel}>
                        Address
                      </Label>
                      <Input
                        id="address"
                        name="address"
                        defaultValue={meta.client.address}
                        placeholder="Site or client address"
                        className={metaInput}
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <Label htmlFor="estimateDate" className={metaLabel}>
                        Estimate date
                      </Label>
                      <input type="hidden" name="estimateDate" value={estimateDate} />
                      <FinanceDatePicker
                        appearance="glass"
                        size="sm"
                        value={estimateDate}
                        onChange={setEstimateDate}
                        className={ebInput(cn(EB.dateField, "h-9 min-h-9 md:h-8 md:min-h-8"))}
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/[0.06] pt-3">
                    <p className={cn(metaLabel, "mb-2 !text-zinc-500")}>Terms & pricing</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <Label htmlFor="validUntil" className={metaLabel}>
                          Valid until
                        </Label>
                        <input type="hidden" name="validUntil" value={validUntil} />
                        <FinanceDatePicker
                          appearance="glass"
                          size="sm"
                          value={validUntil}
                          onChange={setValidUntil}
                          className={ebInput(cn(EB.dateField, "h-9 min-h-9 md:h-8 md:min-h-8"))}
                          allowClear
                        />
                      </div>
                      <div className="min-w-0">
                        <Label htmlFor="salesPerson" className={metaLabel}>
                          Sales
                        </Label>
                        <Input
                          id="salesPerson"
                          name="salesPerson"
                          defaultValue={meta.salesPerson ?? ""}
                          placeholder="Name"
                          className={metaInput}
                        />
                      </div>
                      <div className="min-w-0">
                        <Label htmlFor="tax" className={metaLabel}>
                          Tax
                        </Label>
                        <Input
                          id="tax"
                          name="tax"
                          type="number"
                          step="0.01"
                          defaultValue={tax}
                          className={ebInput(cn(metaInput, EB.inputNumeric))}
                        />
                      </div>
                      <div className="min-w-0">
                        <Label htmlFor="discount" className={metaLabel}>
                          Discount
                        </Label>
                        <Input
                          id="discount"
                          name="discount"
                          type="number"
                          step="0.01"
                          defaultValue={discount}
                          className={ebInput(cn(metaInput, EB.inputNumeric))}
                        />
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <Label htmlFor="markupPct" className={metaLabel}>
                          Markup %
                        </Label>
                        <Input
                          id="markupPct"
                          name="markupPct"
                          type="number"
                          step="0.1"
                          defaultValue={markupPct}
                          className={ebInput(cn(metaInput, EB.inputNumeric))}
                        />
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              <SheetFooter className="mt-auto border-t border-white/[0.06] bg-[rgba(10,12,18,0.55)] px-4 py-3 sm:px-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(EB.btnGhost)}
                  onClick={() => setDetailsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn(EB.btnPrimary)}
                  onClick={() => {
                    if (onSaveDetails) {
                      onSaveDetails();
                      return;
                    }
                    formRef.current?.requestSubmit();
                  }}
                >
                  Save
                </Button>
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}
