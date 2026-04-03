"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/lib/native-field-classes";

export interface SelectProps extends React.ComponentPropsWithoutRef<"select"> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select ref={ref} className={cn(nativeSelectClassName(), className)} {...props}>
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export { Select };
