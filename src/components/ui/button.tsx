import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
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
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium touch-manipulation outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    TYPO.button,
    motionTransition,
    motionInteractiveHover,
    "hover:opacity-90",
    motionClickableActive,
    "focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-0"
  ),
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[#081225] text-white hover:bg-[#0F172A] hover:opacity-100 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:hover:opacity-100",
        secondary:
          "border border-slate-900/[0.08] bg-white text-zinc-900 shadow-none hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted",
        outline:
          "border border-slate-900/[0.08] bg-white text-zinc-900 shadow-none hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted",
        ghost:
          "border-0 !border-transparent bg-transparent text-zinc-900 shadow-none hover:!translate-y-0 hover:bg-slate-100/80 hover:opacity-100 hover:!shadow-none active:!scale-[0.97] active:!duration-100 max-md:active:!scale-[0.96] dark:bg-transparent dark:text-foreground dark:hover:bg-muted/40",
      },
      size: {
        /* Touch-friendly: min 44px on mobile/tablet (max-lg) */
        default: "h-10 px-4 max-lg:min-h-[44px]",
        sm: "h-8 px-3 text-xs max-lg:min-h-[44px]",
        lg: "h-11 px-4.5 max-lg:min-h-[44px]",
        icon: "h-10 w-10 max-lg:min-h-[44px] max-lg:min-w-[44px]",
        touch: "min-h-[44px] min-w-[44px] px-4 text-sm",
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
          "hover:!-translate-y-px hover:!bg-slate-100 dark:hover:!bg-muted/50",
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
