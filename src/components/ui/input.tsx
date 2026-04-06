import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-gray-100 bg-white px-3 py-2 text-sm text-text-primary shadow-none touch-manipulation transition-all duration-150 ease-out placeholder:text-text-secondary hover:bg-gray-50/80 focus-visible:border-brand-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-[44px] max-md:text-base md:min-h-9 md:text-sm dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:hover:bg-muted/30",
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
