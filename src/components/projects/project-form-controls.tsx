"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
    <div className={className ?? "space-y-1"}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {label}
        </label>
        <p className="min-w-0 truncate text-right text-[11px] font-medium tabular-nums text-muted-foreground">
          {estimate || estimateFallback}
        </p>
      </div>
      <div className="group flex h-11 items-center overflow-hidden rounded-[10px] border border-input bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-emerald-500/15 dark:bg-card dark:focus-within:border-emerald-500/50">
        <div className="flex h-full items-center gap-2 border-r border-slate-900/[0.08] bg-muted/30 px-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground dark:border-border">
          <span>USD</span>
          <span className="financial-nums text-sm tracking-normal text-foreground/80">$</span>
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
          className="financial-nums h-full min-w-0 flex-1 bg-transparent px-3 text-right text-[15px] font-semibold tracking-[0.01em] text-foreground outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {label}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
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
          "flex min-h-10 w-full items-center rounded-md border border-gray-100 bg-white px-3 py-2 text-left text-sm text-text-primary shadow-none transition-colors",
          "cursor-pointer hover:border-slate-300 hover:bg-slate-50 focus-visible:border-brand-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary",
          "disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/30",
          error &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive"
        )}
      >
        <span className={cn("min-w-0 truncate", !value && "text-muted-foreground")}>
          {value || "Add project address"}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[520px] gap-4 max-md:flex max-md:flex-col max-md:overflow-hidden">
          <DialogHeader>
            <DialogTitle>Address details</DialogTitle>
            <DialogDescription>
              Save will update the one-line project address summary.
            </DialogDescription>
          </DialogHeader>
          <div className="mobile-native-scroll grid gap-3 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:pb-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`${inputId}-street`}
                className="text-xs font-medium text-muted-foreground"
              >
                Street address
              </label>
              <Input
                id={`${inputId}-street`}
                value={draft.street}
                onChange={(e) => setDraft((prev) => ({ ...prev, street: e.target.value }))}
                autoComplete="street-address"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${inputId}-unit`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Unit / Apt
                </label>
                <Input
                  id={`${inputId}-unit`}
                  value={draft.unit}
                  onChange={(e) => setDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  autoComplete="address-line2"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`${inputId}-city`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  City
                </label>
                <Input
                  id={`${inputId}-city`}
                  value={draft.city}
                  onChange={(e) => setDraft((prev) => ({ ...prev, city: e.target.value }))}
                  autoComplete="address-level2"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${inputId}-state`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  State
                </label>
                <Input
                  id={`${inputId}-state`}
                  value={draft.state}
                  onChange={(e) => setDraft((prev) => ({ ...prev, state: e.target.value }))}
                  autoComplete="address-level1"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`${inputId}-zip`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Zip code
                </label>
                <Input
                  id={`${inputId}-zip`}
                  value={draft.zip}
                  onChange={(e) => setDraft((prev) => ({ ...prev, zip: e.target.value }))}
                  autoComplete="postal-code"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${inputId}-notes`}
                className="text-xs font-medium text-muted-foreground"
              >
                Notes / access info
              </label>
              <Input
                id={`${inputId}-notes`}
                value={draft.notes}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Gate code, parking, or delivery notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" className="min-h-11" onClick={saveAddressDetails}>
              Save address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
