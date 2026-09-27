import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    const hasExplicitMinHeight =
      typeof className === "string" &&
      className.split(/\s+/).some((classToken) => /(?:^|:)!?min-h-/.test(classToken));

    return (
      <textarea
        className={cn(
          "hh-type-text-entry hh-focus-ring flex w-full rounded-hh-compact border border-[var(--hh-input)] bg-[var(--hh-input-background)] px-hh-3 py-hh-2 text-[var(--hh-text-primary)] shadow-none touch-manipulation transition-[background-color,border-color,box-shadow,color] duration-150 ease-out placeholder:text-[var(--hh-text-tertiary)] hover:border-[var(--hh-border-emphasis)] focus-visible:border-[var(--hh-ring)] aria-[invalid=true]:border-[var(--hh-danger)] aria-[invalid=true]:focus-visible:border-[var(--hh-danger)] disabled:cursor-not-allowed disabled:bg-[var(--hh-l2-operational-surface)] disabled:opacity-50",
          !hasExplicitMinHeight && "h-hh-control-standard hh-touch-min",
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
