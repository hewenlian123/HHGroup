"use client";

import { FinanceDatePicker, type FinanceDatePickerProps } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

type ExpenseDatePickerProps = Omit<FinanceDatePickerProps, "appearance" | "displayFormat" | "size">;

export function ExpenseDatePicker({ className, ...props }: ExpenseDatePickerProps) {
  return (
    <FinanceDatePicker
      {...props}
      size="md"
      displayFormat="MM/dd/yyyy"
      className={cn("min-w-0", className)}
    />
  );
}
