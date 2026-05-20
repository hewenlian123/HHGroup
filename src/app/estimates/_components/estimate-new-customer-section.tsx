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
import { EB, ebInput } from "./estimate-builder-ui";
import { cn } from "@/lib/utils";

const metaLabel = "mb-0.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500";
const metaPanel =
  "rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:px-4 sm:py-3";
const metaInput = ebInput("h-9 min-h-9 text-sm md:h-8 md:min-h-8");
const detailsSheetClass =
  "estimate-builder flex w-full max-w-lg flex-col border-l border-white/[0.08] bg-[rgba(14,18,28,0.96)] p-0 text-zinc-100 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),-12px_0_48px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:max-w-[440px] [&>button]:text-zinc-400 [&>button]:hover:bg-white/[0.06] [&>button]:hover:text-zinc-100";

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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-base font-semibold tracking-tight text-zinc-100 sm:text-lg">
              Draft
            </span>
            <span className="text-xs tabular-nums text-zinc-500">{estimateDate}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("shrink-0 md:min-h-8", EB.btnGhost)}
            onClick={openDetails}
          >
            Edit details
          </Button>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className={metaLabel}>Customer</dt>
            <dd className="truncate text-sm font-medium text-zinc-200">
              {clientName.trim() || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={metaLabel}>Project</dt>
            <dd className="truncate text-sm font-medium text-zinc-200">
              {projectName.trim() || "—"}
            </dd>
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
      </div>

      <Sheet open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
        <SheetContent
          side="right"
          className={cn(detailsSheetClass, "flex max-h-[100dvh] flex-col overflow-hidden")}
        >
          <SheetHeader className="border-b border-white/[0.06] px-4 pb-3 pt-4 text-left sm:px-5">
            <SheetTitle className="text-sm font-semibold tracking-tight text-zinc-50">
              Customer / project / pricing details
            </SheetTitle>
            <SheetDescription className="sr-only">
              Enter customer, project, address, and pricing fields for this estimate.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-5">
            <CustomerSelectWithAdd
              label="Link customer"
              value={selectedCustomer?.id ?? null}
              onChange={onCustomerPickerChange}
              triggerClassName={cn(ebInput("h-9 min-h-9 md:h-8 md:min-h-8"), "justify-between")}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="new-clientName" className={metaLabel}>
                  Customer
                </Label>
                <Input
                  id="new-clientName"
                  value={clientName}
                  onChange={(e) => onClientNameChange(e.target.value)}
                  placeholder="Client or company name"
                  className={metaInput}
                  aria-invalid={submitAttempted && !clientName.trim()}
                  required
                />
                {submitAttempted && !clientName.trim() ? (
                  <p className="mt-0.5 text-xs text-rose-500">Client name is required.</p>
                ) : null}
              </div>
              <div className="min-w-0">
                <Label htmlFor="new-projectName" className={metaLabel}>
                  Project
                </Label>
                <Input
                  id="new-projectName"
                  value={projectName}
                  onChange={(e) => onProjectNameChange(e.target.value)}
                  placeholder="Project name"
                  className={metaInput}
                  aria-invalid={submitAttempted && !projectName.trim()}
                  required
                />
                {submitAttempted && !projectName.trim() ? (
                  <p className="mt-0.5 text-xs text-rose-500">Project name is required.</p>
                ) : null}
              </div>
            </div>

            <div className="min-w-0">
              <Label htmlFor="new-address" className={metaLabel}>
                Address
              </Label>
              <Input
                id="new-address"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                placeholder="Site or client address"
                className={metaInput}
              />
            </div>

            <div className="border-t border-white/[0.06] pt-3">
              <p className={cn(metaLabel, "mb-2 !text-zinc-500")}>Terms & pricing</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <Label htmlFor="new-clientPhone" className={metaLabel}>
                    Phone
                  </Label>
                  <Input
                    id="new-clientPhone"
                    type="tel"
                    value={phone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    placeholder="—"
                    className={metaInput}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-clientEmail" className={metaLabel}>
                    Email
                  </Label>
                  <Input
                    id="new-clientEmail"
                    type="email"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    placeholder="—"
                    className={metaInput}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-validUntil" className={metaLabel}>
                    Valid until
                  </Label>
                  <Input
                    id="new-validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(e) => onValidUntilChange(e.target.value)}
                    className={ebInput(cn(EB.dateField, "h-9 min-h-9 md:h-8 md:min-h-8"))}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-salesPerson" className={metaLabel}>
                    Sales
                  </Label>
                  <Input
                    id="new-salesPerson"
                    value={salesPerson}
                    onChange={(e) => onSalesPersonChange(e.target.value)}
                    placeholder="—"
                    className={metaInput}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-builder-tax" className={metaLabel}>
                    Tax
                  </Label>
                  <Input
                    id="new-builder-tax"
                    type="number"
                    step="0.01"
                    value={tax}
                    onChange={(e) => {
                      onTaxTouched();
                      onTaxChange(Number(e.target.value) || 0);
                    }}
                    className={ebInput(cn(metaInput, EB.inputNumeric))}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-builder-discount" className={metaLabel}>
                    Discount
                  </Label>
                  <Input
                    id="new-builder-discount"
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
                    className={ebInput(cn(metaInput, EB.inputNumeric))}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-builder-overhead" className={metaLabel}>
                    Overhead %
                  </Label>
                  <Input
                    id="new-builder-overhead"
                    type="number"
                    step="0.1"
                    value={overheadPct}
                    onChange={(e) => onOverheadPctChange(Number(e.target.value) || 0)}
                    className={ebInput(cn(metaInput, EB.inputNumeric))}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="new-builder-profit" className={metaLabel}>
                    Profit %
                  </Label>
                  <Input
                    id="new-builder-profit"
                    type="number"
                    step="0.1"
                    value={profitPct}
                    onChange={(e) => onProfitPctChange(Number(e.target.value) || 0)}
                    className={ebInput(cn(metaInput, EB.inputNumeric))}
                  />
                </div>
              </div>
            </div>
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
            <Button type="button" size="sm" className={cn(EB.btnPrimary)} onClick={saveDetails}>
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
