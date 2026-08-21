"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import {
  hhNeoFocusRevealDialog,
  hhNeoFocusRevealMobileSheet,
  hhNeoFocusRevealOverlay,
} from "@/lib/motion-system";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

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
    className={cn("fixed inset-0 z-50", hhNeoFocusRevealOverlay, className)}
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
        "fixed left-[50%] top-[50%] z-50 grid max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[480px] translate-x-[-50%] translate-y-[-50%] gap-hh-section overflow-y-auto overscroll-y-contain rounded-hh-task p-hh-task-mobile outline-none ease-out [-webkit-overflow-scrolling:touch] md:p-hh-task-desktop",
        TYPO.body,
        className,
        "border border-[var(--hh-border-strong)] bg-[var(--hh-l5-task-surface)] text-[var(--neo-text-primary)] shadow-task",
        "max-md:fixed max-md:inset-x-2 max-md:bottom-0 max-md:left-2 max-md:right-2 max-md:top-auto max-md:max-h-[calc(100dvh-0.75rem)] max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-hh-task max-md:border-b-0",
        hhNeoFocusRevealDialog,
        hhNeoFocusRevealMobileSheet
      )}
      {...props}
    >
      <DialogPrimitive.Close className="hh-touch-square absolute right-hh-4 top-hh-4 flex items-center justify-center rounded-hh-compact opacity-70 transition-all duration-150 ease-out hover:-translate-y-px hover:bg-[var(--hh-l3-hover)] hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] focus-visible:ring-offset-0 active:scale-[0.97] active:bg-[var(--hh-l3-pressed)] active:duration-100 max-md:active:scale-[0.96] disabled:pointer-events-none touch-manipulation">
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
      "sticky bottom-0 mt-2 flex flex-col-reverse gap-2 border-t border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] pt-4 pb-[env(safe-area-inset-bottom)] lg:flex-row lg:justify-end",
      "hh-touch-footer lg:[&>button]:w-auto",
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
  <DialogPrimitive.Title ref={ref} className={cn(TYPO.sectionTitle, className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(TYPO.helper, "text-[var(--neo-text-tertiary)]", className)}
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
