import * as React from "react";

import { cn } from "@/lib/utils";
import { NEO } from "@/lib/typography";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-hh-standard border px-hh-3 py-hh-2 text-sm shadow-none touch-manipulation transition-all duration-150 ease-out placeholder:text-[var(--neo-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-[104px] max-md:text-base md:text-sm",
          NEO.input,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
