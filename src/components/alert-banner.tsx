import { cn } from "@/lib/utils";

export function AlertBanner({
  variant = "amber",
  message,
  className,
}: {
  variant?: "red" | "amber";
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm font-bold",
        variant === "red" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300",
        variant === "amber" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
        className
      )}
    >
      {message}
    </div>
  );
}
