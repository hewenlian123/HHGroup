"use client";

import * as React from "react";

import { FieldMessage } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  description?: React.ReactNode;
  error?: React.ReactNode;
  indeterminate?: boolean;
  label: React.ReactNode;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { className, description, error, id: providedId, indeterminate = false, label, ...props },
    ref
  ) => {
    const generatedId = React.useId();
    const id = providedId ?? generatedId;
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
    React.useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <div className="grid gap-hh-1">
        <label
          htmlFor={id}
          className={cn(
            "flex min-h-hh-touch cursor-pointer items-center gap-hh-3 rounded-hh-compact",
            props.disabled && "cursor-not-allowed opacity-50",
            className
          )}
        >
          <input
            {...props}
            ref={inputRef}
            id={id}
            type="checkbox"
            aria-checked={indeterminate ? "mixed" : undefined}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className="hh-focus-ring size-4 shrink-0 rounded-hh-compact border border-[var(--hh-border-strong)] accent-[var(--hh-action-primary)]"
          />
          <span className={TYPO.body}>{label}</span>
        </label>
        {description ? (
          <FieldMessage id={descriptionId} tone="helper" className="pl-7">
            {description}
          </FieldMessage>
        ) : null}
        {error ? (
          <FieldMessage id={errorId} tone="danger" className="pl-7">
            {error}
          </FieldMessage>
        ) : null}
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
