import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { NEO, TYPO } from "@/lib/typography";
import {
  motionClickableActive,
  motionInteractiveHover,
  motionTransition,
} from "@/lib/motion-system";

const primaryActionClass =
  "border-[var(--hh-action-primary)] bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] hover:border-[var(--hh-action-primary-hover)] hover:bg-[var(--hh-action-primary-hover)] active:border-[var(--hh-action-primary-hover)] active:bg-[var(--hh-action-primary-hover)]";

/**
 * Canonical operational action primitive. Workflow components compose this
 * primitive rather than owning a separate visual button system.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-hh-2 whitespace-nowrap rounded-hh-standard touch-manipulation outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    TYPO.button,
    motionTransition,
    motionInteractiveHover,
    motionClickableActive,
    NEO.focusRing
  ),
  {
    variants: {
      variant: {
        default: cn("border shadow-none", primaryActionClass),
        primary: cn("border shadow-none", primaryActionClass),
        secondary: cn("border shadow-none", NEO.buttonSecondary),
        outline: cn("border shadow-none", NEO.buttonSecondary),
        quiet: cn("shadow-none", NEO.buttonGhost),
        ghost: cn("shadow-none", NEO.buttonGhost),
        destructive:
          "border border-transparent bg-[var(--hh-danger)] text-white shadow-none hover:opacity-90 active:bg-[var(--hh-danger)]",
      },
      size: {
        /* Touch-friendly: the shared utility applies the 44px minimum on touch/small screens. */
        default: "hh-touch-min h-hh-control-standard px-hh-4",
        sm: "hh-touch-min h-hh-control-standard rounded-hh-compact px-hh-3",
        lg: "hh-touch-min h-hh-control-touch px-hh-5",
        icon: "hh-touch-square h-hh-control-standard w-9",
        touch: "hh-touch-square min-h-hh-touch min-w-hh-touch px-hh-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
