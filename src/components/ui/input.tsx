import * as React from "react";

import { cn } from "@/lib/utils";
import { NEO } from "@/lib/typography";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border px-3 py-2 text-sm shadow-none touch-manipulation transition-all duration-150 ease-out placeholder:text-[var(--neo-text-tertiary)] hover:bg-[var(--neo-surface-muted)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-[44px] max-md:text-base md:min-h-9 md:text-sm",
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
