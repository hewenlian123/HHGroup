import { OS } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function LoadingState({
  text = "Loading...",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        OS.emptyState,
        "px-4 py-8 text-center text-sm text-[var(--neo-text-secondary)]",
        className
      )}
      role="status"
    >
      {text}
    </div>
  );
}
