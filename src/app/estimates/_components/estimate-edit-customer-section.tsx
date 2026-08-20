"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  EstimateDocumentStyleField,
  EstimateDocumentStyleReadOnly,
} from "./estimate-document-style-field";
import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const metaLabel =
  "eb-estimate-context-label mb-0.5 block text-[12px] font-medium leading-tight text-muted-foreground";
const metaPanel = cn(EB.draftPanel, "eb-estimate-context-panel px-3 py-3 sm:px-4");
const metaInput = ebSheetInput("text-sm");

export type EstimateEditCustomerMeta = {
  client: { name: string; address: string };
  project: { name: string };
  estimateDate?: string | null;
  validUntil?: string | null;
  salesPerson?: string | null;
  notes?: string | null;
  documentStyle?: EstimateDocumentStyle;
};

function ReadOnlyMetaRows({
  customer,
  project,
  address,
  estimateDate,
  documentStyle,
}: {
  customer: string;
  project: string;
  address: string;
  estimateDate: string;
  documentStyle: EstimateDocumentStyle;
}): React.ReactElement {
  return (
    <>
      <dl className="hidden grid-cols-2 gap-x-5 gap-y-3 md:grid lg:grid-cols-5 lg:gap-x-6">
        <div className="eb-estimate-context-primary col-span-2 min-w-0 sm:col-span-1">
          <dt className={metaLabel}>Customer</dt>
          <dd className="truncate text-[14px] font-medium leading-snug text-foreground">
            {customer.trim() || "—"}
          </dd>
        </div>
        <div className="eb-estimate-context-primary col-span-2 min-w-0 sm:col-span-1">
          <dt className={metaLabel}>Project</dt>
          <dd className="break-words text-[14px] font-medium leading-snug text-foreground">
            {project.trim() || "—"}
          </dd>
        </div>
        <div className="eb-estimate-context-secondary col-span-2 min-w-0 lg:col-span-1">
          <dt className={metaLabel}>Address</dt>
          <dd className="text-[14px] leading-[1.4] text-muted-foreground">
            {address.trim() || "—"}
          </dd>
        </div>
        <div className="eb-estimate-context-secondary min-w-0">
          <dt className={metaLabel}>Estimate date</dt>
          <dd className="text-[14px] tabular-nums leading-snug text-muted-foreground [font-feature-settings:'tnum']">
            {estimateDate}
          </dd>
        </div>
        <EstimateDocumentStyleReadOnly value={documentStyle} />
      </dl>

      <div className="eb-estimate-context-mobile md:hidden">
        <dl className="grid gap-2.5">
          <div className="eb-estimate-context-primary min-w-0">
            <dt className={metaLabel}>Customer</dt>
            <dd className="text-[14px] font-medium leading-snug text-foreground">
              {customer.trim() || "—"}
            </dd>
          </div>
          <div className="eb-estimate-context-primary min-w-0">
            <dt className={metaLabel}>Project</dt>
            <dd className="break-words text-[14px] font-medium leading-snug text-foreground">
              {project.trim() || "—"}
            </dd>
          </div>
        </dl>
        <details
          className="eb-estimate-mobile-supporting-context"
          data-testid="estimate-mobile-supporting-context"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>More details</span>
            <span className="ml-auto truncate text-[12px] font-normal tabular-nums">
              {estimateDate} · {documentStyle === "itemized" ? "Itemized" : "Proposal"}
            </span>
            <ChevronDown
              className="eb-estimate-mobile-supporting-chevron h-4 w-4 shrink-0"
              aria-hidden
            />
          </summary>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 pb-1 pt-2">
            <div className="eb-estimate-context-secondary col-span-2 min-w-0">
              <dt className={metaLabel}>Address</dt>
              <dd className="text-[14px] leading-[1.4] text-muted-foreground">
                {address.trim() || "—"}
              </dd>
            </div>
            <div className="eb-estimate-context-secondary min-w-0">
              <dt className={metaLabel}>Estimate date</dt>
              <dd className="text-[14px] tabular-nums leading-snug text-muted-foreground [font-feature-settings:'tnum']">
                {estimateDate}
              </dd>
            </div>
            <EstimateDocumentStyleReadOnly value={documentStyle} />
          </dl>
        </details>
      </div>
    </>
  );
}

export function EstimateEditCustomerSection({
  meta,
  estimateId,
  today,
  isReadOnly,
  detailsOpen: controlledDetailsOpen,
  onDetailsOpenChange,
  tax,
  discount,
  estimateSubtotal,
  saveEstimateMetaAction,
  onSaveDetails,
}: {
  meta: EstimateEditCustomerMeta;
  estimateId: string;
  today: string;
  isReadOnly: boolean;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
  tax: number;
  discount: number;
  estimateSubtotal: number;
  saveEstimateMetaAction: (formData: FormData) => Promise<void>;
  onSaveDetails?: () => void;
}): React.ReactElement {
  const [uncontrolledDetailsOpen, setUncontrolledDetailsOpen] = React.useState(false);
  const detailsOpen = controlledDetailsOpen ?? uncontrolledDetailsOpen;
  const [formResetKey, setFormResetKey] = React.useState(0);
  const [estimateDate, setEstimateDate] = React.useState(meta.estimateDate ?? today);
  const [validUntil, setValidUntil] = React.useState(meta.validUntil ?? "");
  const [taxDraft, setTaxDraft] = React.useState(tax);
  const [discountDraft, setDiscountDraft] = React.useState(discount);
  const [documentStyleDraft, setDocumentStyleDraft] = React.useState<EstimateDocumentStyle>(
    meta.documentStyle ?? "proposal"
  );
  const formRef = React.useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setTaxDraft(tax);
    setDiscountDraft(discount);
    setDocumentStyleDraft(meta.documentStyle ?? "proposal");
  }, [discount, meta.documentStyle, meta.estimateDate, meta.validUntil, tax, today]);

  const setDetailsOpen = React.useCallback(
    (open: boolean): void => {
      if (controlledDetailsOpen === undefined) setUncontrolledDetailsOpen(open);
      onDetailsOpenChange?.(open);
    },
    [controlledDetailsOpen, onDetailsOpenChange]
  );

  React.useEffect(() => {
    if (isReadOnly && detailsOpen) setDetailsOpen(false);
  }, [detailsOpen, isReadOnly, setDetailsOpen]);

  const displayDate = meta.estimateDate ?? today;

  const discardDetails = (): void => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setTaxDraft(tax);
    setDiscountDraft(discount);
    setDocumentStyleDraft(meta.documentStyle ?? "proposal");
    setFormResetKey((k) => k + 1);
  };

  const handleDetailsOpenChange = (open: boolean): void => {
    if (!open) {
      discardDetails();
    }
    setDetailsOpen(open);
  };

  return (
    <>
      {isReadOnly ? (
        <section
          className={cn(EB.section, "eb-estimate-details-summary-section pb-3")}
          data-testid="estimate-details-summary"
        >
          <div className={metaPanel}>
            <ReadOnlyMetaRows
              customer={meta.client.name}
              project={meta.project.name}
              address={meta.client.address}
              estimateDate={displayDate}
              documentStyle={meta.documentStyle ?? "proposal"}
            />
          </div>
        </section>
      ) : null}

      {!isReadOnly ? (
        <Sheet open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
          <SheetContent side="right" className={ebSheetGlassWide("eb-estimate-details-sheet")}>
            <div className="flex max-h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden">
              <SheetHeader className={EB.sheetHeader}>
                <SheetTitle className={EB.sheetTitle}>
                  <span aria-hidden>Estimate details</span>
                  <span className="sr-only">Customer / project / pricing details</span>
                </SheetTitle>
                <SheetDescription className="eb-estimate-details-subtitle">
                  Customer, project, document context, and commercial terms.
                </SheetDescription>
              </SheetHeader>

              <div className={EB.sheetContent}>
                <form
                  ref={formRef}
                  key={formResetKey}
                  id="estimate-meta-form"
                  data-estimate-details-open={detailsOpen ? "true" : "false"}
                  action={saveEstimateMetaAction}
                  className={cn(EB.sheetContentInner, "eb-estimate-details-form")}
                >
                  <input type="hidden" name="estimateId" value={estimateId} />
                  <input type="hidden" name="notes" value={meta.notes ?? ""} />
                  <section
                    className="eb-estimate-details-group eb-estimate-details-primary"
                    data-testid="estimate-details-primary-relationships"
                    aria-label="Primary relationships"
                  >
                    <div className="eb-estimate-details-group-heading">
                      <p
                        id="estimate-primary-relationships-title"
                        className="eb-estimate-details-group-title"
                      >
                        Customer &amp; project
                      </p>
                      <p className="eb-estimate-details-group-copy">
                        The primary relationships for this estimate.
                      </p>
                    </div>
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
                          Project / reference
                        </Label>
                        <Input
                          id="projectName"
                          name="projectName"
                          defaultValue={meta.project.name}
                          placeholder="Project name"
                          className={metaInput}
                        />
                        <p className="eb-estimate-details-helper text-xs leading-snug">
                          Milestone invoices require this to match one existing HH project or be
                          converted to a project after approval.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section
                    className="eb-estimate-details-group eb-estimate-details-supporting"
                    data-testid="estimate-details-supporting-context"
                    aria-label="Supporting context"
                  >
                    <p id="estimate-supporting-context-title" className={EB.sheetSectionLabel}>
                      Estimate context
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                    <EstimateDocumentStyleField
                      value={documentStyleDraft}
                      onChange={setDocumentStyleDraft}
                    />
                  </section>

                  <section
                    className="eb-estimate-details-group eb-estimate-details-terms"
                    data-testid="estimate-details-terms"
                    aria-label="Commercial terms"
                  >
                    <p id="estimate-terms-title" className={EB.sheetSectionLabel}>
                      Terms &amp; pricing
                    </p>
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
                          className={ebSheetInput(cn("text-sm text-foreground", EB.inputNumeric))}
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
                          className={ebSheetInput(cn("text-sm text-foreground", EB.inputNumeric))}
                        />
                      </div>
                    </div>
                  </section>
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
    </>
  );
}
