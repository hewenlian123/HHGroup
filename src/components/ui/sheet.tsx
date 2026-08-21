"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { hhNeoFocusRevealOverlay } from "@/lib/motion-system";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn("fixed inset-0 z-50", hhNeoFocusRevealOverlay, className)}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  cn(
    "fixed z-50 gap-hh-section overflow-y-auto overscroll-y-contain border-[var(--hh-border-strong)] bg-[var(--hh-l5-task-surface)] p-hh-task-mobile text-[var(--neo-text-primary)] shadow-task outline-none [-webkit-overflow-scrolling:touch] motion-reduce:data-[state=open]:animate-hh-modal-fade-in motion-reduce:data-[state=closed]:animate-hh-modal-fade-out max-md:max-h-[100dvh] max-md:w-full max-md:max-w-none md:p-hh-task-desktop",
    TYPO.body
  ),
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 rounded-b-hh-task border-b data-[state=open]:animate-hh-sheet-top-in data-[state=closed]:animate-hh-sheet-top-out",
        bottom:
          "inset-x-2 bottom-0 rounded-b-none rounded-t-hh-task border-t data-[state=open]:animate-hh-sheet-in data-[state=closed]:animate-hh-sheet-out md:inset-x-0",
        left: "inset-y-0 left-0 h-full w-full rounded-r-hh-task border-r data-[state=open]:animate-hh-sheet-left-in data-[state=closed]:animate-hh-sheet-left-out md:w-3/4 md:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-full rounded-l-hh-task border-l data-[state=open]:animate-hh-sheet-right-in data-[state=closed]:animate-hh-sheet-right-out md:w-3/4 md:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        sheetVariants({ side }),
        side === "bottom" &&
          "pb-[max(1rem,env(safe-area-inset-bottom))] [&>button]:top-[calc(0.25rem+env(safe-area-inset-top_0px))]",
        className
      )}
      {...props}
    >
      <SheetPrimitive.Close className="hh-touch-square absolute right-hh-4 top-hh-4 flex items-center justify-center rounded-hh-compact opacity-70 transition-all duration-150 ease-out hover:-translate-y-px hover:bg-[var(--hh-l3-hover)] hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] focus-visible:ring-offset-0 active:scale-[0.97] active:bg-[var(--hh-l3-pressed)] active:duration-100 max-md:active:scale-[0.96] disabled:pointer-events-none touch-manipulation data-[state=open]:bg-[var(--hh-l3-selected)]">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
      {children}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 pb-[env(safe-area-inset-bottom)] sm:flex-row sm:justify-end sm:space-x-2 sm:pb-0",
      "hh-touch-footer",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn(TYPO.sectionTitle, className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn(TYPO.body, "text-[var(--neo-text-secondary)]", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
