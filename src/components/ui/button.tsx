import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button variants — only `default`, `secondary`, and `outline`.
 * For toolbar / icon-only or cancel actions: `variant="outline" className="btn-outline-ghost"`.
 * For destructive text actions: `variant="outline" className="btn-outline-destructive"`.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium touch-manipulation transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/25 dark:focus-visible:ring-brand-primary/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:opacity-90 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-black text-white hover:bg-gray-900 dark:bg-black dark:hover:bg-gray-800",
        secondary:
          "border border-transparent bg-brand-primary text-white shadow-none hover:bg-blue-700 dark:bg-brand-primary dark:hover:bg-blue-600",
        outline:
          "border border-gray-300 bg-white text-text-primary shadow-none hover:bg-gray-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted",
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
