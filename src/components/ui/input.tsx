import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // NOTE: Must set text + background tokens so typed text is visible in dark mode.
          "flex h-10 w-full rounded-lg border border-input bg-background text-foreground px-3 py-2 text-sm touch-manipulation transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-[44px] max-lg:text-base lg:min-h-0 lg:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
