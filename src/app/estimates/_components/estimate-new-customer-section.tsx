"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CustomerSelectWithAdd,
  type CustomerOption,
} from "@/components/customers/customer-select-with-add";
import { EstimateBuilderAdvanced } from "./estimate-builder-advanced";
import { EB, ebInput } from "./estimate-builder-ui";

export type EstimateNewCustomerSectionProps = {
  clientName: string;
  projectName: string;
  address: string;
  phone: string;
  email: string;
  estimateDate: string;
  validUntil: string;
  salesPerson: string;
  notes: string;
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
  onNotesChange: (v: string) => void;
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
  notes,
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
  onNotesChange,
  onTaxChange,
  onTaxTouched,
  onDiscountChange,
  onOverheadPctChange,
  onProfitPctChange,
  onCustomerPickerChange,
}: EstimateNewCustomerSectionProps): React.ReactElement {
  return (
    <section className={EB.section}>
      <div className="mb-4">
        <h2 className={EB.sectionTitle}>Customer & project</h2>
        <p className={EB.sectionSubtitle}>
          {clientName || "Customer"} · {projectName || "Project"}
        </p>
      </div>

      <div className="space-y-4">
        <CustomerSelectWithAdd
          label="Select customer"
          value={selectedCustomer?.id ?? null}
          onChange={onCustomerPickerChange}
        />

        <div className={EB.coreGrid}>
          <div className={EB.fieldStack}>
            <Label htmlFor="clientName" className={EB.label}>
              Customer
            </Label>
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => onClientNameChange(e.target.value)}
              placeholder="Client or company name"
              className={ebInput()}
              aria-invalid={submitAttempted && !clientName.trim()}
              required
            />
            {submitAttempted && !clientName.trim() ? (
              <p className="text-xs text-rose-600">Client name is required.</p>
            ) : null}
          </div>
          <div className={EB.fieldStack}>
            <Label htmlFor="projectName" className={EB.label}>
              Project
            </Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              placeholder="Project name"
              className={ebInput()}
              aria-invalid={submitAttempted && !projectName.trim()}
              required
            />
            {submitAttempted && !projectName.trim() ? (
              <p className="text-xs text-rose-600">Project name is required.</p>
            ) : null}
          </div>
        </div>

        <div className={EB.fieldStack}>
          <Label htmlFor="address" className={EB.label}>
            Address
          </Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="Site or client address"
            className={ebInput()}
          />
        </div>

        <div className={EB.fieldStack}>
          <Label className={EB.label}>Estimate date</Label>
          <p className={EB.readValueMuted}>{estimateDate}</p>
        </div>

        <EstimateBuilderAdvanced title="More details">
          <div className={EB.coreGrid}>
            <div className={EB.fieldStack}>
              <Label htmlFor="clientPhone" className={EB.label}>
                Phone
              </Label>
              <Input
                id="clientPhone"
                type="tel"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="Optional"
                className={ebInput()}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label htmlFor="clientEmail" className={EB.label}>
                Email
              </Label>
              <Input
                id="clientEmail"
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="Optional"
                className={ebInput()}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label className={EB.label}>Valid until</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => onValidUntilChange(e.target.value)}
                className={ebInput()}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label className={EB.label}>Sales</Label>
              <Input
                value={salesPerson}
                onChange={(e) => onSalesPersonChange(e.target.value)}
                placeholder="Optional"
                className={ebInput()}
              />
            </div>
          </div>
          <div className={EB.fieldStack}>
            <Label className={EB.label}>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Optional notes"
              className={ebInput()}
            />
          </div>
          <div className={EB.coreGrid}>
            <div className={EB.fieldStack}>
              <Label htmlFor="builder-tax" className={EB.label}>
                Tax
              </Label>
              <Input
                id="builder-tax"
                type="number"
                step="0.01"
                value={tax}
                onChange={(e) => {
                  onTaxTouched();
                  onTaxChange(Number(e.target.value) || 0);
                }}
                className={ebInput(EB.inputNumeric)}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label htmlFor="builder-discount" className={EB.label}>
                Discount
              </Label>
              <Input
                id="builder-discount"
                type="number"
                step="0.01"
                value={discount}
                onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
                className={ebInput(EB.inputNumeric)}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label htmlFor="builder-overhead" className={EB.label}>
                Overhead %
              </Label>
              <Input
                id="builder-overhead"
                type="number"
                step="0.1"
                value={overheadPct}
                onChange={(e) => onOverheadPctChange(Number(e.target.value) || 0)}
                className={ebInput(EB.inputNumeric)}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label htmlFor="builder-profit" className={EB.label}>
                Profit %
              </Label>
              <Input
                id="builder-profit"
                type="number"
                step="0.1"
                value={profitPct}
                onChange={(e) => onProfitPctChange(Number(e.target.value) || 0)}
                className={ebInput(EB.inputNumeric)}
              />
            </div>
          </div>
        </EstimateBuilderAdvanced>
      </div>
    </section>
  );
}
