import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { NEO, TYPO } from "@/lib/typography";
import {
  motionClickableActive,
  motionIconButtonActive,
  motionInteractiveHover,
  motionTransition,
} from "@/lib/motion-system";

/**
 * Button variants — only `default`, `secondary`, and `outline`.
 * Icon-only / toolbar: `variant="ghost"` (or legacy `outline` + `btn-outline-ghost`).
 * For destructive text actions: `variant="outline" className="btn-outline-destructive"`.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-hh-2 whitespace-nowrap rounded-hh-standard text-sm font-medium touch-manipulation outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    TYPO.button,
    motionTransition,
    motionInteractiveHover,
    motionClickableActive,
    NEO.focusRing
  ),
  {
    variants: {
      variant: {
        default: cn("border shadow-none", NEO.buttonPrimary),
        secondary: cn("border shadow-none", NEO.buttonSecondary),
        outline: cn("border shadow-none", NEO.buttonSecondary),
        ghost: cn(
          "shadow-none hover:!translate-y-0 hover:!shadow-none active:!scale-[0.97] active:!duration-100 max-md:active:!scale-[0.96]",
          NEO.buttonGhost
        ),
      },
      size: {
        /* Touch-friendly: the shared utility applies the 44px minimum on touch/small screens. */
        default: "hh-touch-min h-hh-control-comfortable px-hh-4",
        sm: "hh-touch-min h-hh-control-compact rounded-hh-compact px-hh-3 text-xs",
        lg: "hh-touch-min h-hh-control-touch px-hh-5",
        icon: "hh-touch-square h-hh-control-comfortable w-hh-10",
        touch: "hh-touch-square min-h-hh-touch min-w-hh-touch px-hh-4 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    compoundVariants: [
      {
        size: "icon",
        class: cn(
          "hover:!-translate-y-px hover:!bg-[var(--neo-surface-hover)]",
          motionIconButtonActive,
          "max-md:active:!scale-[0.95]"
        ),
      },
    ],
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
