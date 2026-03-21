import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#EBEBE9] bg-white px-3 py-2 text-sm text-[#2D2D2D] shadow-sm touch-manipulation transition-all duration-150 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2D2D]/10 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-[44px] max-lg:text-base lg:min-h-0 lg:text-sm dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:focus-visible:ring-ring/30",
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
