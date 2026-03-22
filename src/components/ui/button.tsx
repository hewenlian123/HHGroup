import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium touch-manipulation transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2D2D]/15 dark:focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:opacity-90 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-black text-white hover:bg-black/90",
        primary: "bg-black text-white hover:bg-black/90",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        danger: "text-red-600 border border-red-200 bg-white hover:bg-red-50",
        outline:
          "border border-[#EBEBE9] bg-white text-[#2D2D2D] shadow-sm hover:bg-white hover:shadow-md dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted",
        secondary:
          "border border-[#EBEBE9] bg-white text-[#2D2D2D] shadow-sm hover:bg-[#F7F7F5] hover:shadow-sm dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted",
        ghost:
          "text-gray-500 hover:bg-white hover:text-[#2D2D2D] hover:shadow-sm dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground",
        link: "text-[#2D2D2D] underline-offset-4 hover:underline dark:text-foreground",
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
