"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/lib/native-field-classes";

export interface NativeSelectProps extends React.ComponentPropsWithoutRef<"select"> {}

/** Native `<select>` for filter bars and legacy forms. Prefer Radix `Select` from `@/components/ui/select` for new UI. */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select ref={ref} className={cn(nativeSelectClassName(), className)} {...props}>
        {children}
      </select>
    );
  }
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect, NativeSelect as Select };
