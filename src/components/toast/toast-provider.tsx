"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "system";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  /** When set, the toast is clickable and navigates or runs this action. */
  onClick?: () => void;
};

type ToastRecord = ToastInput & {
  id: string;
  createdAt: number;
  onClick?: () => void;
  exiting?: boolean;
};

type ToastContextValue = {
  toast: (t: ToastInput) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

function variantClasses(v: ToastVariant) {
  switch (v) {
    case "success":
      return "border-[#DCFCE7] bg-[#DCFCE7] text-[#166534] dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-50";
    case "error":
      return "border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-50";
    case "system":
      return "border-[rgb(184_147_90_/_0.28)] bg-[rgb(16_22_31_/_0.94)] text-[#f3f4f5] shadow-[0_18px_48px_rgb(0_0_0_/_0.28)] backdrop-blur-xl";
    default:
      return "border-zinc-200 bg-background text-foreground dark:border-border";
  }
}

function variantDescriptionClasses(v: ToastVariant) {
  if (v === "system") return "text-[#c4c9cf]";
  return "text-muted-foreground";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const toast = React.useCallback((t: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rec: ToastRecord = {
      id,
      createdAt: Date.now(),
      variant: t.variant ?? "default",
      durationMs: t.durationMs ?? 2000,
      title: t.title,
      description: t.description,
      onClick: t.onClick,
    };
    setToasts((prev) => [rec, ...prev].slice(0, 4));

    const total = rec.durationMs ?? 2000;
    const exitLead = Math.max(0, total - 180);
    window.setTimeout(() => {
      setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, exiting: true } : x)));
    }, exitLead);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, total);
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-[calc(7.25rem+env(safe-area-inset-bottom))] right-3 z-50 flex w-[min(264px,calc(100vw-1.5rem))] flex-col gap-2 sm:bottom-4 sm:right-4 sm:w-[340px]">
        {toasts.map((t) => {
          const Wrapper = t.onClick ? "button" : "div";
          const variant = t.variant ?? "default";
          return (
            <Wrapper
              key={t.id}
              type={t.onClick ? "button" : undefined}
              onClick={t.onClick}
              className={cn(
                "pointer-events-auto w-full rounded-md border px-3 py-2 text-left shadow-[var(--shadow-1)] will-change-transform",
                variantClasses(variant),
                variant === "system" &&
                  "max-sm:rounded-lg max-sm:bg-[rgb(18_22_27_/_0.92)] max-sm:px-2.5 max-sm:py-1.5 max-sm:shadow-[0_10px_30px_rgb(0_0_0_/_0.22)]",
                t.onClick && !t.exiting && "cursor-pointer hover:opacity-90",
                t.exiting ? "animate-toast-out" : "animate-toast-in"
              )}
              role="status"
              aria-live="polite"
            >
              <div
                className={cn(
                  "text-sm font-medium",
                  variant === "system" && "max-sm:text-[13px] max-sm:leading-4"
                )}
              >
                {t.title}
              </div>
              {t.description ? (
                <div
                  className={cn(
                    "mt-0.5 text-sm",
                    variantDescriptionClasses(variant),
                    variant === "system" && "max-sm:mt-0 max-sm:text-xs max-sm:leading-4"
                  )}
                >
                  {t.description}
                </div>
              ) : null}
            </Wrapper>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
