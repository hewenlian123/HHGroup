import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "hh-type-text-entry hh-touch-min hh-focus-ring flex h-hh-control-standard w-full rounded-hh-compact border border-[var(--hh-input)] bg-[var(--hh-input-background)] px-hh-3 py-hh-2 text-[var(--hh-text-primary)] shadow-none touch-manipulation transition-[background-color,border-color,box-shadow,color] duration-150 ease-out placeholder:text-[var(--hh-text-tertiary)] hover:border-[var(--hh-border-emphasis)] focus-visible:border-[var(--hh-ring)] aria-[invalid=true]:border-[var(--hh-danger)] aria-[invalid=true]:focus-visible:border-[var(--hh-danger)] disabled:cursor-not-allowed disabled:bg-[var(--hh-l2-operational-surface)] disabled:opacity-50",
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
