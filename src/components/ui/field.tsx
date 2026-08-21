"use client";

import * as React from "react";

import { FieldMessage } from "@/components/ui/feedback";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldProps {
  children: React.ReactElement<Record<string, unknown>>;
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  id?: string;
  label: React.ReactNode;
  required?: boolean;
}

/** Canonical field composition owning label, helper, and error relationships. */
export function Field({
  children,
  className,
  description,
  error,
  id: providedId,
  label,
  required,
}: FieldProps) {
  const generatedId = React.useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id,
    required,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <div className={cn("grid gap-hh-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {control}
      {description ? (
        <FieldMessage id={descriptionId} tone="helper">
          {description}
        </FieldMessage>
      ) : null}
      {error ? (
        <FieldMessage id={errorId} tone="danger" role={error ? "alert" : undefined}>
          {error}
        </FieldMessage>
      ) : null}
    </div>
  );
}
