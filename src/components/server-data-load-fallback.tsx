"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorRetry, LoadingState } from "@/components/ui/system-state";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="min-h-[40vh] p-6">
      {pending ? (
        <LoadingState text="Loading data…" />
      ) : (
        <ErrorRetry
          retryLabel="Retry"
          onRetry={() => startTransition(() => router.refresh())}
          title="Unable to load data"
          description={message}
          action={
            <Button asChild variant="secondary">
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
