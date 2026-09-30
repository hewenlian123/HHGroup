"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import {
  addDaysToIsoDate,
  discountAmountFromPercent,
  safeMoneyAmount,
} from "./estimate-details-field-helpers";
import {
  appendCustomEstimateTaxPreset,
  BUILTIN_ESTIMATE_TAX_PRESETS,
  loadCustomEstimateTaxPresets,
  ratePctFromTaxAndSubtotal,
  taxAmountFromSubtotalAndRate,
  type EstimateTaxPreset,
} from "./estimate-tax-presets";

type EstimateTaxPresetMenuProps = {
  estimateSubtotal: number;
  tax: number;
  onApplyTax: (amount: number) => void;
  onTaxTouched: () => void;
  /** When set, presets store a rate instead of a frozen dollar amount. */
  onApplyRate?: (ratePct: number) => void;
};

export function EstimateTaxPresetMenu({
  estimateSubtotal,
  tax,
  onApplyTax,
  onTaxTouched,
  onApplyRate,
}: EstimateTaxPresetMenuProps): React.ReactElement {
  const [customPresets, setCustomPresets] = React.useState<EstimateTaxPreset[]>([]);
  const [presetDialogOpen, setPresetDialogOpen] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");
  const [presetRate, setPresetRate] = React.useState<number | null>(null);

  React.useEffect(() => {
    setCustomPresets(loadCustomEstimateTaxPresets());
  }, []);

  const applyRate = (ratePct: number): void => {
    if (onApplyRate) {
      onApplyRate(ratePct);
      return;
    }
    onTaxTouched();
    onApplyTax(taxAmountFromSubtotalAndRate(estimateSubtotal, ratePct));
  };

  const handleSaveCurrent = (): void => {
    const rate =
      ratePctFromTaxAndSubtotal(estimateSubtotal, tax) ??
      (tax > 0 && estimateSubtotal <= 0 ? tax : null);
    if (rate === null) return;
    setPresetRate(rate);
    setPresetName(`${rate}% tax`);
    window.setTimeout(() => setPresetDialogOpen(true), 0);
  };

  const commitPreset = (): void => {
    const label = presetName.trim();
    if (presetRate === null || !label) return;
    const preset: EstimateTaxPreset = {
      id: `custom-${Date.now()}`,
      label,
      ratePct: presetRate,
    };
    setCustomPresets(appendCustomEstimateTaxPreset(preset));
    setPresetDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={EB.sheetHelperTrigger}
            aria-label="Tax presets"
          >
            Presets
            <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={cn(EB.lineItemMoreMenu, EB.commandMenu)}>
          <p className="max-w-64 px-2 py-2 text-hh-metadata text-[var(--hh-muted)]">
            Applies a fixed tax amount from the current subtotal. Reapply after scope changes.
          </p>
          {BUILTIN_ESTIMATE_TAX_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              className={EB.lineItemMoreMenuItem}
              onSelect={() => applyRate(preset.ratePct)}
            >
              {preset.label}
              {preset.ratePct > 0 ? (
                <span className="hh-fin ml-auto text-[var(--hh-text-tertiary)]">
                  {preset.ratePct}%
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
          {customPresets.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              className={EB.lineItemMoreMenuItem}
              onSelect={() => applyRate(preset.ratePct)}
            >
              {preset.label}
              <span className="hh-fin ml-auto text-[var(--hh-text-tertiary)]">
                {preset.ratePct}%
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-[var(--hh-line)]" />
          <DropdownMenuItem
            className={EB.lineItemMoreMenuItem}
            onSelect={() => {
              onTaxTouched();
            }}
          >
            Custom rate
          </DropdownMenuItem>
          <DropdownMenuItem className={EB.lineItemMoreMenuItem} onSelect={handleSaveCurrent}>
            Save current as preset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="max-w-sm gap-4 rounded-card p-5 shadow-task">
          <DialogHeader className="space-y-1 pb-1">
            <DialogTitle>Save tax preset</DialogTitle>
            <DialogDescription>
              Saves this rate in Presets on this browser. Applying it still uses the current tax
              calculation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 pb-1">
            <Label htmlFor="estimate-tax-preset-name">Preset name</Label>
            <Input
              id="estimate-tax-preset-name"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitPreset();
                }
              }}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 border-t-0 pt-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPresetDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!presetName.trim()} onClick={commitPreset}>
              Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type EstimateDiscountOptionsPopoverProps = {
  discount: number;
  preDiscountTotal: number;
  onDiscountChange: (amount: number) => void;
};

export function EstimateDiscountOptionsPopover({
  discount,
  preDiscountTotal,
  onDiscountChange,
}: EstimateDiscountOptionsPopoverProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [percentDraft, setPercentDraft] = React.useState("");
  const [fixedDraft, setFixedDraft] = React.useState("");

  const applyNoDiscount = (): void => {
    onDiscountChange(0);
    setOpen(false);
  };

  const applyPercent = (): void => {
    const pct = Number(percentDraft);
    if (!Number.isFinite(pct)) return;
    onDiscountChange(discountAmountFromPercent(preDiscountTotal, pct));
    setOpen(false);
  };

  const applyFixed = (): void => {
    const amt = Number(fixedDraft);
    if (!Number.isFinite(amt)) return;
    onDiscountChange(safeMoneyAmount(amt));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={EB.sheetHelperTrigger}
          aria-label="Discount options"
        >
          Discount options
          <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          "eb-details-helper-popover w-[15.5rem] space-y-2 border p-2.5",
          EB.commandMenu
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-hh-control-standard w-full justify-start text-hh-metadata",
            EB.lineItemMoreMenuItem
          )}
          onClick={applyNoDiscount}
        >
          Clear discount
        </Button>
        <div className="space-y-1.5 border-t border-[var(--hh-line)] pt-2">
          <p className="text-hh-status uppercase text-[var(--hh-muted)]">Percentage %</p>
          <p className="text-hh-metadata text-[var(--hh-muted)]">
            Calculated from subtotal plus tax, then saved as a fixed discount. Reapply after pricing
            changes.
          </p>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percentDraft}
              onChange={(e) => setPercentDraft(e.target.value)}
              placeholder="10"
              className={cn(EB.sheetInput, "flex-1", EB.inputNumeric)}
              aria-label="Discount percentage"
            />
            <Button
              type="button"
              size="sm"
              className="h-hh-control-standard shrink-0 px-2.5"
              onClick={applyPercent}
            >
              Apply
            </Button>
          </div>
          {preDiscountTotal <= 0 ? (
            <p className={EB.sheetHelperHint}>Add line items to apply a percentage discount.</p>
          ) : null}
        </div>
        <div className="space-y-1.5 border-t border-[var(--hh-line)] pt-2">
          <p className="text-hh-status uppercase text-[var(--hh-muted)]">Fixed amount $</p>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={fixedDraft}
              onChange={(e) => setFixedDraft(e.target.value)}
              placeholder={discount > 0 ? String(discount) : "0"}
              className={cn(EB.sheetInput, "flex-1", EB.inputNumeric)}
              aria-label="Fixed discount amount"
            />
            <Button
              type="button"
              size="sm"
              className="h-hh-control-standard shrink-0 px-2.5"
              onClick={applyFixed}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type EstimateValidUntilQuickChipsProps = {
  estimateDate: string;
  onValidUntilChange: (isoDate: string) => void;
};

export function EstimateValidUntilQuickChips({
  estimateDate,
  onValidUntilChange,
}: EstimateValidUntilQuickChipsProps): React.ReactElement {
  const chips = [
    { label: "7 days", days: 7 },
    { label: "14 days", days: 14 },
    { label: "30 days", days: 30 },
  ] as const;

  return (
    <div className={EB.sheetHelperChips}>
      {chips.map((chip) => (
        <Button
          key={chip.days}
          type="button"
          variant="ghost"
          size="sm"
          className={EB.sheetHelperChip}
          onClick={() => {
            const next = addDaysToIsoDate(estimateDate, chip.days);
            if (next) onValidUntilChange(next);
          }}
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
