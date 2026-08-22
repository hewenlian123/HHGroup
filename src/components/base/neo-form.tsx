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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, type NativeSelectProps } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TaskFooter } from "@/components/ui/task-footer";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function NeoFieldLabel({
  children,
  className,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <Label
      className={cn("block uppercase text-[var(--hh-text-tertiary)]", TYPO.label, className)}
      {...props}
    >
      {children}
      {required ? <span className="ml-hh-1 text-[var(--hh-danger)]">*</span> : null}
    </Label>
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
          {title ? <h3 className={TYPO.panelTitle}>{title}</h3> : null}
          {description ? <p className={cn(TYPO.helper, "mt-1")}>{description}</p> : null}
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
    <Input ref={ref} className={cn("h-10 rounded-md max-md:min-h-11", className)} {...props} />
  );
});

export const NeoTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<typeof Textarea>
>(function NeoTextarea({ className, ...props }, ref) {
  return (
    <Textarea
      ref={ref}
      className={cn("min-h-[88px] rounded-md max-md:min-h-[104px]", className)}
      {...props}
    />
  );
});

export const NeoSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(function NeoSelect(
  { className, ...props },
  ref
) {
  return <NativeSelect ref={ref} className={cn("h-10 rounded-md", className)} {...props} />;
});

export function NeoActionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TaskFooter
      variant="sticky"
      className={cn(
        "-mx-5 mt-hh-2 px-5 py-hh-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
        "sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:px-0 sm:pb-hh-4",
        "max-md:[&>button]:min-h-11 max-md:[&>button]:w-full",
        className
      )}
    >
      {children}
    </TaskFooter>
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
        "flex max-w-[520px] flex-col gap-0 overflow-hidden p-0",
        "max-md:max-h-[calc(100dvh-0.75rem)] max-md:rounded-b-none",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <DialogHeader
          className={cn(
            "border-b border-[var(--hh-border)] px-5 py-4 pr-12 text-left",
            headerClassName
          )}
        >
          {title ? <DialogTitle className={TYPO.sectionTitle}>{title}</DialogTitle> : null}
          {description ? (
            <DialogDescription className={TYPO.body}>{description}</DialogDescription>
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
        <DialogFooter className="border-t border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {footer}
        </DialogFooter>
      ) : null}
    </DialogContent>
  );
}

export const neoFormFieldClassName = cn("space-y-1.5");
export const neoFormNoticeClassName = cn(
  "rounded-hh-standard border border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] px-hh-3 py-hh-2 text-[var(--hh-information)]",
  TYPO.helper
);
export const neoFormErrorClassName = cn(
  "rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-hh-3 py-hh-2 text-[var(--hh-danger)]",
  TYPO.error
);
