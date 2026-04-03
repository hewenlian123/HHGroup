"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error";

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
    default:
      return "border-zinc-200 bg-background text-foreground dark:border-border";
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const toast = React.useCallback((t: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rec: ToastRecord = {
      id,
      createdAt: Date.now(),
      variant: t.variant ?? "default",
      durationMs: t.durationMs ?? 4000,
      title: t.title,
      description: t.description,
      onClick: t.onClick,
    };
    setToasts((prev) => [rec, ...prev].slice(0, 4));

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, rec.durationMs);
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const Wrapper = t.onClick ? "button" : "div";
          return (
            <Wrapper
              key={t.id}
              type={t.onClick ? "button" : undefined}
              onClick={t.onClick}
              className={cn(
                "pointer-events-auto w-full rounded-md border px-3 py-2 text-left shadow-[var(--shadow-1)]",
                variantClasses(t.variant ?? "default"),
                t.onClick && "cursor-pointer hover:opacity-90"
              )}
              role="status"
              aria-live="polite"
            >
              <div className="text-sm font-medium">{t.title}</div>
              {t.description ? (
                <div className="mt-0.5 text-sm text-muted-foreground">{t.description}</div>
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
