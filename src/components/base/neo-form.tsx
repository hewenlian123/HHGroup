"use client";

import * as React from "react";
import type { ReactNode } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FinanceDatePicker, type FinanceDatePickerProps } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { NativeSelect, type NativeSelectProps } from "@/components/ui/native-select";
import { SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { NEO, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function NeoFieldLabel({
  children,
  className,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn(
        "block text-[11px] font-medium uppercase leading-none tracking-normal text-[var(--neo-text-tertiary)]",
        className
      )}
      {...props}
    >
      {children}
      {required ? <span className="ml-1 text-[var(--neo-gold)]">*</span> : null}
    </label>
  );
}

export function NeoFormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2", className)}>{children}</div>;
}

export function NeoFormSection({
  children,
  className,
  bodyClassName,
  title,
  description,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  title?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 space-y-3", className)}>
      {(title || description) && (
        <div className="min-w-0">
          {title ? (
            <h3 className="text-[12px] font-semibold uppercase tracking-normal text-[var(--neo-text-primary)]">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className={cn(TYPO.mutedText, "mt-1 text-[12px] leading-snug")}>{description}</p>
          ) : null}
        </div>
      )}
      <div className={cn("grid gap-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export const NeoInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof Input>
>(function NeoInput({ className, ...props }, ref) {
  return (
    <Input
      ref={ref}
      className={cn("h-10 rounded-md text-[14px] max-md:min-h-11", className)}
      {...props}
    />
  );
});

export const NeoTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<typeof Textarea>
>(function NeoTextarea({ className, ...props }, ref) {
  return (
    <Textarea
      ref={ref}
      className={cn("min-h-[88px] rounded-md text-[14px] max-md:min-h-[104px]", className)}
      {...props}
    />
  );
});

export const NeoSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(function NeoSelect(
  { className, ...props },
  ref
) {
  return (
    <NativeSelect ref={ref} className={cn("h-10 rounded-md text-[14px]", className)} {...props} />
  );
});

export function NeoDatePicker({ className, size = "md", ...props }: FinanceDatePickerProps) {
  return <FinanceDatePicker size={size} className={className} {...props} />;
}

export function NeoActionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-5 mt-2 flex flex-col-reverse gap-2 border-t border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
        "sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:px-0 sm:pb-4",
        "max-md:[&>button]:min-h-11 max-md:[&>button]:w-full",
        className
      )}
    >
      {children}
    </div>
  );
}

export function NeoModal({
  children,
  className,
  bodyClassName,
  headerClassName,
  footer,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogContent> & {
  bodyClassName?: string;
  headerClassName?: string;
  footer?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <DialogContent
      className={cn(
        "dark flex max-w-[520px] flex-col gap-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[var(--neo-surface-raised)] p-0 text-[var(--neo-text-primary)] shadow-[0_30px_90px_rgb(0_0_0_/_0.46),inset_0_1px_0_rgb(255_255_255_/_0.05)]",
        "max-md:max-h-[calc(100dvh-0.75rem)] max-md:rounded-b-none max-md:rounded-t-[1.5rem]",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <DialogHeader
          className={cn(
            "border-b border-[var(--neo-border)] px-5 py-4 pr-12 text-left",
            headerClassName
          )}
        >
          {title ? (
            <DialogTitle className="text-base font-semibold tracking-normal text-[var(--neo-text-primary)]">
              {title}
            </DialogTitle>
          ) : null}
          {description ? (
            <DialogDescription className="text-[13px] leading-snug text-[var(--neo-text-secondary)]">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
      )}
      <div
        className={cn(
          "mobile-native-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4",
          bodyClassName
        )}
      >
        {children}
      </div>
      {footer ? (
        <DialogFooter className="border-t border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {footer}
        </DialogFooter>
      ) : null}
    </DialogContent>
  );
}

export function NeoDrawer({
  children,
  className,
  bodyClassName,
  footer,
  title,
  description,
  side = "right",
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetContent> & {
  bodyClassName?: string;
  footer?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <SheetContent
      side={side}
      className={cn(
        "dark flex h-full w-full flex-col gap-0 border-white/10 bg-[var(--neo-surface-raised)] p-0 text-[var(--neo-text-primary)] shadow-[0_30px_90px_rgb(0_0_0_/_0.46),inset_0_1px_0_rgb(255_255_255_/_0.05)] sm:max-w-md",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <SheetHeader className="border-b border-[var(--neo-border)] px-5 py-4 pr-12 text-left">
          {title ? (
            <SheetTitle className="text-base font-semibold tracking-normal text-[var(--neo-text-primary)]">
              {title}
            </SheetTitle>
          ) : null}
          {description ? (
            <SheetDescription className="text-[13px] leading-snug text-[var(--neo-text-secondary)]">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
      )}
      <div
        className={cn(
          "mobile-native-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
          bodyClassName
        )}
      >
        {children}
      </div>
      {footer ? <NeoActionFooter className="mx-0 px-5 sm:px-5">{footer}</NeoActionFooter> : null}
    </SheetContent>
  );
}

export const neoFormFieldClassName = cn("space-y-1.5");
export const neoFormNoticeClassName = cn(
  "rounded-lg border border-[rgb(184_147_90_/_0.24)] bg-[rgb(184_147_90_/_0.10)] px-3 py-2 text-[12px] leading-snug text-[var(--neo-text-primary)]"
);
export const neoFormErrorClassName = cn(
  "rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[12px] font-medium text-rose-200"
);
export const neoFormPanelClassName = cn(NEO.surface, "p-5");
