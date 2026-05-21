"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
};

export function EstimateTaxPresetMenu({
  estimateSubtotal,
  tax,
  onApplyTax,
  onTaxTouched,
}: EstimateTaxPresetMenuProps): React.ReactElement {
  const [customPresets, setCustomPresets] = React.useState<EstimateTaxPreset[]>([]);

  React.useEffect(() => {
    setCustomPresets(loadCustomEstimateTaxPresets());
  }, []);

  const applyRate = (ratePct: number): void => {
    onTaxTouched();
    onApplyTax(taxAmountFromSubtotalAndRate(estimateSubtotal, ratePct));
  };

  const handleSaveCurrent = (): void => {
    const rate =
      ratePctFromTaxAndSubtotal(estimateSubtotal, tax) ??
      (tax > 0 && estimateSubtotal <= 0 ? tax : null);
    if (rate === null) return;
    const label = window.prompt("Preset name", `${rate}% tax`);
    if (!label?.trim()) return;
    const preset: EstimateTaxPreset = {
      id: `custom-${Date.now()}`,
      label: label.trim(),
      ratePct: rate,
    };
    setCustomPresets(appendCustomEstimateTaxPreset(preset));
  };

  return (
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
        {BUILTIN_ESTIMATE_TAX_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            className={EB.lineItemMoreMenuItem}
            onSelect={() => applyRate(preset.ratePct)}
          >
            {preset.label}
            {preset.ratePct > 0 ? (
              <span className="ml-auto tabular-nums text-[#929CAF]">{preset.ratePct}%</span>
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
            <span className="ml-auto tabular-nums text-[#929CAF]">{preset.ratePct}%</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/[0.08]" />
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
          className={cn("h-8 w-full justify-start text-[12px]", EB.lineItemMoreMenuItem)}
          onClick={applyNoDiscount}
        >
          No discount
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 w-full justify-start text-[12px]", EB.lineItemMoreMenuItem)}
          onClick={applyNoDiscount}
        >
          Clear discount
        </Button>
        <div className="border-t border-white/[0.08] pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#929CAF]">
            Percentage %
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
              className={cn(EB.sheetInput, "h-8 min-h-8 flex-1 text-xs", EB.inputNumeric)}
              aria-label="Discount percentage"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-2.5 text-xs"
              onClick={applyPercent}
            >
              Apply
            </Button>
          </div>
          {preDiscountTotal <= 0 ? (
            <p className={EB.sheetHelperHint}>Add line items to apply a percentage discount.</p>
          ) : null}
        </div>
        <div className="border-t border-white/[0.08] pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#929CAF]">
            Fixed amount $
          </p>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={fixedDraft}
              onChange={(e) => setFixedDraft(e.target.value)}
              placeholder={discount > 0 ? String(discount) : "0"}
              className={cn(EB.sheetInput, "h-8 min-h-8 flex-1 text-xs", EB.inputNumeric)}
              aria-label="Fixed discount amount"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-2.5 text-xs"
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
