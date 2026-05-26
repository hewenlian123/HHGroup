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
import { EB, ebSheetGlassWide, ebSheetInput } from "./estimate-builder-ui";
import {
  EstimateDiscountOptionsPopover,
  EstimateTaxPresetMenu,
  EstimateValidUntilQuickChips,
} from "./estimate-details-drawer-controls";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

const metaLabel =
  "mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] leading-tight text-[#9EA8B8]";
const metaPanel = cn(EB.draftPanel, "rounded-md px-3 py-2.5 sm:px-4 sm:py-3");
const metaInput = ebSheetInput("text-sm");

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
        <dd className="truncate text-[14px] font-medium leading-snug text-[#F6F7FA]">
          {customer.trim() || "—"}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className={metaLabel}>Project</dt>
        <dd className="truncate text-[14px] font-medium leading-snug text-[#F6F7FA]">
          {project.trim() || "—"}
        </dd>
      </div>
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        <dt className={metaLabel}>Address</dt>
        <dd className="text-[14px] leading-[1.4] text-[#D8DEE8]">{address.trim() || "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className={metaLabel}>Estimate date</dt>
        <dd className="text-[14px] tabular-nums leading-snug text-[#D8DEE8] [font-feature-settings:'tnum']">
          {estimateDate}
        </dd>
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
  tax,
  discount,
  estimateSubtotal,
  saveEstimateMetaAction,
  onSaveDetails,
}: {
  meta: EstimateEditCustomerMeta;
  estimateId: string;
  estimateNumber: string;
  status: EstimateStatus | string;
  today: string;
  isReadOnly: boolean;
  tax: number;
  discount: number;
  estimateSubtotal: number;
  saveEstimateMetaAction: (formData: FormData) => Promise<void>;
  onSaveDetails?: () => void;
}): React.ReactElement {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [formResetKey, setFormResetKey] = React.useState(0);
  const [estimateDate, setEstimateDate] = React.useState(meta.estimateDate ?? today);
  const [validUntil, setValidUntil] = React.useState(meta.validUntil ?? "");
  const [taxDraft, setTaxDraft] = React.useState(tax);
  const [discountDraft, setDiscountDraft] = React.useState(discount);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setTaxDraft(tax);
    setDiscountDraft(discount);
  }, [discount, meta.estimateDate, meta.validUntil, tax, today]);

  React.useEffect(() => {
    if (isReadOnly) setDetailsOpen(false);
  }, [isReadOnly]);

  const displayDate = meta.estimateDate ?? today;

  const discardDetails = (): void => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setTaxDraft(tax);
    setDiscountDraft(discount);
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
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="text-base font-semibold tabular-nums tracking-tight text-[#F6F7FA] sm:text-lg [font-feature-settings:'tnum']">
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
              variant="ghost"
              size="sm"
              className={cn("min-h-11 shrink-0 gap-1.5 md:min-h-8", EB.btnText)}
              onClick={() => setDetailsOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5 opacity-80" aria-hidden />
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
              ebSheetGlassWide(),
              !detailsOpen &&
                "invisible pointer-events-none fixed right-0 top-0 z-0 h-px min-h-0 w-px min-w-0 overflow-hidden border-0 p-0 opacity-0 shadow-none [&>button]:hidden"
            )}
          >
            <div className="flex max-h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden">
              <SheetHeader className={EB.sheetHeader}>
                <SheetTitle className={EB.sheetTitle}>
                  Customer / project / pricing details
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Edit customer, project, address, and pricing fields for this estimate.
                </SheetDescription>
              </SheetHeader>

              <div className={EB.sheetContent}>
                <form
                  ref={formRef}
                  key={formResetKey}
                  id="estimate-meta-form"
                  action={saveEstimateMetaAction}
                  className={EB.sheetContentInner}
                >
                  <input type="hidden" name="estimateId" value={estimateId} />
                  <input type="hidden" name="notes" value={meta.notes ?? ""} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className={cn(EB.sheetField, "min-w-0")}>
                      <Label htmlFor="clientName" className={EB.sheetLabel}>
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
                    <div className={cn(EB.sheetField, "min-w-0")}>
                      <Label htmlFor="projectName" className={EB.sheetLabel}>
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
                    <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                      <Label htmlFor="address" className={EB.sheetLabel}>
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
                    <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                      <Label htmlFor="estimateDate" className={EB.sheetLabel}>
                        Estimate date
                      </Label>
                      <input type="hidden" name="estimateDate" value={estimateDate} />
                      <FinanceDatePicker
                        appearance="glass"
                        size="sm"
                        value={estimateDate}
                        onChange={setEstimateDate}
                        className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/[0.08] pt-4">
                    <p className={EB.sheetSectionLabel}>Terms & pricing</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <Label htmlFor="validUntil" className={EB.sheetLabel}>
                          Valid until
                        </Label>
                        <input type="hidden" name="validUntil" value={validUntil} />
                        <FinanceDatePicker
                          appearance="glass"
                          size="sm"
                          value={validUntil}
                          onChange={setValidUntil}
                          className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                          allowClear
                        />
                        <EstimateValidUntilQuickChips
                          estimateDate={estimateDate}
                          onValidUntilChange={setValidUntil}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <Label htmlFor="salesPerson" className={EB.sheetLabel}>
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
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <div className={EB.sheetLabelRow}>
                          <Label htmlFor="tax" className={EB.sheetLabel}>
                            Tax amount
                          </Label>
                          <EstimateTaxPresetMenu
                            estimateSubtotal={estimateSubtotal}
                            tax={taxDraft}
                            onApplyTax={setTaxDraft}
                            onTaxTouched={() => undefined}
                          />
                        </div>
                        <Input
                          id="tax"
                          name="tax"
                          type="number"
                          step="0.01"
                          min={0}
                          value={taxDraft}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setTaxDraft(Number.isFinite(n) ? Math.max(0, n) : 0);
                          }}
                          className={ebSheetInput(cn("text-sm text-[#D8DEE8]", EB.inputNumeric))}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <div className={EB.sheetLabelRow}>
                          <Label htmlFor="discount" className={EB.sheetLabel}>
                            Discount
                          </Label>
                          <EstimateDiscountOptionsPopover
                            discount={discountDraft}
                            preDiscountTotal={estimateSubtotal + taxDraft}
                            onDiscountChange={setDiscountDraft}
                          />
                        </div>
                        <Input
                          id="discount"
                          name="discount"
                          type="number"
                          step="0.01"
                          min={0}
                          value={discountDraft}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setDiscountDraft(Number.isFinite(n) ? Math.max(0, n) : 0);
                          }}
                          className={ebSheetInput(cn("text-sm text-[#D8DEE8]", EB.inputNumeric))}
                        />
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              <SheetFooter className={EB.sheetFooter}>
                <div className={EB.sheetFooterActions}>
                  <Button
                    type="button"
                    size="sm"
                    className={EB.sheetPrimary}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={EB.sheetSecondary}
                    onClick={() => setDetailsOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}
