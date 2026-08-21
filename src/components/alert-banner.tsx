import { InlineFeedback } from "@/components/ui/feedback";

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
    <InlineFeedback
      title={message}
      tone={variant === "red" ? "danger" : "warning"}
      className={className}
    />
  );
}
