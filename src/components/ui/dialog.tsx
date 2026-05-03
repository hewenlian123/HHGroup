"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-md duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid max-h-[90vh] w-full max-w-[480px] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-xl border border-gray-100 bg-white p-6 shadow-sm ease-out dark:border-border dark:bg-card",
        "md:data-[state=open]:animate-hh-dialog-in md:data-[state=closed]:animate-hh-dialog-out",
        "max-md:data-[state=open]:animate-in max-md:data-[state=closed]:animate-out max-md:data-[state=closed]:fade-out-0 max-md:data-[state=open]:fade-in-0 max-md:data-[state=open]:slide-in-from-bottom-4 max-md:data-[state=closed]:slide-out-to-bottom-4 max-md:duration-200",
        "max-md:fixed max-md:inset-0 max-md:left-0 max-md:top-0 max-md:translate-x-0 max-md:translate-y-0 max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:p-4",
        className
      )}
      {...props}
    >
      <DialogPrimitive.Close className="absolute right-4 top-4 flex items-center justify-center rounded-sm opacity-70 transition-all duration-150 ease-out hover:-translate-y-px hover:bg-gray-50 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30 focus-visible:ring-offset-0 active:scale-[0.97] active:duration-100 max-md:active:scale-[0.96] disabled:pointer-events-none max-lg:min-h-[44px] max-lg:min-w-[44px] touch-manipulation dark:hover:bg-muted/40 lg:min-h-0 lg:min-w-0">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/** Top strip for delete / destructive confirmations (360px-wide dialogs). */
export function DialogDestructiveStrip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center border-b border-red-100 bg-red-50 py-3.5 dark:border-red-900/50 dark:bg-red-950/40",
        className
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
    </div>
  );
}

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 mt-2 flex flex-col-reverse gap-2 border-t border-gray-100 bg-white pt-4 dark:border-border lg:flex-row lg:justify-end",
      "max-lg:[&>button]:min-h-11 max-lg:[&>button]:w-full lg:[&>button]:w-auto",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-tight text-text-primary dark:text-foreground",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-xs text-[#9CA3AF] dark:text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
