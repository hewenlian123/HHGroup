"use client";

import * as React from "react";
import {
  Select,
  SelectContent as Content,
  SelectItem as Item,
  SelectTrigger as Trigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import "./filter-select.css";

export { Select, SelectValue };
export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof Trigger>,
  React.ComponentPropsWithoutRef<typeof Trigger>
>(({ className, ...props }, ref) => (
  <Trigger ref={ref} {...props} className={cn(className, "hh-filter-select-trigger")} />
));
SelectTrigger.displayName = "FilterSelectTrigger";
export const SelectContent = React.forwardRef<
  React.ElementRef<typeof Content>,
  React.ComponentPropsWithoutRef<typeof Content>
>(({ className, ...props }, ref) => (
  <Content
    ref={ref}
    position="popper"
    sideOffset={4}
    {...props}
    className={cn("expenses-ui-dialog hh-filter-select-content", className)}
  />
));
SelectContent.displayName = "FilterSelectContent";
export const SelectItem = React.forwardRef<
  React.ElementRef<typeof Item>,
  React.ComponentPropsWithoutRef<typeof Item>
>(({ className, ...props }, ref) => (
  <Item ref={ref} {...props} className={cn(className, "hh-filter-select-item")} />
));
SelectItem.displayName = "FilterSelectItem";

const ALL = "__hh_filter_empty__";
export function FilterSelect({
  value,
  onValueChange,
  options,
  label,
  className,
  triggerRef,
  onCloseAutoFocus,
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  label: string;
  className?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
  onCloseAutoFocus?: React.ComponentPropsWithoutRef<typeof Content>["onCloseAutoFocus"];
}) {
  return (
    <Select
      open={open}
      onOpenChange={onOpenChange}
      value={value || ALL}
      onValueChange={(next) => onValueChange(next === ALL ? "" : next)}
    >
      <SelectTrigger ref={triggerRef} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent onCloseAutoFocus={onCloseAutoFocus}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value || ALL} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
