import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** When `false`, renders nothing (use inside buttons with stable layout). Omit or `true` shows the spinner. */
  loading?: boolean;
  "aria-hidden"?: boolean;
};

/** Small inline spinner for submit buttons (pairs with `disabled={busy}`). */
export function SubmitSpinner({ className, loading, ...props }: Props) {
  if (loading === false) return null;
  return (
    <Loader2
      className={cn("h-3.5 w-3.5 shrink-0 animate-spin", className)}
      aria-hidden={props["aria-hidden"] ?? true}
    />
  );
}
