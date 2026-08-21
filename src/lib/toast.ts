export type ToastVariant = "default" | "success" | "warning" | "information" | "error" | "system";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  /** Optional safe action owned by the caller; presentation remains canonical. */
  onClick?: () => void;
};

type ToastListener = (input: ToastInput) => void;

const listeners = new Set<ToastListener>();

export function publishToast(input: ToastInput) {
  for (const listener of listeners) listener(input);
}

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One app-facing imperative adapter for legacy and non-hook callers. */
export const toast = {
  success: (title: string, description?: string) =>
    publishToast({ title, description, variant: "success" }),
  warning: (title: string, description?: string) =>
    publishToast({ title, description, variant: "warning" }),
  information: (title: string, description?: string) =>
    publishToast({ title, description, variant: "information" }),
  error: (title: string, description?: string, durationMs?: number) =>
    publishToast({ title, description, durationMs, variant: "error" }),
  message: (title: string, description?: string) => publishToast({ title, description }),
};
