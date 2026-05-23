"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoModal,
  neoFormFieldClassName,
} from "@/components/base";
import { cn } from "@/lib/utils";

export type AddressDetails = {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
};

const EMPTY_ADDRESS_DETAILS: AddressDetails = {
  street: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
};

export function composeAddressSummary(details: AddressDetails) {
  const cityStateZip = [
    details.city.trim(),
    [details.state.trim(), details.zip.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const addressParts = [details.street.trim(), details.unit.trim(), cityStateZip].filter(Boolean);
  const summary = addressParts.join(", ");
  const notes = details.notes.trim();
  return notes ? [summary, `Access: ${notes}`].filter(Boolean).join(" - ") : summary;
}

export function parseAddressSummary(summary: string): AddressDetails {
  const [addressPart = "", notesPart = ""] = summary.split(/\s+-\s+Access:\s*/);
  const parts = addressPart
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const [street = "", unit = "", city = "", stateZip = ""] = parts;
  const stateZipParts = stateZip.split(/\s+/).filter(Boolean);
  return {
    street,
    unit: parts.length > 3 ? unit : "",
    city: parts.length > 3 ? city : unit,
    state: stateZipParts[0] ?? "",
    zip: stateZipParts.slice(1).join(" "),
    notes: notesPart.trim(),
  };
}

export function budgetDigits(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function formatBudgetDisplay(value: string) {
  const digits = budgetDigits(value);
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatBudgetEstimate(value: string) {
  const formatted = formatBudgetDisplay(value);
  return formatted ? `Estimated $${formatted}` : "";
}

type ProjectBudgetInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  inputId?: string;
  name?: string;
  label?: string;
  estimateFallback?: string;
  className?: string;
};

export function ProjectBudgetInput({
  value,
  onValueChange,
  disabled,
  error,
  inputId = "project-budget",
  name = "budget",
  label = "Budget (USD)",
  estimateFallback = "Estimated project budget",
  className,
}: ProjectBudgetInputProps) {
  const estimate = React.useMemo(() => formatBudgetEstimate(value), [value]);

  return (
    <div className={className ?? neoFormFieldClassName}>
      <div className="flex items-center justify-between gap-2">
        <NeoFieldLabel htmlFor={inputId}>{label}</NeoFieldLabel>
        <p className="min-w-0 truncate text-right text-[11px] font-medium tabular-nums text-[var(--neo-text-secondary)]">
          {estimate || estimateFallback}
        </p>
      </div>
      <div className="group flex h-11 items-center overflow-hidden rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] shadow-none transition-all duration-150 ease-out focus-within:border-[var(--neo-gold)] focus-within:ring-2 focus-within:ring-[var(--neo-gold-ring)]">
        <div className="flex h-full items-center gap-2 border-r border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 text-xs font-semibold tracking-normal text-[var(--neo-text-secondary)]">
          <span>USD</span>
          <span className="financial-nums text-sm tracking-normal text-[var(--neo-text-primary)]">
            $
          </span>
        </div>
        <input
          id={inputId}
          name={name}
          aria-label="Budget"
          inputMode="numeric"
          pattern="[0-9,]*"
          autoComplete="off"
          placeholder="25,000"
          value={formatBudgetDisplay(value)}
          onChange={(e) => onValueChange(budgetDigits(e.target.value))}
          disabled={disabled}
          aria-invalid={error}
          className="financial-nums h-full min-w-0 flex-1 bg-transparent px-3 text-right text-[15px] font-semibold tracking-normal text-[var(--neo-text-primary)] outline-none placeholder:text-[var(--neo-text-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
}

type ProjectAddressFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  inputId?: string;
  name?: string;
  label?: string;
  required?: boolean;
};

export function ProjectAddressField({
  value,
  onChange,
  disabled,
  error,
  inputId = "project-address",
  name = "address",
  label = "Address summary",
  required,
}: ProjectAddressFieldProps) {
  const [details, setDetails] = React.useState<AddressDetails>(EMPTY_ADDRESS_DETAILS);
  const [draft, setDraft] = React.useState<AddressDetails>(EMPTY_ADDRESS_DETAILS);
  const [open, setOpen] = React.useState(false);

  const openAddressEditor = React.useCallback(() => {
    const hasDetails = Object.values(details).some((detailValue) => detailValue.trim());
    const detailsStillMatchSummary = composeAddressSummary(details) === value;
    setDraft(hasDetails && detailsStillMatchSummary ? details : parseAddressSummary(value));
    setOpen(true);
  }, [details, value]);

  const saveAddressDetails = React.useCallback(() => {
    const nextAddress = composeAddressSummary(draft);
    setDetails(draft);
    onChange(nextAddress);
    setOpen(false);
  }, [draft, onChange]);

  return (
    <div className={neoFormFieldClassName}>
      <div className="flex items-center justify-between gap-2">
        <NeoFieldLabel htmlFor={inputId}>{label}</NeoFieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-[var(--neo-gold)] hover:text-[var(--neo-gold-soft)]"
          onClick={openAddressEditor}
          disabled={disabled}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit details
        </Button>
      </div>
      <input type="hidden" name={name} value={value} required={required} />
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        data-invalid={error ? "true" : undefined}
        aria-label={value ? `Project address: ${value}` : "Add project address"}
        onClick={openAddressEditor}
        className={cn(
          "flex min-h-10 w-full items-center rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-2 text-left text-sm text-[var(--neo-text-primary)] shadow-none transition-all duration-150 ease-out",
          "cursor-pointer hover:bg-[var(--neo-surface-muted)] focus-visible:border-[var(--neo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11",
          error && "border-rose-500/45 focus-visible:border-rose-400 focus-visible:ring-rose-500/20"
        )}
      >
        <span className={cn("min-w-0 truncate", !value && "text-[var(--neo-text-tertiary)]")}>
          {value || "Add project address"}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <NeoModal
          title="Address details"
          description="Save will update the one-line project address summary."
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-md"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" className="min-h-11 rounded-md" onClick={saveAddressDetails}>
                Save address
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor={`${inputId}-street`}>Street address</NeoFieldLabel>
              <NeoInput
                id={`${inputId}-street`}
                value={draft.street}
                onChange={(e) => setDraft((prev) => ({ ...prev, street: e.target.value }))}
                autoComplete="street-address"
              />
            </div>
            <NeoFormGrid>
              <div className={neoFormFieldClassName}>
                <NeoFieldLabel htmlFor={`${inputId}-unit`}>Unit / Apt</NeoFieldLabel>
                <NeoInput
                  id={`${inputId}-unit`}
                  value={draft.unit}
                  onChange={(e) => setDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  autoComplete="address-line2"
                />
              </div>
              <div className={neoFormFieldClassName}>
                <NeoFieldLabel htmlFor={`${inputId}-city`}>City</NeoFieldLabel>
                <NeoInput
                  id={`${inputId}-city`}
                  value={draft.city}
                  onChange={(e) => setDraft((prev) => ({ ...prev, city: e.target.value }))}
                  autoComplete="address-level2"
                />
              </div>
            </NeoFormGrid>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
              <div className={neoFormFieldClassName}>
                <NeoFieldLabel htmlFor={`${inputId}-state`}>State</NeoFieldLabel>
                <NeoInput
                  id={`${inputId}-state`}
                  value={draft.state}
                  onChange={(e) => setDraft((prev) => ({ ...prev, state: e.target.value }))}
                  autoComplete="address-level1"
                />
              </div>
              <div className={neoFormFieldClassName}>
                <NeoFieldLabel htmlFor={`${inputId}-zip`}>Zip code</NeoFieldLabel>
                <NeoInput
                  id={`${inputId}-zip`}
                  value={draft.zip}
                  onChange={(e) => setDraft((prev) => ({ ...prev, zip: e.target.value }))}
                  autoComplete="postal-code"
                />
              </div>
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor={`${inputId}-notes`}>Notes / access info</NeoFieldLabel>
              <NeoInput
                id={`${inputId}-notes`}
                value={draft.notes}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Gate code, parking, or delivery notes"
              />
            </div>
          </div>
        </NeoModal>
      </Dialog>
    </div>
  );
}
