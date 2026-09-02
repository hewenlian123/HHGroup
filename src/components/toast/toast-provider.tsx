"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { publishToast, subscribeToToasts, type ToastInput, type ToastVariant } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export type { ToastInput, ToastVariant } from "@/lib/toast";

type ToastRecord = ToastInput & {
  exiting?: boolean;
  id: string;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

function normalizedVariant(variant: ToastVariant | undefined) {
  if (variant === "error") return "danger";
  if (variant === "system" || variant === "default" || !variant) return "information";
  return variant;
}

const variantPresentation = {
  success: {
    className:
      "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]",
    Icon: CheckCircle2,
    label: "Success",
  },
  warning: {
    className:
      "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]",
    Icon: AlertTriangle,
    label: "Warning",
  },
  information: {
    className:
      "border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] text-[var(--hh-information)]",
    Icon: Info,
    label: "Information",
  },
  danger: {
    className:
      "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]",
    Icon: XCircle,
    label: "Error",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const timeoutsRef = React.useRef<Set<number>>(new Set());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const enqueue = React.useCallback(
    (input: ToastInput) => {
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const duration = input.durationMs ?? 2600;
      setToasts((current) => [{ ...input, id }, ...current].slice(0, 4));

      const exitTimer = window.setTimeout(
        () => {
          setToasts((current) =>
            current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast))
          );
        },
        Math.max(0, duration - 180)
      );
      const removeTimer = window.setTimeout(() => dismiss(id), duration);
      timeoutsRef.current.add(exitTimer);
      timeoutsRef.current.add(removeTimer);
    },
    [dismiss]
  );

  React.useEffect(() => subscribeToToasts(enqueue), [enqueue]);
  React.useEffect(
    () => () => {
      for (const timeout of timeoutsRef.current) window.clearTimeout(timeout);
      timeoutsRef.current.clear();
    },
    []
  );

  const value = React.useMemo<ToastContextValue>(() => ({ toast: publishToast }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        aria-relevant="additions text"
        className="pointer-events-none fixed bottom-[calc(7.25rem+env(safe-area-inset-bottom))] right-hh-3 z-[250] flex w-[min(340px,calc(100vw-1.5rem))] flex-col gap-hh-2 sm:bottom-hh-4 sm:right-hh-4"
      >
        {toasts.map((toast) => {
          const presentation = variantPresentation[normalizedVariant(toast.variant)];
          const Icon = presentation.Icon;
          const content = (
            <>
              <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={cn("block", TYPO.bodyStrong)}>{toast.title}</span>
                {toast.description ? (
                  <span className={cn("mt-hh-1 block text-current opacity-85", TYPO.helper)}>
                    {toast.description}
                  </span>
                ) : null}
              </span>
            </>
          );

          return (
            <div
              key={toast.id}
              data-toast="true"
              aria-label={`${presentation.label}: ${toast.title}`}
              className={cn(
                "pointer-events-auto flex min-h-hh-touch items-start gap-hh-2 rounded-hh-standard border px-hh-3 py-hh-2 shadow-floating",
                presentation.className,
                toast.exiting ? "animate-toast-out" : "animate-toast-in",
                "motion-reduce:animate-none"
              )}
            >
              {toast.onClick ? (
                <button
                  type="button"
                  className="hh-focus-ring hh-touch-min flex min-w-0 flex-1 items-start gap-hh-2 rounded-hh-compact text-left"
                  onClick={() => {
                    toast.onClick?.();
                    dismiss(toast.id);
                  }}
                >
                  {content}
                </button>
              ) : (
                content
              )}
              <button
                type="button"
                className="hh-focus-ring hh-touch-square -mr-hh-1 flex h-hh-control-compact w-hh-control-compact shrink-0 items-center justify-center rounded-hh-compact text-current opacity-70 hover:bg-[var(--hh-l3-hover)] hover:opacity-100"
                onClick={() => dismiss(toast.id)}
                aria-label={`Dismiss ${presentation.label.toLowerCase()} notification`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
