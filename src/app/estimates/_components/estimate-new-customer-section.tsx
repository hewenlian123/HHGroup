"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CustomerSelectWithAdd,
  type CustomerOption,
} from "@/components/customers/customer-select-with-add";
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

type DetailsSnapshot = {
  clientName: string;
  projectName: string;
  address: string;
  phone: string;
  email: string;
  validUntil: string;
  salesPerson: string;
  tax: number;
  discount: number;
  overheadPct: number;
  profitPct: number;
  selectedCustomer: CustomerOption | null;
};

export type EstimateNewCustomerSectionProps = {
  clientName: string;
  projectName: string;
  address: string;
  phone: string;
  email: string;
  estimateDate: string;
  validUntil: string;
  salesPerson: string;
  tax: number;
  discount: number;
  overheadPct: number;
  profitPct: number;
  selectedCustomer: CustomerOption | null;
  /** Subtotal for tax preset rate → dollar amount. */
  estimateSubtotal: number;
  /** Subtotal + overhead + profit + tax (before discount). */
  preDiscountTotal: number;
  submitAttempted: boolean;
  onClientNameChange: (v: string) => void;
  onProjectNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onValidUntilChange: (v: string) => void;
  onSalesPersonChange: (v: string) => void;
  onTaxChange: (v: number) => void;
  onTaxTouched: () => void;
  onDiscountChange: (v: number) => void;
  onOverheadPctChange: (v: number) => void;
  onProfitPctChange: (v: number) => void;
  onCustomerPickerChange: (customerId: string | null, customer?: CustomerOption | null) => void;
};

export function EstimateNewCustomerSection({
  clientName,
  projectName,
  address,
  phone,
  email,
  estimateDate,
  validUntil,
  salesPerson,
  tax,
  discount,
  overheadPct,
  profitPct,
  selectedCustomer,
  estimateSubtotal,
  preDiscountTotal,
  submitAttempted,
  onClientNameChange,
  onProjectNameChange,
  onAddressChange,
  onPhoneChange,
  onEmailChange,
  onValidUntilChange,
  onSalesPersonChange,
  onTaxChange,
  onTaxTouched,
  onDiscountChange,
  onOverheadPctChange,
  onProfitPctChange,
  onCustomerPickerChange,
}: EstimateNewCustomerSectionProps): React.ReactElement {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const snapshotRef = React.useRef<DetailsSnapshot | null>(null);

  const captureSnapshot = React.useCallback(
    (): DetailsSnapshot => ({
      clientName,
      projectName,
      address,
      phone,
      email,
      validUntil,
      salesPerson,
      tax,
      discount,
      overheadPct,
      profitPct,
      selectedCustomer,
    }),
    [
      clientName,
      projectName,
      address,
      phone,
      email,
      validUntil,
      salesPerson,
      tax,
      discount,
      overheadPct,
      profitPct,
      selectedCustomer,
    ]
  );

  const openDetails = (): void => {
    snapshotRef.current = captureSnapshot();
    setDetailsOpen(true);
  };

  const restoreSnapshot = (): void => {
    const s = snapshotRef.current;
    if (!s) return;
    onClientNameChange(s.clientName);
    onProjectNameChange(s.projectName);
    onAddressChange(s.address);
    onPhoneChange(s.phone);
    onEmailChange(s.email);
    onValidUntilChange(s.validUntil);
    onSalesPersonChange(s.salesPerson);
    onTaxChange(s.tax);
    onDiscountChange(s.discount);
    onOverheadPctChange(s.overheadPct);
    onProfitPctChange(s.profitPct);
    onCustomerPickerChange(s.selectedCustomer?.id ?? null, s.selectedCustomer ?? undefined);
    snapshotRef.current = null;
  };

  const saveDetails = (): void => {
    snapshotRef.current = null;
    setDetailsOpen(false);
  };

  const handleDetailsOpenChange = (open: boolean): void => {
    if (!open && snapshotRef.current) {
      restoreSnapshot();
    }
    setDetailsOpen(open);
  };

  React.useEffect(() => {
    if (submitAttempted && (!clientName.trim() || !projectName.trim())) {
      snapshotRef.current = captureSnapshot();
      setDetailsOpen(true);
    }
  }, [submitAttempted, clientName, projectName, captureSnapshot]);

  return (
    <section className={cn(EB.section, "pb-3")}>
      <div className={metaPanel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span
                className={cn(EB.draftBadge, "text-base font-semibold tracking-tight sm:text-lg")}
              >
                <span className={EB.draftBadgePill}>Draft</span>
              </span>
              <span className="text-[13px] tabular-nums leading-snug text-[#929CAF] [font-feature-settings:'tnum']">
                {estimateDate}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("shrink-0 min-h-11 gap-1.5 md:min-h-8", EB.btnText)}
            onClick={openDetails}
          >
            <Pencil className="h-3.5 w-3.5 opacity-80" aria-hidden />
            Edit details
          </Button>
        </div>

        <dl className="mt-3.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className={metaLabel}>Customer</dt>
            <dd
              className={cn(
                "truncate text-[14px] font-medium leading-snug",
                clientName.trim() ? "text-[#F6F7FA]" : EB.readDash
              )}
            >
              {clientName.trim() || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={metaLabel}>Project</dt>
            <dd
              className={cn(
                "truncate text-[14px] font-medium leading-snug",
                projectName.trim() ? "text-[#F6F7FA]" : EB.readDash
              )}
            >
              {projectName.trim() || "—"}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <dt className={metaLabel}>Address</dt>
            <dd
              className={cn(
                "text-[14px] leading-[1.4]",
                address.trim() ? "text-[#D8DEE8]" : EB.readDash
              )}
            >
              {address.trim() || "—"}
            </dd>
          </div>
          <div className="min-w-0 lg:hidden">
            <dt className={metaLabel}>Estimate date</dt>
            <dd className="text-[14px] tabular-nums leading-snug text-[#D8DEE8] [font-feature-settings:'tnum']">
              {estimateDate}
            </dd>
          </div>
        </dl>
      </div>

      <Sheet open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
        <SheetContent side="right" className={ebSheetGlassWide()}>
          <SheetHeader className={EB.sheetHeader}>
            <SheetTitle className={EB.sheetTitle}>Customer / project / pricing details</SheetTitle>
            <SheetDescription className="sr-only">
              Enter customer, project, address, and pricing fields for this estimate.
            </SheetDescription>
          </SheetHeader>

          <div className={EB.sheetContent}>
            <div className={EB.sheetContentInner}>
              <div className={EB.sheetField}>
                <CustomerSelectWithAdd
                  label="Link customer"
                  value={selectedCustomer?.id ?? null}
                  onChange={onCustomerPickerChange}
                  triggerClassName={cn(ebSheetInput("h-10 justify-between text-sm"), "w-full")}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className={cn(EB.sheetField, "min-w-0")}>
                  <Label htmlFor="new-clientName" className={EB.sheetLabel}>
                    Customer
                  </Label>
                  <Input
                    id="new-clientName"
                    value={clientName}
                    onChange={(e) => onClientNameChange(e.target.value)}
                    placeholder="Client or company name"
                    className={ebSheetInput("text-sm")}
                    aria-invalid={submitAttempted && !clientName.trim()}
                    required
                  />
                  {submitAttempted && !clientName.trim() ? (
                    <p className="text-xs text-rose-400">Client name is required.</p>
                  ) : null}
                </div>
                <div className={cn(EB.sheetField, "min-w-0")}>
                  <Label htmlFor="new-projectName" className={EB.sheetLabel}>
                    Project
                  </Label>
                  <Input
                    id="new-projectName"
                    value={projectName}
                    onChange={(e) => onProjectNameChange(e.target.value)}
                    placeholder="Project name"
                    className={ebSheetInput("text-sm")}
                    aria-invalid={submitAttempted && !projectName.trim()}
                    required
                  />
                  {submitAttempted && !projectName.trim() ? (
                    <p className="text-xs text-rose-400">Project name is required.</p>
                  ) : null}
                </div>
              </div>

              <div className={cn(EB.sheetField, "min-w-0")}>
                <Label htmlFor="new-address" className={EB.sheetLabel}>
                  Address
                </Label>
                <Input
                  id="new-address"
                  value={address}
                  onChange={(e) => onAddressChange(e.target.value)}
                  placeholder="Site or client address"
                  className={ebSheetInput("text-sm")}
                />
              </div>

              <div className="border-t border-white/[0.08] pt-4">
                <p className={EB.sheetSectionLabel}>Terms & pricing</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <Label htmlFor="new-clientPhone" className={EB.sheetLabel}>
                      Phone
                    </Label>
                    <Input
                      id="new-clientPhone"
                      type="tel"
                      value={phone}
                      onChange={(e) => onPhoneChange(e.target.value)}
                      placeholder="Optional"
                      className={ebSheetInput("text-sm")}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <Label htmlFor="new-clientEmail" className={EB.sheetLabel}>
                      Email
                    </Label>
                    <Input
                      id="new-clientEmail"
                      type="email"
                      value={email}
                      onChange={(e) => onEmailChange(e.target.value)}
                      placeholder="Optional"
                      className={ebSheetInput("text-sm")}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <Label htmlFor="new-validUntil" className={EB.sheetLabel}>
                      Valid until
                    </Label>
                    <Input
                      id="new-validUntil"
                      type="date"
                      value={validUntil}
                      onChange={(e) => onValidUntilChange(e.target.value)}
                      className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                    />
                    <EstimateValidUntilQuickChips
                      estimateDate={estimateDate}
                      onValidUntilChange={onValidUntilChange}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <Label htmlFor="new-salesPerson" className={EB.sheetLabel}>
                      Sales
                    </Label>
                    <Input
                      id="new-salesPerson"
                      value={salesPerson}
                      onChange={(e) => onSalesPersonChange(e.target.value)}
                      placeholder="Optional"
                      className={ebSheetInput("text-sm")}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <div className={EB.sheetLabelRow}>
                      <Label htmlFor="new-builder-tax" className={EB.sheetLabel}>
                        Tax
                      </Label>
                      <EstimateTaxPresetMenu
                        estimateSubtotal={estimateSubtotal}
                        tax={tax}
                        onApplyTax={onTaxChange}
                        onTaxTouched={onTaxTouched}
                      />
                    </div>
                    <Input
                      id="new-builder-tax"
                      type="number"
                      step="0.01"
                      min={0}
                      value={tax}
                      onChange={(e) => {
                        onTaxTouched();
                        const n = Number(e.target.value);
                        onTaxChange(Number.isFinite(n) ? Math.max(0, n) : 0);
                      }}
                      className={ebSheetInput(cn("text-sm text-[#D8DEE8]", EB.inputNumeric))}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <div className={EB.sheetLabelRow}>
                      <Label htmlFor="new-builder-discount" className={EB.sheetLabel}>
                        Discount
                      </Label>
                      <EstimateDiscountOptionsPopover
                        discount={discount}
                        preDiscountTotal={preDiscountTotal}
                        onDiscountChange={onDiscountChange}
                      />
                    </div>
                    <Input
                      id="new-builder-discount"
                      type="number"
                      step="0.01"
                      min={0}
                      value={discount}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        onDiscountChange(Number.isFinite(n) ? Math.max(0, n) : 0);
                      }}
                      className={ebSheetInput(cn("text-sm text-[#D8DEE8]", EB.inputNumeric))}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <Label htmlFor="new-builder-overhead" className={EB.sheetLabel}>
                      Overhead %
                    </Label>
                    <Input
                      id="new-builder-overhead"
                      type="number"
                      step="0.1"
                      value={overheadPct}
                      onChange={(e) => onOverheadPctChange(Number(e.target.value) || 0)}
                      className={ebSheetInput(cn("text-sm text-[#D8DEE8]", EB.inputNumeric))}
                    />
                  </div>
                  <div className={cn(EB.sheetField, "min-w-0")}>
                    <Label htmlFor="new-builder-profit" className={EB.sheetLabel}>
                      Profit %
                    </Label>
                    <Input
                      id="new-builder-profit"
                      type="number"
                      step="0.1"
                      value={profitPct}
                      onChange={(e) => onProfitPctChange(Number(e.target.value) || 0)}
                      className={ebSheetInput(cn("text-sm text-[#D8DEE8]", EB.inputNumeric))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className={EB.sheetFooter}>
            <div className={EB.sheetFooterActions}>
              <Button type="button" size="sm" className={EB.sheetPrimary} onClick={saveDetails}>
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
        </SheetContent>
      </Sheet>
    </section>
  );
}
