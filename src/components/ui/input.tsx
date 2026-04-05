import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border-[0.5px] border-gray-300 bg-card px-3 py-2 text-sm text-text-primary shadow-none touch-manipulation transition-all duration-150 placeholder:text-text-secondary focus-visible:outline-none focus-visible:border-text-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-[44px] max-lg:text-base lg:min-h-0 lg:text-sm dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:focus-visible:ring-ring/30",
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
