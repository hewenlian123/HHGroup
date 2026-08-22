import * as React from "react";

import { cn } from "@/lib/utils";
import { NEO } from "@/lib/typography";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "hh-type-text-entry hh-touch-min flex h-hh-control-standard w-full rounded-hh-standard border px-hh-3 py-hh-2 shadow-none touch-manipulation transition-[background-color,border-color,box-shadow,color] duration-150 ease-out placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          NEO.input,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
