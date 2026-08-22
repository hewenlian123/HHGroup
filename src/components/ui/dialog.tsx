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
import { TaskFooter } from "@/components/ui/task-footer";

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

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeDisabled?: boolean;
  hideCloseButton?: boolean;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeDisabled = false, hideCloseButton = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[480px] translate-x-[-50%] translate-y-[-50%] gap-hh-section overflow-y-auto overscroll-y-contain rounded-hh-task p-hh-task-mobile outline-none ease-out [-webkit-overflow-scrolling:touch] md:p-hh-task-desktop",
        TYPO.body,
        className,
        "border border-[var(--hh-border-strong)] bg-[var(--hh-l5-task-surface)] text-[var(--hh-text-primary)] shadow-task",
        "max-md:fixed max-md:inset-x-2 max-md:bottom-0 max-md:left-2 max-md:right-2 max-md:top-auto max-md:max-h-[calc(100dvh-0.75rem)] max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-hh-task max-md:border-b-0",
        hhNeoFocusRevealDialog,
        hhNeoFocusRevealMobileSheet
      )}
      {...props}
    >
      {!hideCloseButton ? (
        <DialogPrimitive.Close
          disabled={closeDisabled}
          className="hh-focus-ring hh-touch-square absolute right-hh-4 top-hh-4 flex items-center justify-center rounded-hh-compact opacity-70 transition-colors duration-150 ease-out hover:bg-[var(--hh-l3-hover)] hover:opacity-100 active:bg-[var(--hh-l3-pressed)] disabled:pointer-events-none disabled:opacity-40 touch-manipulation"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
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
        "flex items-center justify-center border-b border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] py-hh-3",
        className
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--hh-danger)]" aria-hidden />
    </div>
  );
}

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <TaskFooter variant="dialog" className={className} {...props} />
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
    className={cn(TYPO.helper, "text-[var(--hh-text-tertiary)]", className)}
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
