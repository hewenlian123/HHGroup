"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<"label">>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        TYPO.label,
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
);
Label.displayName = "Label";

export { Label };
