import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorRetry } from "@/components/ui/system-state";

/** Minimal full-page fallback when a server route cannot load required data (avoids error boundary). */
export function ServerDataLoadFallback({
  message,
  backHref,
  backLabel = "Back",
}: {
  message: string;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-[40vh] p-6">
      <ErrorRetry
        title="Unable to load data"
        description={message}
        action={
          <Button asChild variant="secondary">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      />
    </div>
  );
}
