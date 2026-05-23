import * as React from "react";

import { cn } from "@/lib/utils";
import { NEO } from "@/lib/typography";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm shadow-none transition-colors placeholder:text-[var(--neo-text-tertiary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
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
